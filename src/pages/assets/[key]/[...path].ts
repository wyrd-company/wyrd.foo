/*
 * Product assets at /assets/<key>/<path> (lib/product-assets.ts): each file
 * a product's tool.yaml names (logo, logo-dark, favicon, social-image, media),
 * read from <content root>/<key>/docs/<path>.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { APIRoute, GetStaticPaths } from "astro";
import { getCollection } from "astro:content";
import { CONTENT_ROOT } from "../../../lib/content-root";
import type { ToolFile } from "../../../schema/index.ts";

/** The asset paths a tool.yaml names, relative to docs/user/. */
function assetsOf(data: ToolFile): string[] {
  const paths = [data.logo];
  if (!("source" in data)) {
    paths.push(data["logo-dark"], data.favicon, data["social-image"], ...data.media.map((m) => m.src));
  }
  return [...new Set(paths.filter((p): p is string => p !== undefined))];
}

export const getStaticPaths = (async () => {
  const products = await getCollection("products");
  return products.flatMap((product) =>
    assetsOf(product.data).map((path) => ({ params: { key: product.id, path } })),
  );
}) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ params }) => {
  const file = await readFile(join(CONTENT_ROOT, params.key!, "docs", params.path!));
  return new Response(file);
};
