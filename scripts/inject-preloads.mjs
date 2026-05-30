// Postbuild: inject a `Link: rel=preload` for the BaseLayout CSS into
// dist/_headers. Cloudflare Pages turns Link preload response headers
// into HTTP 103 Early Hints, so the browser starts fetching the CSS
// during the HTML's TTFB window instead of after.
//
// The CSS filename is content-hashed and changes per build, so we
// discover it from the rendered HTML rather than hardcoding it.

import { readFile, writeFile } from 'node:fs/promises';

const HTML = 'dist/index.html';
const HEADERS = 'dist/_headers';

const html = await readFile(HTML, 'utf-8');
const match = html.match(/<link rel="stylesheet" href="(\/_astro\/[^"]+\.css)"/);
if (!match) {
  console.error(`inject-preloads: no /_astro/*.css link found in ${HTML}`);
  process.exit(1);
}
const cssPath = match[1];

const headers = await readFile(HEADERS, 'utf-8');
const preload = `<${cssPath}>; rel=preload; as=style`;

let updated;
if (/^  Link: /m.test(headers)) {
  updated = headers.replace(/^(  Link: )/m, `$1${preload}, `);
} else {
  updated = headers.replace(/^(\/\*\n)/m, `$1  Link: ${preload}\n`);
}

await writeFile(HEADERS, updated);
console.log(`inject-preloads: added preload for ${cssPath}`);
