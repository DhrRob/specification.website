import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';
import { categoryFor, site } from '~/lib/site';

export const getStaticPaths: GetStaticPaths = async () => {
  const all = await getCollection('spec', ({ data }) => !data.draft);
  return all.map((entry) => {
    const slug = entry.data.slug ?? entry.id.split('/').pop()!;
    return {
      params: { category: entry.data.category, slug },
      props: { entry },
    };
  });
};

export const GET: APIRoute = async ({ props }) => {
  const entry = props.entry as Awaited<ReturnType<typeof getCollection<'spec'>>>[number];
  const slug = entry.data.slug ?? entry.id.split('/').pop()!;
  const cat = categoryFor(entry.data.category);
  const canonical = `${site.url}/spec/${entry.data.category}/${slug}/`;
  const jsonldUrl = `${site.url}/spec/${entry.data.category}/${slug}.jsonld`;
  const articleId = `${canonical}#article`;
  const breadcrumbId = `${canonical}#breadcrumb`;

  const article: Record<string, unknown> = {
    '@type': 'TechArticle',
    '@id': articleId,
    headline: entry.data.title,
    description: entry.data.summary,
    url: canonical,
    inLanguage: 'en',
    isPartOf: { '@type': 'WebSite', '@id': `${site.url}/#website`, name: site.name, url: site.url },
    author: { '@type': 'Person', name: site.author.name, url: site.author.url },
    publisher: { '@type': 'Organization', '@id': `${site.url}/#organization`, name: site.name, url: site.url },
    license: 'https://creativecommons.org/licenses/by/4.0/',
  };
  if (entry.data.updated) article.dateModified = entry.data.updated;
  if (entry.data.sources?.length) {
    article.citation = entry.data.sources.map((s) => ({
      '@type': 'CreativeWork',
      name: s.title,
      url: s.url,
      ...(s.publisher ? { publisher: { '@type': 'Organization', name: s.publisher } } : {}),
    }));
  }

  const breadcrumb = {
    '@type': 'BreadcrumbList',
    '@id': breadcrumbId,
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${site.url}/` },
      { '@type': 'ListItem', position: 2, name: 'Spec', item: `${site.url}/spec/` },
      {
        '@type': 'ListItem',
        position: 3,
        name: cat?.title ?? entry.data.category,
        item: `${site.url}/spec/${entry.data.category}/`,
      },
      { '@type': 'ListItem', position: 4, name: entry.data.title, item: canonical },
    ],
  };

  const graph = {
    '@context': 'https://schema.org',
    '@id': jsonldUrl,
    '@graph': [article, breadcrumb],
  };

  return new Response(JSON.stringify(graph, null, 2), {
    headers: {
      'Content-Type': 'application/ld+json; charset=utf-8',
      'X-Robots-Tag': 'index, follow',
      'Access-Control-Allow-Origin': '*',
    },
  });
};
