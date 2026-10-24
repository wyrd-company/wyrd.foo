/*
 * The docs of the v2 content, read from the content collections. Pages are
 * routed by their `product:` and file-name slug, at any depth under the
 * product's docs folder (lib/docs-products.ts).
 */
import { getCollection, type CollectionEntry } from "astro:content";
import type { GroupedPage } from "./docs-pages";
import { docsProducts, type DocsProduct as AnyDocsProduct } from "./docs-products";

export type DocsPage = GroupedPage<CollectionEntry<"pages">>;
export type DocsProduct = AnyDocsProduct<CollectionEntry<"pages">, CollectionEntry<"docsChangelogs">>;

export async function getDocsProducts(): Promise<DocsProduct[]> {
  const [products, pages, changelogs] = await Promise.all([
    getCollection("products"),
    getCollection("pages"),
    getCollection("docsChangelogs"),
  ]);
  return docsProducts(products, pages, changelogs);
}
