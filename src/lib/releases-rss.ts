// ---
// relationships:
//   implements: site
// ---
import rss from "@astrojs/rss";
import type { HomeEntry } from "./home.ts";
import { releaseListings } from "./releases.ts";
import { productReleasesHref, RELEASES_HREF, SITE_NAME } from "./site.ts";

/** Same latest releases as /releases. Notes remain plain text, including Markdown. */
export function releasesRss(site: URL, products: readonly HomeEntry[], notes: ReadonlyMap<string, string>) {
  return rss({
    title: `${SITE_NAME} releases`,
    description: "The latest release of every Wyrd tool.",
    site: new URL(RELEASES_HREF, site),
    trailingSlash: false,
    customData: "<language>en</language>",
    items: releaseListings(products, new Set(notes.keys())).map(({ key, name, version, date }) => ({
      title: `${name} ${version}`,
      pubDate: date,
      link: new URL(productReleasesHref(key), site).href,
      description: notes.get(key)!,
      // A product's page URL stays the same across releases; its identity must not.
      customData: `<guid isPermaLink="false">urn:wyrd-tools:release:${encodeURIComponent(key)}:${encodeURIComponent(version)}</guid>`,
    })),
  });
}
