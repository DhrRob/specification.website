import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';
import { categories, type CategorySlug } from '~/lib/site';
import { clampLastmod, renderUrlset, siteOrigin, xmlResponse, type SitemapEntry } from '~/lib/sitemap';

export const getStaticPaths: GetStaticPaths = () =>
  categories.map((c) => ({ params: { category: c.slug } }));

export const GET: APIRoute = async (context) => {
  const category = context.params.category as CategorySlug;
  const origin = siteOrigin(context);

  const entries = await getCollection(
    'spec',
    ({ data }) => !data.draft && data.category === category,
  );
  entries.sort((a, b) => a.data.order - b.data.order || a.data.title.localeCompare(b.data.title));

  const urls: SitemapEntry[] = [];
  let newest = '';
  for (const e of entries) {
    const slug = e.data.slug ?? e.id.split('/').pop()!;
    const updated = clampLastmod(e.data.updated);
    urls.push({
      loc: `${origin}/spec/${category}/${slug}/`,
      lastmod: updated,
    });
    if (updated && updated > newest) newest = updated;
  }
  // Category index page tracks the newest entry it lists.
  urls.unshift({
    loc: `${origin}/spec/${category}/`,
    lastmod: newest || undefined,
  });

  return xmlResponse(renderUrlset(urls));
};
