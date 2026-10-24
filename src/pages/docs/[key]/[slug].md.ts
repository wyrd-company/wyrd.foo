/*
 * A docs page as Markdown, for "Copy page as Markdown": /docs/<key>/<slug>.md.
 */
import type { APIRoute, GetStaticPaths } from "astro";
import { getDocsProducts, type DocsPage } from "../../../lib/docs";
import { pageMarkdown } from "../../../lib/docs-pages";

export const getStaticPaths = (async () => {
  const products = await getDocsProducts();
  return products.flatMap((product) =>
    product.pages.map((page) => ({ params: { key: product.key, slug: page.slug }, props: { page } })),
  );
}) satisfies GetStaticPaths;

export const GET: APIRoute<{ page: DocsPage }> = ({ props }) =>
  new Response(pageMarkdown(props.page.title, props.page.entry.body ?? ""), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
