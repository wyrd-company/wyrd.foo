// ---
// relationships:
//   implements: site
// ---
import type { APIRoute, GetStaticPaths } from "astro";
import { getCollection } from "astro:content";
import { docsMap } from "../../lib/docs-map";
import { productMarkdown } from "../../lib/product-markdown";

export const getStaticPaths = (async () => {
  const [products, pages, readmes, releases] = await Promise.all([
    getCollection("products"),
    getCollection("pages"),
    getCollection("featureReadmes"),
    getCollection("latestReleaseEntries"),
  ]);
  return products.map(({ id: key, data: tool }) => {
    const product = "source" in tool ? undefined : tool;
    const map = product
      ? docsMap(
          product.nav,
          pages
            .filter((page) => page.data.product === key)
            .map((page) => ({
              slug: page.id.slice(page.id.indexOf("/") + 1),
              ...page.data,
            })),
        )
      : [];
    const latest = releases.find((entry) => entry.id === key);
    const markdown = productMarkdown(
      key,
      tool,
      map,
      product ? undefined : readmes.find((entry) => entry.id === key)?.body,
      latest ? { body: latest.body ?? "", version: latest.data.version } : undefined,
    );
    return { params: { key }, props: { markdown } };
  });
}) satisfies GetStaticPaths;

export const GET: APIRoute<{ markdown: string }> = ({ props }) =>
  new Response(props.markdown, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
