import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { site } from '~/lib/site';

export const GET: APIRoute = async () => {
  const entries = await getCollection('spec', ({ data }) => !data.draft);
  entries.sort((a, b) => {
    return (
      a.data.category.localeCompare(b.data.category) ||
      a.data.order - b.data.order ||
      a.data.title.localeCompare(b.data.title)
    );
  });

  const xmlEscape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    '<schemamap xmlns="https://specification.website/schemas/schemamap/0.1">',
  );
  for (const e of entries) {
    const slug = e.data.slug ?? e.id.split('/').pop()!;
    const canonical = `${site.url}/spec/${e.data.category}/${slug}/`;
    const jsonld = `${site.url}/spec/${e.data.category}/${slug}.jsonld`;
    lines.push('  <resource>');
    lines.push(`    <loc>${xmlEscape(canonical)}</loc>`);
    lines.push(`    <jsonld>${xmlEscape(jsonld)}</jsonld>`);
    lines.push('    <type>TechArticle</type>');
    lines.push('    <type>BreadcrumbList</type>');
    if (e.data.updated) lines.push(`    <lastmod>${xmlEscape(e.data.updated)}</lastmod>`);
    lines.push('  </resource>');
  }
  lines.push('</schemamap>');

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
      'X-Robots-Tag': 'index, follow',
    },
  });
};
