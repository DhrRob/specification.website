// Bot / AI-crawler detection and logging.
//
// `logBot()` is called as the first statement of functions/_middleware.ts, so
// it sees every HTML page and .well-known request (static assets are kept
// off the Worker by public/_routes.json). It writes one data point per
// detected agent request to the AGENT_LOG Analytics Engine dataset, which
// the /admin/stats dashboard queries.
//
// Detection uses four signals, in precedence order:
//   1. signature-agent  — Web Bot Auth signed request (strongest)
//   2. ua-match         — User-Agent matches a known crawler pattern
//   3. cf-verified      — Cloudflare verified the bot, but we don't know which
//   4. accept-markdown  — request asked for text/markdown (agent-only on this
//                         site; see the markdown negotiation in _middleware.ts)

// User-Agent substrings of known AI / LLM / search crawlers. Match is
// case-insensitive on the full UA string. Order matters: more specific
// patterns first (e.g. Applebot-Extended before Applebot).
const BOT_UA_MATCHERS: ReadonlyArray<readonly [string, RegExp]> = [
  // OpenAI
  ['GPTBot', /GPTBot/i],
  ['ChatGPT-User', /ChatGPT-User/i],
  ['OAI-SearchBot', /OAI-SearchBot/i],
  // Anthropic
  ['ClaudeBot', /ClaudeBot/i],
  ['Claude-Web', /Claude-Web/i],
  ['Claude-User', /Claude-User/i],
  ['Claude-SearchBot', /Claude-SearchBot/i],
  ['anthropic-ai', /anthropic-ai/i],
  // Perplexity
  ['PerplexityBot', /PerplexityBot/i],
  ['Perplexity-User', /Perplexity-User/i],
  // Google AI / search
  ['Google-Extended', /Google-Extended/i],
  ['GoogleOther', /GoogleOther/i],
  ['Googlebot', /Googlebot/i],
  // Meta
  ['Meta-ExternalAgent', /Meta-ExternalAgent/i],
  ['Meta-ExternalFetcher', /Meta-ExternalFetcher/i],
  ['FacebookBot', /FacebookBot/i],
  // Apple
  ['Applebot-Extended', /Applebot-Extended/i],
  ['Applebot', /Applebot/i],
  // ByteDance
  ['Bytespider', /Bytespider/i],
  // Amazon
  ['Amazonbot', /Amazonbot/i],
  // Common Crawl (training data for many LLMs)
  ['CCBot', /CCBot/i],
  // Cohere
  ['cohere-training-data-crawler', /cohere-training-data-crawler/i],
  ['cohere-ai', /cohere-ai/i],
  // DuckDuckGo
  ['DuckAssistBot', /DuckAssistBot/i],
  // Mistral
  ['MistralAI-User', /MistralAI-User/i],
  // You.com
  ['YouBot', /YouBot/i],
  // Kagi
  ['KagiBot', /KagiBot/i],
  // Webz.io (sells LLM training data)
  ['omgilibot', /omgilibot/i],
  ['omgili', /omgili/i],
  // Diffbot
  ['Diffbot', /Diffbot/i],
  // Allen AI
  ['AI2Bot', /AI2Bot/i],
  // Timpi
  ['Timpibot', /Timpibot/i],
  // NICT (Japan)
  ['ICC-Crawler', /ICC-Crawler/i],
  // Huawei
  ['PetalBot', /PetalBot/i],
  // Imagesift (TheHive)
  ['ImagesiftBot', /ImagesiftBot/i],
  // Search
  ['Bingbot', /Bingbot/i],
  ['YandexBot', /YandexBot/i],
];

export function matchBotName(ua: string | null | undefined): string {
  if (!ua) return '';
  for (const [name, pattern] of BOT_UA_MATCHERS) {
    if (pattern.test(ua)) return name;
  }
  return '';
}

interface BotEnv {
  AGENT_LOG?: AnalyticsEngineDataset;
}

// Logs the request to Analytics Engine if it looks like a bot/agent. Never
// throws — a logging failure must not break the request.
export function logBot(context: { request: Request; env: BotEnv }): void {
  const dataset = context.env.AGENT_LOG;
  if (!dataset) return; // binding not configured (local dev) — silently skip
  try {
    const req = context.request;
    const url = new URL(req.url);
    const path = url.pathname;

    // The remote MCP server lives on mcp.specification.website (a separate
    // Worker) and logs itself to MCP_LOG, so it never reaches this middleware.
    // Skip the local /admin/* dashboard so reading it doesn't pollute the data.
    if (path.startsWith('/admin/')) return;

    // Speculative loads (Speculation Rules: prerender / prefetch) come from a
    // real browser, not a crawler — and they fire on hover, so they'd vastly
    // outnumber real visits if we logged them.
    if ((req.headers.get('sec-purpose') || '').includes('prefetch')) return;

    const cf = (req as Request & { cf?: IncomingRequestCfProperties }).cf;
    const sigAgent = req.headers.get('signature-agent') || '';
    const verified = cf?.verifiedBot ? 'verified' : '';
    const ua = req.headers.get('user-agent') || '';
    const matchedBot = matchBotName(ua);
    const wantsMarkdown = (req.headers.get('accept') || '')
      .toLowerCase()
      .includes('text/markdown');

    if (!sigAgent && !verified && !matchedBot && !wantsMarkdown) return;

    // Precedence: a named identity beats an anonymous one. For anonymous
    // requests (cf-verified or accept-markdown only) we use the raw UA as
    // identity so the dashboard can attribute them, rather than bucketing
    // everything into "markdown-client" / "verified-other".
    let source: string;
    let identity: string;
    if (sigAgent) {
      source = 'signature-agent';
      identity = sigAgent;
    } else if (matchedBot) {
      source = 'ua-match';
      identity = matchedBot;
    } else if (verified) {
      source = 'cf-verified';
      identity = ua.slice(0, 96) || 'verified-other';
    } else {
      source = 'accept-markdown';
      identity = ua.slice(0, 96) || 'markdown-client';
    }

    dataset.writeDataPoint({
      blobs: [
        sigAgent, // blob1
        verified, // blob2
        matchedBot, // blob3
        path, // blob4
        ua.slice(0, 500), // blob5
        req.headers.get('referer') || '', // blob6
        cf?.country || '', // blob7
        req.method, // blob8
        source, // blob9
        wantsMarkdown ? 'markdown' : 'html', // blob10 (requested mime)
      ],
      indexes: [identity],
    });
  } catch {
    // Never break a request because logging failed.
  }
}
