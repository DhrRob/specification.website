<?xml version="1.0" encoding="UTF-8"?>
<!--
  XSL stylesheet for the sitemap index and per-category sitemaps.
  Renders a readable HTML view when a human opens the .xml file in a browser.
  Crawlers ignore the stylesheet and parse the XML directly.
-->
<xsl:stylesheet version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:s="http://www.sitemaps.org/schemas/sitemap/0.9"
  exclude-result-prefixes="s">

  <xsl:output method="html" version="5.0" encoding="UTF-8" indent="yes"
              doctype-system="about:legacy-compat"/>

  <xsl:template match="/">
    <html lang="en-GB">
      <head>
        <meta charset="UTF-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <meta name="robots" content="noindex, follow"/>
        <title>XML sitemap – The Website Specification</title>
        <style>
          :root {
            color-scheme: light dark;
            --ink-50:  light-dark(#f7f7f8, #0e0e13);
            --ink-100: light-dark(#eeeef1, #1a1a20);
            --ink-200: light-dark(#d8d8df, #2a2a31);
            --ink-300: light-dark(#b4b4be, #3f3f48);
            --ink-500: light-dark(#5b5b66, #87878f);
            --ink-700: light-dark(#2a2a31, #d8d8df);
            --ink-800: light-dark(#1a1a20, #eeeef1);
            --ink-900: light-dark(#0e0e13, #f7f7f8);
            --accent-50:  light-dark(#f0fdf4, #14532d);
            --accent-200: light-dark(#bbf7d0, #166534);
            --accent-700: light-dark(#15803d, #4ade80);
            --accent-800: light-dark(#166534, #86efac);
          }
          * { box-sizing: border-box; }
          html { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
          body {
            margin: 0;
            background: var(--ink-50);
            color: var(--ink-800);
            line-height: 1.5;
          }
          a { color: var(--accent-700); text-decoration: none; }
          a:hover { text-decoration: underline; }
          header.site {
            border-bottom: 1px solid var(--ink-200);
            background: var(--ink-100);
          }
          header.site .wrap {
            max-width: 64rem;
            margin: 0 auto;
            padding: 1rem 1.5rem;
            display: flex;
            align-items: baseline;
            gap: 0.75rem;
            flex-wrap: wrap;
          }
          header.site .brand {
            font-weight: 600;
            color: var(--ink-900);
            font-size: 0.95rem;
          }
          header.site .sep { color: var(--ink-300); }
          header.site .crumb { color: var(--ink-500); font-size: 0.875rem; }
          main { max-width: 64rem; margin: 0 auto; padding: 2rem 1.5rem 4rem; }
          h1 { font-size: 1.75rem; margin: 0 0 0.5rem; color: var(--ink-900); letter-spacing: -0.01em; }
          .lede { color: var(--ink-500); margin: 0 0 2rem; font-size: 0.95rem; }
          .lede code {
            background: var(--ink-100);
            padding: 0.05rem 0.35rem;
            border-radius: 0.25rem;
            font-size: 0.85em;
          }
          .summary {
            display: inline-block;
            background: var(--accent-50);
            color: var(--accent-800);
            border: 1px solid var(--accent-200);
            border-left: 3px solid var(--accent-700);
            padding: 0.4rem 0.75rem;
            border-radius: 0.25rem;
            font-size: 0.875rem;
            margin: 0 0 1.5rem;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 0.9rem;
            background: var(--ink-50);
            border: 1px solid var(--ink-200);
            border-radius: 0.375rem;
            overflow: hidden;
          }
          thead th {
            text-align: left;
            font-weight: 600;
            color: var(--ink-700);
            background: var(--ink-100);
            border-bottom: 1px solid var(--ink-200);
            padding: 0.6rem 0.875rem;
            font-size: 0.8rem;
            text-transform: uppercase;
            letter-spacing: 0.04em;
          }
          tbody td {
            padding: 0.55rem 0.875rem;
            border-top: 1px solid var(--ink-200);
            vertical-align: top;
          }
          tbody tr:first-child td { border-top: 0; }
          tbody tr:hover { background: var(--ink-100); }
          td.num {
            color: var(--ink-500);
            font-variant-numeric: tabular-nums;
            text-align: right;
            width: 3rem;
            padding-right: 0.5rem;
          }
          td.date {
            color: var(--ink-700);
            white-space: nowrap;
            font-variant-numeric: tabular-nums;
          }
          td.date .time {
            display: block;
            font-size: 0.78rem;
            color: var(--ink-500);
          }
          td.loc { word-break: break-all; }
          .nav { margin: 0 0 1.5rem; font-size: 0.875rem; }
          footer.site {
            border-top: 1px solid var(--ink-200);
            color: var(--ink-500);
            font-size: 0.8rem;
          }
          footer.site .wrap {
            max-width: 64rem;
            margin: 0 auto;
            padding: 1rem 1.5rem;
          }
        </style>
      </head>
      <body>
        <header class="site">
          <div class="wrap">
            <a class="brand" href="https://specification.website/">The Website Specification</a>
            <span class="sep">/</span>
            <span class="crumb">XML sitemap</span>
          </div>
        </header>
        <main>
          <xsl:apply-templates select="s:sitemapindex | s:urlset"/>
        </main>
        <footer class="site">
          <div class="wrap">
            Styled view of an <a href="/spec/seo/xml-sitemaps/">XML sitemap</a>.
            Crawlers read the underlying XML directly — view source to see it.
          </div>
        </footer>
      </body>
    </html>
  </xsl:template>

  <xsl:template match="s:sitemapindex">
    <h1>Sitemap index</h1>
    <p class="lede">
      This index lists every child sitemap on <code>specification.website</code>.
      One sitemap per spec category, plus <code>sitemap-pages.xml</code> for the
      homepage and marketing pages. Defined by
      <a href="https://www.sitemaps.org/protocol.html#index">sitemaps.org</a>.
    </p>
    <div class="summary">
      <xsl:value-of select="count(s:sitemap)"/> child sitemaps
    </div>
    <table>
      <thead>
        <tr>
          <th class="num">#</th>
          <th>Sitemap URL</th>
          <th>Last modified</th>
        </tr>
      </thead>
      <tbody>
        <xsl:for-each select="s:sitemap">
          <tr>
            <td class="num"><xsl:value-of select="position()"/></td>
            <td class="loc">
              <a href="{s:loc}"><xsl:value-of select="s:loc"/></a>
            </td>
            <td class="date">
              <xsl:call-template name="lastmod">
                <xsl:with-param name="value" select="s:lastmod"/>
              </xsl:call-template>
            </td>
          </tr>
        </xsl:for-each>
      </tbody>
    </table>
  </xsl:template>

  <xsl:template match="s:urlset">
    <h1>URL sitemap</h1>
    <p class="lede">
      A list of canonical URLs in one section of <code>specification.website</code>,
      with the last date each URL changed. Defined by
      <a href="https://www.sitemaps.org/protocol.html">sitemaps.org</a>.
    </p>
    <p class="nav">
      <a href="/sitemap-index.xml">&#8592; Sitemap index</a>
    </p>
    <div class="summary">
      <xsl:value-of select="count(s:url)"/> URLs
    </div>
    <table>
      <thead>
        <tr>
          <th class="num">#</th>
          <th>URL</th>
          <th>Last modified</th>
        </tr>
      </thead>
      <tbody>
        <xsl:for-each select="s:url">
          <tr>
            <td class="num"><xsl:value-of select="position()"/></td>
            <td class="loc">
              <a href="{s:loc}"><xsl:value-of select="s:loc"/></a>
            </td>
            <td class="date">
              <xsl:call-template name="lastmod">
                <xsl:with-param name="value" select="s:lastmod"/>
              </xsl:call-template>
            </td>
          </tr>
        </xsl:for-each>
      </tbody>
    </table>
  </xsl:template>

  <!--
    Render a <lastmod> value as "YYYY-MM-DD" with the time of day, when known,
    as a smaller secondary line ("HH:MM UTC"). XSLT 1.0 has no date arithmetic,
    so we just slice the ISO 8601 string. Inputs come from this site as full
    timestamps; the date-only fallback handles other sitemaps' conventions.
  -->
  <xsl:template name="lastmod">
    <xsl:param name="value"/>
    <xsl:value-of select="substring($value, 1, 10)"/>
    <xsl:if test="string-length($value) &gt; 10">
      <span class="time">
        <xsl:value-of select="substring($value, 12, 5)"/>
        <xsl:text> UTC</xsl:text>
      </span>
    </xsl:if>
  </xsl:template>

</xsl:stylesheet>
