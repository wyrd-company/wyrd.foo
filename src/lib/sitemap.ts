/*
 * Which built pages the sitemap leaves out. A page that only redirects is not
 * a destination: /docs/<key>/ (src/pages/docs/[key]/index.astro) sends the
 * visitor to the product's first docs page. Its URL is the docs home of a
 * product (`docsHome` in docs-pages.ts) and no other page is one level below
 * /docs/, so the rule follows the route and needs no list of products.
 */
const DOCS_LANDING = /^\/docs\/[^/]+\/?$/;

/** True when the page at `url` only redirects. */
export function isRedirectPage(url: string): boolean {
  return DOCS_LANDING.test(new URL(url).pathname);
}

/** The `filter` of the sitemap integration, which lists HTML pages only: the pages that do not redirect. */
export const inSitemap = (url: string) => !isRedirectPage(url);
