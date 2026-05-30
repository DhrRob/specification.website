/**
 * Cloudflare Pages Function — checklist auditor API endpoint.
 *
 * Receives a domain parameter, performs concurrent fetches and DNS-over-HTTPS queries,
 * and returns a JSON report outlining compliance with automatable checklist items.
 */

type CheckResult = {
  slug: string;
  result: 'pass' | 'fail' | 'warning' | 'manual';
  message: string;
  details?: string;
};

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 SpecAuditor/1.0';

export const onRequest: PagesFunction = async (context) => {
  const corsHeaders = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });

  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const requestUrl = new URL(context.request.url);
  let domain = requestUrl.searchParams.get('domain') ?? '';
  domain = domain.trim().toLowerCase();

  if (!domain) {
    return new Response(JSON.stringify({ error: 'Missing domain parameter' }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  // Clean the domain input
  domain = domain.replace(/^(https?:\/\/)?(www\.)?/, '');
  // Remove any trailing path/slashes
  domain = domain.split('/')[0];

  // Validate hostname structure
  const hostRegex = /^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]*[a-zA-Z0-9])\.)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9\-]*[A-Za-z0-9])$/;
  if (!hostRegex.test(domain) || !domain.includes('.')) {
    return new Response(JSON.stringify({ error: 'Invalid domain format' }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  try {
    const results: CheckResult[] = [];

    // Helper for timeout-capped fetches
    const fetchWithTimeout = async (url: string, init: RequestInit = {}, timeoutMs = 6000) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, {
          ...init,
          signal: controller.signal,
          headers: {
            'User-Agent': USER_AGENT,
            ...(init.headers || {}),
          },
        });
        clearTimeout(timeoutId);
        return response;
      } catch (err) {
        clearTimeout(timeoutId);
        throw err;
      }
    };

    // 1. Run HTTP -> HTTPS redirect check
    let httpRedirectPass = false;
    let redirectMessage = 'HTTP does not redirect to HTTPS.';
    try {
      const httpRes = await fetchWithTimeout(`http://${domain}`, { redirect: 'manual' });
      const status = httpRes.status;
      const location = httpRes.headers.get('location') || '';
      if (status >= 300 && status < 400 && location.startsWith('https://')) {
        httpRedirectPass = true;
        redirectMessage = `Redirects HTTP to HTTPS (${status} to ${location}).`;
      } else {
        redirectMessage = `HTTP returned status ${status} but did not redirect to HTTPS. Location: ${location || 'none'}`;
      }
    } catch (e: any) {
      redirectMessage = `Could not connect to HTTP version: ${e.message || e}`;
    }

    results.push({
      slug: 'https-tls',
      result: httpRedirectPass ? 'pass' : 'fail',
      message: redirectMessage,
    });

    // 2. Fetch primary page (HTTPS) and read headers/HTML
    const rootUrl = `https://${domain}`;
    let mainPageHtml = '';
    let mainHeaders = new Headers();
    let rootFetchSuccess = false;
    let rootFetchErrorMsg = '';

    try {
      const res = await fetchWithTimeout(rootUrl, { redirect: 'follow' });
      rootFetchSuccess = true;
      mainHeaders = res.headers;
      mainPageHtml = await res.text();
    } catch (e: any) {
      rootFetchErrorMsg = e.message || String(e);
    }

    if (!rootFetchSuccess) {
      return new Response(
        JSON.stringify({
          domain,
          error: `Could not connect to ${rootUrl}: ${rootFetchErrorMsg}`,
          results: [
            {
              slug: 'https-tls',
              result: 'fail',
              message: `Could not connect to HTTPS version of site: ${rootFetchErrorMsg}`,
            },
          ],
        }),
        { headers: corsHeaders }
      );
    }

    // --- SECURITY HEADER CHECKS ---
    // HSTS
    const hsts = mainHeaders.get('strict-transport-security');
    results.push({
      slug: 'hsts',
      result: hsts ? 'pass' : 'fail',
      message: hsts ? `HSTS header set: ${hsts}` : 'Strict-Transport-Security header is missing.',
    });

    // X-Content-Type-Options
    const xcto = mainHeaders.get('x-content-type-options');
    const xctoPass = xcto && xcto.toLowerCase().includes('nosniff');
    results.push({
      slug: 'x-content-type-options',
      result: xctoPass ? 'pass' : 'fail',
      message: xctoPass ? 'X-Content-Type-Options set to nosniff.' : `Header value is: ${xcto || 'missing'}.`,
    });

    // Content Security Policy
    const cspHeader = mainHeaders.get('content-security-policy') || mainHeaders.get('content-security-policy-report-only');
    const hasCspMeta = /<meta\s+http-equiv=["']Content-Security-Policy["']/i.test(mainPageHtml);
    results.push({
      slug: 'content-security-policy',
      result: (cspHeader || hasCspMeta) ? 'pass' : 'fail',
      message: cspHeader
        ? `CSP header present: ${cspHeader.substring(0, 60)}...`
        : hasCspMeta
        ? 'CSP defined via <meta http-equiv="...">.'
        : 'No CSP header or meta tag found.',
    });

    // Referrer Policy
    const refHeader = mainHeaders.get('referrer-policy');
    const hasRefMeta = /<meta\s+name=["']referrer["']/i.test(mainPageHtml);
    results.push({
      slug: 'referrer-policy',
      result: (refHeader || hasRefMeta) ? 'pass' : 'fail',
      message: refHeader
        ? `Referrer-Policy header present: ${refHeader}`
        : hasRefMeta
        ? 'Referrer policy defined via <meta name="referrer">.'
        : 'Referrer policy not specified.',
    });

    // Permissions Policy
    const permHeader = mainHeaders.get('permissions-policy');
    results.push({
      slug: 'permissions-policy',
      result: permHeader ? 'pass' : 'warning',
      message: permHeader ? `Permissions-Policy present: ${permHeader.substring(0, 60)}...` : 'Permissions-Policy header is missing (recommended).',
    });

    // Frame Ancestors / X-Frame-Options
    const xfo = mainHeaders.get('x-frame-options');
    const hasCspFrameAncestors = cspHeader && cspHeader.includes('frame-ancestors');
    results.push({
      slug: 'frame-ancestors',
      result: (xfo || hasCspFrameAncestors) ? 'pass' : 'fail',
      message: hasCspFrameAncestors
        ? 'CSP frame-ancestors directive present.'
        : xfo
        ? `X-Frame-Options header present: ${xfo}`
        : 'Frame protection header (X-Frame-Options or CSP frame-ancestors) is missing.',
    });

    // --- HTML FOUNDATIONS CHECKS ---
    // Doctype
    const doctypeRegex = /^\s*<!doctype\s+html/i;
    const hasDoctype = doctypeRegex.test(mainPageHtml);
    results.push({
      slug: 'doctype',
      result: hasDoctype ? 'pass' : 'fail',
      message: hasDoctype ? 'Modern HTML5 doctype declaration found at the start.' : 'HTML5 doctype (<!doctype html>) is missing or malformed.',
    });

    // HTML Lang
    const langMatch = mainPageHtml.match(/<html[^>]*lang=["']([a-zA-Z-]+)["']/i);
    results.push({
      slug: 'html-lang',
      result: langMatch ? 'pass' : 'fail',
      message: langMatch ? `Language attribute found: lang="${langMatch[1]}"` : 'lang attribute is missing on the <html> tag.',
    });

    // Character Encoding
    const charsetMatch = mainPageHtml.match(/<meta[^>]*charset=["']?utf-8["']?/i) || mainPageHtml.match(/<meta[^>]+http-equiv=["']content-type["'][^>]*content=["'][^"']*charset=utf-8["']/i);
    results.push({
      slug: 'character-encoding',
      result: charsetMatch ? 'pass' : 'fail',
      message: charsetMatch ? 'UTF-8 character encoding declared.' : 'UTF-8 character encoding meta tag not found.',
    });

    // Viewport
    const viewportMatch = mainPageHtml.match(/<meta[^>]+name=["']viewport["']/i);
    results.push({
      slug: 'viewport',
      result: viewportMatch ? 'pass' : 'fail',
      message: viewportMatch ? 'Viewport meta tag found for responsive layouts.' : 'Viewport meta tag is missing.',
    });

    // Canonical URLs
    const canonicalMatch = mainPageHtml.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i);
    results.push({
      slug: 'canonical-urls',
      result: canonicalMatch ? 'pass' : 'fail',
      message: canonicalMatch ? `Canonical URL link tag found pointing to: ${canonicalMatch[1]}` : 'Canonical link tag is missing.',
    });

    // Favicon Link Tag Check
    const faviconMatch = mainPageHtml.match(/<link[^>]+rel=["'](?:shortcut )?icon["']/i);
    let favIconPass = !!faviconMatch;
    let faviconMessage = favIconPass ? 'Favicon reference found in HTML.' : '';

    if (!favIconPass) {
      try {
        const favRes = await fetchWithTimeout(`${rootUrl}/favicon.ico`, { method: 'HEAD' });
        if (favRes.status === 200) {
          favIconPass = true;
          faviconMessage = 'Favicon found at root /favicon.ico (200 OK).';
        } else {
          faviconMessage = 'No favicon link tag in HTML and /favicon.ico returned status ' + favRes.status;
        }
      } catch (e) {
        faviconMessage = 'No favicon link tag in HTML and check on /favicon.ico failed.';
      }
    }

    results.push({
      slug: 'favicons',
      result: favIconPass ? 'pass' : 'fail',
      message: faviconMessage,
    });

    // --- SEO CHECKS ---
    // Title Tags
    const titleMatch = mainPageHtml.match(/<title>([\s\S]*?)<\/title>/i);
    const titleVal = titleMatch ? titleMatch[1].trim() : '';
    results.push({
      slug: 'title-tags',
      result: titleVal ? 'pass' : 'fail',
      message: titleVal ? `Title tag present: "${titleVal}" (length: ${titleVal.length})` : 'Title tag is missing or empty.',
    });

    // Meta Descriptions
    const descMatch = mainPageHtml.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i) || mainPageHtml.match(/<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i);
    const descVal = descMatch ? descMatch[1].trim() : '';
    results.push({
      slug: 'meta-descriptions',
      result: descVal ? 'pass' : 'warning',
      message: descVal ? `Description meta tag present: "${descVal.substring(0, 60)}..." (length: ${descVal.length})` : 'Description meta tag is missing (recommended).',
    });

    // Meta Robots
    const metaRobMatch = mainPageHtml.match(/<meta[^>]+name=["']robots["'][^>]*content=["']([^"']*)["']/i);
    results.push({
      slug: 'meta-robots',
      result: metaRobMatch ? 'pass' : 'warning',
      message: metaRobMatch ? `robots meta tag present: "${metaRobMatch[1]}"` : 'robots meta tag is missing (recommended to guide crawlers).',
    });

    // Open Graph
    const ogTitle = mainPageHtml.match(/<meta[^>]+(property|name)=["']og:title["']/i);
    const ogImage = mainPageHtml.match(/<meta[^>]+(property|name)=["']og:image["']/i);
    const hasOG = ogTitle && ogImage;
    results.push({
      slug: 'open-graph',
      result: hasOG ? 'pass' : 'warning',
      message: hasOG ? 'Open Graph protocol metadata found.' : 'og:title and/or og:image are missing.',
    });

    // Twitter Cards
    const twitterCard = mainPageHtml.match(/<meta[^>]+(property|name)=["']twitter:card["']/i);
    results.push({
      slug: 'twitter-cards',
      result: twitterCard ? 'pass' : 'warning',
      message: twitterCard ? 'Twitter card metadata found.' : 'twitter:card tag is missing.',
    });

    // Heading Hierarchy
    const h1Count = (mainPageHtml.match(/<h1[\s>]/gi) || []).length;
    results.push({
      slug: 'heading-hierarchy',
      result: h1Count === 1 ? 'pass' : 'warning',
      message: h1Count === 1 ? 'Exactly one <h1> tag found.' : `Found ${h1Count} <h1> tags (exactly one is recommended).`,
    });

    // Breadcrumbs Structured Data
    const hasBreadcrumbs = mainPageHtml.includes('BreadcrumbList') || mainPageHtml.includes('schema.org/Breadcrumb') || /<nav[^>]*aria-label=["']breadcrumb["']/i.test(mainPageHtml);
    results.push({
      slug: 'breadcrumbs',
      result: hasBreadcrumbs ? 'pass' : 'warning',
      message: hasBreadcrumbs ? 'Breadcrumb structured data or navigation element found.' : 'No breadcrumbs structured data or breadcrumb navigation identified.',
    });

    // Structured Data
    const hasJsonLd = /<script[^>]+type=["']application\/ld\+json["']/i.test(mainPageHtml);
    results.push({
      slug: 'structured-data',
      result: hasJsonLd ? 'pass' : 'warning',
      message: hasJsonLd ? 'JSON-LD structured data block found.' : 'JSON-LD structured data is missing.',
    });

    // --- NEW CHECKS ---
    
    // ACCESSIBILITY
    // image-alt-text
    const imgRegex = /<img\s+[^>]*>/gi;
    const images = mainPageHtml.match(imgRegex) || [];
    let altMissing = 0;
    let altEmpty = 0;
    for (const img of images) {
      if (!/alt\s*=/i.test(img)) {
        altMissing++;
      } else if (/alt\s*=\s*["']\s*["']/i.test(img)) {
        altEmpty++;
      }
    }
    let altResult: 'pass' | 'fail' = 'pass';
    let altMsg = '';
    if (images.length === 0) {
      altMsg = 'No images found on the main page.';
    } else if (altMissing > 0) {
      altResult = 'fail';
      altMsg = `Found ${images.length} images; ${altMissing} are missing alt attributes (essential for screen readers).`;
    } else {
      altMsg = `Found ${images.length} images, all containing alt attributes${altEmpty > 0 ? ` (${altEmpty} empty/decorative)` : ''}.`;
    }
    results.push({ slug: 'image-alt-text', result: altResult, message: altMsg });

    // aria-usage
    const hasAria = /aria-[a-z]+=/i.test(mainPageHtml) || /role=/i.test(mainPageHtml);
    results.push({
      slug: 'aria-usage',
      result: hasAria ? 'pass' : 'warning',
      message: hasAria ? 'Found ARIA accessibility attributes or roles.' : 'No ARIA attributes or roles found (recommended for interactive elements).',
    });

    // skip-links
    const hasSkipLink = /href\s*=\s*["']#[^"']*["']/i.test(mainPageHtml) && /skip/i.test(mainPageHtml);
    results.push({
      slug: 'skip-links',
      result: hasSkipLink ? 'pass' : 'warning',
      message: hasSkipLink ? 'Skip link (skip to content) detected in HTML.' : 'No skip link matching "skip" found (recommended for keyboard navigation).',
    });

    // document-language
    results.push({
      slug: 'document-language',
      result: langMatch ? 'pass' : 'fail',
      message: langMatch ? `HTML lang attribute is correctly declared: lang="${langMatch[1]}"` : 'HTML lang attribute is missing (essential for screen readers).',
    });

    // PERFORMANCE
    // compression
    const contentEncoding = mainHeaders.get('content-encoding') || mainHeaders.get('x-encoded-content-encoding');
    results.push({
      slug: 'compression',
      result: contentEncoding ? 'pass' : 'warning',
      message: contentEncoding ? `Compression enabled: ${contentEncoding}` : 'Content-Encoding header not visible in HTML request response (standard for CDN-served pages, verify server configuration).',
    });

    // cache-control
    const cacheControl = mainHeaders.get('cache-control');
    results.push({
      slug: 'cache-control',
      result: cacheControl ? 'pass' : 'warning',
      message: cacheControl ? `Cache-Control header present: ${cacheControl}` : 'Cache-Control header is missing on the main document.',
    });

    // http3
    const altSvc = mainHeaders.get('alt-svc');
    const supportsH3 = altSvc && altSvc.includes('h3');
    results.push({
      slug: 'http3',
      result: supportsH3 ? 'pass' : 'warning',
      message: supportsH3 ? `HTTP/3 supported (Alt-Svc: ${altSvc.substring(0, 50)}...).` : 'Alt-Svc header for HTTP/3 not returned in standard GET headers.',
    });

    // lazy-loading
    const hasLazy = /loading\s*=\s*["']lazy["']/i.test(mainPageHtml);
    results.push({
      slug: 'lazy-loading',
      result: hasLazy ? 'pass' : 'warning',
      message: hasLazy ? 'Detected loading="lazy" attributes on media.' : 'No elements found with loading="lazy" (recommended for performance).',
    });

    // preload-prefetch-preconnect
    const hasPreload = /rel\s*=\s*["'](?:preload|prefetch|preconnect)["']/i.test(mainPageHtml);
    results.push({
      slug: 'preload-prefetch-preconnect',
      result: hasPreload ? 'pass' : 'warning',
      message: hasPreload ? 'Resource links using preload, prefetch, or preconnect detected.' : 'No preload, prefetch, or preconnect link elements found.',
    });

    // resource-hints
    const hasHints = /rel\s*=\s*["'](?:dns-prefetch|preconnect)["']/i.test(mainPageHtml);
    results.push({
      slug: 'resource-hints',
      result: hasHints ? 'pass' : 'warning',
      message: hasHints ? 'DNS prefetch or preconnect resource hints detected.' : 'No DNS-prefetch or preconnect hints found.',
    });

    // speculation-rules
    const hasSpecRules = /<script\s+[^>]*type=["']speculationrules["']/i.test(mainPageHtml);
    results.push({
      slug: 'speculation-rules',
      result: hasSpecRules ? 'pass' : 'warning',
      message: hasSpecRules ? 'Speculation Rules API script block detected.' : 'Speculation Rules script block is missing (optional speedup).',
    });

    // view-transitions
    const hasViewTrans = /<meta\s+name=["']view-transition["']/i.test(mainPageHtml) || /@view-transition/i.test(mainPageHtml);
    results.push({
      slug: 'view-transitions',
      result: hasViewTrans ? 'pass' : 'warning',
      message: hasViewTrans ? 'View Transitions API integration detected.' : 'View Transitions API declarations not found.',
    });

    // PRIVACY
    // privacy-policy
    const privacyRegex = /href\s*=\s*["'][^"']*privacy[^"']*["']/i;
    const hasPrivacyLink = privacyRegex.test(mainPageHtml) || /privacy/i.test(mainPageHtml.replace(/<[^>]+>/g, ''));
    results.push({
      slug: 'privacy-policy',
      result: hasPrivacyLink ? 'pass' : 'fail',
      message: hasPrivacyLink ? 'Found references or links to a Privacy Policy.' : 'No privacy policy link or references identified in the homepage HTML.',
    });

    // third-party-scripts
    const scriptSrcs = [...mainPageHtml.matchAll(/<script\s+[^>]*src=["']([^"']+)["']/gi)].map(m => m[1]);
    const thirdParty = scriptSrcs.filter(src => {
      try {
        if (src.startsWith('//')) return true;
        if (src.startsWith('http://') || src.startsWith('https://')) {
          const parsed = new URL(src);
          return !parsed.hostname.endsWith(domain);
        }
        return false;
      } catch (e) {
        return false;
      }
    });
    results.push({
      slug: 'third-party-scripts',
      result: thirdParty.length === 0 ? 'pass' : 'warning',
      message: thirdParty.length === 0
        ? 'No third-party scripts detected.'
        : `Detected ${thirdParty.length} third-party scripts: ${thirdParty.slice(0, 3).join(', ')}${thirdParty.length > 3 ? '...' : ''}`,
    });

    // RESILIENCE
    // pwa-manifest
    const hasManifest = /<link\s+[^>]*rel=["']manifest["']/i.test(mainPageHtml);
    results.push({
      slug: 'pwa-manifest',
      result: hasManifest ? 'pass' : 'warning',
      message: hasManifest ? 'PWA Web App Manifest link tag found.' : 'PWA Web App Manifest link is missing.',
    });

    // offline-support
    const hasServiceWorker = /serviceWorker\.register/i.test(mainPageHtml) || /\.serviceWorker/i.test(mainPageHtml);
    results.push({
      slug: 'offline-support',
      result: hasServiceWorker ? 'pass' : 'warning',
      message: hasServiceWorker ? 'References to Service Worker registration found.' : 'No Service Worker registration detected.',
    });

    // INTERNATIONALISATION
    // hreflang
    const hasHreflang = /hreflang\s*=/i.test(mainPageHtml);
    results.push({
      slug: 'hreflang',
      result: hasHreflang ? 'pass' : 'warning',
      message: hasHreflang ? 'Hreflang alternative language links found.' : 'No hreflang alternative language attributes found.',
    });

    // idn-support
    const isIdn = domain.startsWith('xn--') || /[^\x00-\x7F]/.test(domain);
    results.push({
      slug: 'idn-support',
      result: 'pass',
      message: isIdn ? `Domain is an Internationalized Domain Name (IDN): ${domain}` : 'Domain is a standard ASCII domain; IDN punycode handling is not required.',
    });

    // lang-attribute
    results.push({
      slug: 'lang-attribute',
      result: langMatch ? 'pass' : 'fail',
      message: langMatch ? `HTML lang attribute set to "${langMatch[1]}".` : 'HTML lang attribute is missing.',
    });

    // rtl-support
    const hasRtl = /dir\s*=\s*["']rtl["']/i.test(mainPageHtml) || /direction\s*:\s*rtl/i.test(mainPageHtml);
    results.push({
      slug: 'rtl-support',
      result: hasRtl ? 'pass' : 'warning',
      message: hasRtl ? 'RTL (right-to-left) reading direction support elements/styles detected.' : 'RTL reading direction attributes or styles not found.',
    });


    // --- CONCURRENT FETCH CHECKS (robots.txt, security.txt, well-known URIs, agents, GPC) ---
    const fileChecks = [
      { slug: 'robots-txt', url: `${rootUrl}/robots.txt` },
      { slug: 'security-txt', url: `${rootUrl}/.well-known/security.txt` },
      { slug: 'change-password', url: `${rootUrl}/.well-known/change-password`, manualRedirect: true },
      { slug: 'llms-txt', url: `${rootUrl}/llms.txt` },
      { slug: 'apple-app-site-association', url: `${rootUrl}/.well-known/apple-app-site-association` },
      { slug: 'assetlinks-json', url: `${rootUrl}//.well-known/assetlinks.json` },
      { slug: 'nodeinfo', url: `${rootUrl}/.well-known/nodeinfo` },
      { slug: 'openid-configuration', url: `${rootUrl}/.well-known/openid-configuration` },
      { slug: 'webfinger', url: `${rootUrl}/.well-known/webfinger` },
      { slug: 'api-catalog', url: `${rootUrl}/.well-known/api-catalog` },
      { slug: 'global-privacy-control', url: `${rootUrl}/.well-known/gpc.json` },
    ];

    const fileResults = await Promise.all(
      fileChecks.map(async (fileCheck) => {
        try {
          const init = fileCheck.manualRedirect ? { redirect: 'manual' as RequestRedirect } : {};
          const res = await fetchWithTimeout(fileCheck.url, init, 5000);
          
          if (fileCheck.slug === 'change-password') {
            const status = res.status;
            const isRedirect = status >= 300 && status < 400;
            return {
              slug: fileCheck.slug,
              result: isRedirect ? 'pass' : 'warning',
              message: isRedirect
                ? `Endpoint redirects as required (${status} redirect).`
                : `Endpoint returned HTTP status ${status} but did not redirect. (Note: Only applicable if site has user logins).`,
            };
          }

          if (res.status === 200) {
            let details = '';
            if (fileCheck.slug === 'robots-txt') {
              const text = await res.text();
              const hasSitemap = /sitemap:/i.test(text);
              details = hasSitemap ? 'Sitemap reference found in robots.txt.' : 'No Sitemap reference in robots.txt.';
            }
            return {
              slug: fileCheck.slug,
              result: 'pass' as const,
              message: `Endpoint found (HTTP 200). ${details}`,
            };
          } else if (fileCheck.slug === 'webfinger' && res.status === 400) {
            return {
              slug: fileCheck.slug,
              result: 'pass' as const,
              message: 'Endpoint found (returned HTTP 400 Bad Request which is normal without query parameters).',
            };
          } else {
            return {
              slug: fileCheck.slug,
              result: 'warning' as const,
              message: `Endpoint returned HTTP status ${res.status}. (Optional).`,
            };
          }
        } catch (e: any) {
          return {
            slug: fileCheck.slug,
            result: 'warning' as const,
            message: `Could not fetch: ${e.message || e}. (Optional).`,
          };
        }
      })
    );

    // Merge in file check results
    results.push(...fileResults);

    // XML Sitemaps
    const robotsTxtRes = fileResults.find(r => r.slug === 'robots-txt');
    const robotsHasSitemap = robotsTxtRes?.message.includes('Sitemap reference found');
    let sitemapPass = !!robotsHasSitemap;
    let sitemapMsg = robotsHasSitemap ? 'Sitemap referenced in robots.txt.' : 'Sitemap not referenced in robots.txt.';

    if (!sitemapPass) {
      try {
        const smRes = await fetchWithTimeout(`${rootUrl}/sitemap.xml`, { method: 'HEAD' });
        if (smRes.status === 200) {
          sitemapPass = true;
          sitemapMsg = 'Sitemap found at /sitemap.xml.';
        } else {
          sitemapMsg = 'No sitemap found at /sitemap.xml or mentioned in robots.txt.';
        }
      } catch (e) {
        sitemapMsg = 'Failed to check /sitemap.xml, and no reference found in robots.txt.';
      }
    }

    results.push({
      slug: 'xml-sitemaps',
      result: sitemapPass ? 'pass' : 'fail',
      message: sitemapMsg,
    });

    // security.txt check fallback
    const secWellKnownRes = fileResults.find(r => r.slug === 'security-txt');
    if (secWellKnownRes && secWellKnownRes.result !== 'pass') {
      try {
        const secRes = await fetchWithTimeout(`${rootUrl}/security.txt`);
        if (secRes.status === 200) {
          const idx = results.findIndex(r => r.slug === 'security-txt');
          if (idx !== -1) {
            results[idx] = {
              slug: 'security-txt',
              result: 'pass',
              message: 'Endpoint found at fallback /security.txt (HTTP 200).',
            };
          }
        }
      } catch (e) {}
    }

    // WebMCP check
    const hasWebMcp = mainPageHtml.includes('webmcp.js') || mainPageHtml.includes('modelContext') || mainPageHtml.includes('navigator.modelContext');
    results.push({
      slug: 'webmcp',
      result: hasWebMcp ? 'pass' : 'warning',
      message: hasWebMcp ? 'WebMCP JavaScript integration found.' : 'WebMCP integration not detected in HTML (recommended for agent readiness).',
    });

    // --- OTHER CONCURRENT ENDPOINT CHECKS (Error page testing) ---
    let errorPagesPass = false;
    let errorPagesMsg = '';
    try {
      const errRes = await fetchWithTimeout(`${rootUrl}/nonexistent-page-404-check-${Math.floor(Math.random() * 100000)}`, { method: 'GET' });
      if (errRes.status === 404) {
        errorPagesPass = true;
        errorPagesMsg = 'Server returned a correct 404 Not Found status code for non-existent paths.';
      } else {
        errorPagesMsg = `Server returned status ${errRes.status} instead of 404 for a non-existent path.`;
      }
    } catch (e: any) {
      errorPagesMsg = `Could not verify 404 behavior: ${e.message || e}`;
    }
    results.push({
      slug: 'error-pages',
      result: errorPagesPass ? 'pass' : 'warning',
      message: errorPagesMsg,
    });

    // --- DNS LOOKUP CHECKS ---
    let caaPass = false;
    let caaMsg = 'No CAA DNS records found (recommended).';
    try {
      const dnsRes = await fetchWithTimeout(`https://cloudflare-dns.com/dns-query?name=${domain}&type=CAA`, {
        headers: { 'Accept': 'application/dns-json' },
      });
      const dnsData: any = await dnsRes.json();
      if (dnsData.Answer && dnsData.Answer.length > 0) {
        caaPass = true;
        caaMsg = `CAA DNS records found (${dnsData.Answer.length} records).`;
      }
    } catch (e: any) {
      caaMsg = `Could not query CAA records: ${e.message || e}`;
    }

    results.push({
      slug: 'caa-records',
      result: caaPass ? 'pass' : 'warning',
      message: caaMsg,
    });

    let dnssecPass = false;
    let dnssecMsg = 'DNSSEC signature validation (AD flag) is not active.';
    try {
      const dnsRes = await fetchWithTimeout(`https://cloudflare-dns.com/dns-query?name=${domain}&type=A`, {
        headers: { 'Accept': 'application/dns-json' },
      });
      const dnsData: any = await dnsRes.json();
      if (dnsData.AD) {
        dnssecPass = true;
        dnssecMsg = 'DNSSEC validation succeeded (AD flag is set). Domain is protected.';
      }
    } catch (e: any) {
      dnssecMsg = `Could not query DNSSEC validation: ${e.message || e}`;
    }

    results.push({
      slug: 'dnssec',
      result: dnssecPass ? 'pass' : 'warning',
      message: dnssecMsg,
    });

    return new Response(
      JSON.stringify({
        domain,
        scanTime: new Date().toISOString(),
        results,
      }),
      { headers: corsHeaders }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
};
