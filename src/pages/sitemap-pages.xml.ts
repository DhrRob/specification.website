import type { APIRoute } from 'astro';
import { gitMtime } from '~/lib/git-mtime';
import {
  loadSpecLastmod,
  renderUrlset,
  siteOrigin,
  xmlResponse,
  type SitemapEntry,
} from '~/lib/sitemap';

/**
 * Page paths whose lastmod tracks the newest spec-collection update —
 * these pages list or summarise the collection, so they "change" whenever
 * the collection does.
 */
const COLLECTION_DERIVED = ['/', '/spec/', '/checklist/'] as const;

/**
 * Standalone marketing pages, mapped to their source files so we can use
 * each file's last git commit as the lastmod. Path-to-source mapping is
 * explicit so a renamed page surfaces here rather than silently dropping.
 */
const STATIC_PAGES: Array<{ path: string; source: string }> = [
  { path: '/about/', source: 'src/pages/about.astro' },
  { path: '/contribute/', source: 'src/pages/contribute.astro' },
  { path: '/mcp/', source: 'src/pages/mcp.astro' },
  { path: '/privacy/', source: 'src/pages/privacy.astro' },
  { path: '/search/', source: 'src/pages/search.astro' },
];

export const GET: APIRoute = async (context) => {
  const { newest } = await loadSpecLastmod();
  const origin = siteOrigin(context);
  const collectionDerived = newest || undefined;

  const urls: SitemapEntry[] = [
    ...COLLECTION_DERIVED.map((path) => ({
      loc: `${origin}${path}`,
      lastmod: collectionDerived,
    })),
    ...STATIC_PAGES.map(({ path, source }) => ({
      loc: `${origin}${path}`,
      lastmod: gitMtime(source),
    })),
  ];

  return xmlResponse(renderUrlset(urls));
};
