// ---
// relationships:
//   implements: site
// ---
import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { releasesRss } from "../lib/releases-rss.ts";

export const GET: APIRoute = async ({ site }) => {
  const [products, entries] = await Promise.all([getCollection("products"), getCollection("latestReleaseEntries")]);
  return releasesRss(
    site!,
    products.map(({ id, data }) => ({ key: id, data, hasDocs: false })),
    new Map(entries.map(({ id, body }) => [id, body ?? ""])),
  );
};
