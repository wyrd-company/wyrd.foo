/*
 * /llms.txt: the catalog and every docs page's Markdown, for agents
 * (llmstxt.org). The text is built in lib/llms-txt.ts.
 */
import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { getDocsProducts } from "../lib/docs";
import { readingOrder } from "../lib/docs-map";
import { catalogRows, type HomeEntry } from "../lib/home";
import { llmsTxt } from "../lib/llms-txt";

export const GET: APIRoute = async ({ site }) => {
  const [products, docsProducts] = await Promise.all([getCollection("products"), getDocsProducts()]);
  const withDocs = new Set(docsProducts.map((product) => product.key));
  const entries: HomeEntry[] = products.map((product) => ({
    key: product.id,
    data: product.data,
    hasDocs: withDocs.has(product.id),
  }));
  const docs = docsProducts.map(({ key, name, map }) => ({ key, name, pages: readingOrder(map) }));
  return new Response(llmsTxt(site!, catalogRows(entries), docs), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
