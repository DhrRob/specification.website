export const site = {
  name: 'The Website Specification',
  shortName: 'Website Spec',
  url: 'https://specification.website',
  description:
    'A platform-agnostic, full specification of the technical features a good website should have. Built in the open under an MIT licence.',
  tagline: 'What a good website does, regardless of the stack you build it on.',
  repo: 'https://github.com/jdevalk/specification.website',
  author: {
    name: 'Joost de Valk',
    url: 'https://joost.blog',
    handle: 'jdevalk',
  },
  themeColor: '#15803d',
  themeColorDark: '#0e0e13',
  twitter: '@jdevalk',
  plausibleDomain: 'specification.website',
  plausibleHost: 'https://plausible.io',
  mcp: {
    endpoint: 'https://mcp.specification.website/mcp',
    landing: 'https://mcp.specification.website/',
    serverCard: '/.well-known/mcp/server-card.json',
  },
} as const;

export const categories = [
  {
    slug: 'foundations',
    title: 'Foundations',
    summary: 'The HTML, head, and document basics every page needs.',
    order: 1,
  },
  {
    slug: 'seo',
    title: 'SEO',
    summary: 'Search visibility — robots.txt, sitemaps, canonicals, structured data.',
    order: 2,
  },
  {
    slug: 'accessibility',
    title: 'Accessibility',
    summary: 'WCAG-aligned rules so people of all abilities can use the site.',
    order: 3,
  },
  {
    slug: 'security',
    title: 'Security',
    summary: 'Headers, transport, and policies that keep visitors safe.',
    order: 4,
  },
  {
    slug: 'well-known',
    title: 'Well-Known URIs',
    summary: 'Standard, agreed-upon paths under /.well-known/.',
    order: 5,
  },
  {
    slug: 'agent-readiness',
    title: 'Agent Readiness',
    summary: 'Things that make a site legible to AI agents and crawlers.',
    order: 6,
  },
  {
    slug: 'performance',
    title: 'Performance',
    summary: 'Core Web Vitals, caching, images, fonts, network behaviour.',
    order: 7,
  },
  {
    slug: 'privacy',
    title: 'Privacy',
    summary: 'Consent, signals, and respecting visitor choice.',
    order: 8,
  },
  {
    slug: 'resilience',
    title: 'Resilience',
    summary: 'Graceful failure — error pages, offline, redirects.',
    order: 9,
  },
  {
    slug: 'i18n',
    title: 'Internationalisation',
    summary: 'Language, locale, direction, and translated content.',
    order: 10,
  },
] as const;

export type CategorySlug = (typeof categories)[number]['slug'];

export function categoryFor(slug: string) {
  return categories.find((c) => c.slug === slug);
}

export const statusLabel: Record<string, string> = {
  required: 'Required',
  recommended: 'Recommended',
  optional: 'Optional',
  avoid: 'Avoid',
};

export const statusColor: Record<string, string> = {
  required: 'bg-red-50 text-red-800 border-red-200',
  recommended: 'bg-accent-50 text-accent-800 border-accent-200',
  optional: 'bg-ink-100 text-ink-700 border-ink-200',
  avoid: 'bg-amber-50 text-amber-800 border-amber-200',
};
