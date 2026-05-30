import type { APIRoute } from 'astro';
import { categories } from '~/lib/site';
import { loadSpecLastmod, renderSitemapIndex, siteOrigin, xmlResponse } from '~/lib/sitemap';

export const GET: APIRoute = async (context) => {
  const { perCategory, newest } = await loadSpecLastmod();
  const origin = siteOrigin(context);

  const sitemaps = [
    { loc: `${origin}/sitemap-pages.xml`, lastmod: newest || undefined },
    ...categories
      .filter((c) => perCategory.has(c.slug))
      .map((c) => ({
        loc: `${origin}/sitemap-${c.slug}.xml`,
        lastmod: perCategory.get(c.slug),
      })),
  ];

  return xmlResponse(renderSitemapIndex(sitemaps));
};
