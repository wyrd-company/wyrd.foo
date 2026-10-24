/*
 * Product assets at /assets/<key>/<path> (lib/product-assets.ts): each file
 * a product's tool.yaml names (lib/product-asset-files.ts), read from
 * <content root>/<key>/docs/<path>. A named file that was not published fails
 * the build.
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { APIRoute, GetStaticPaths } from "astro";
import { getCollection } from "astro:content";
import { CONTENT_ROOT } from "../../../lib/content-root";
import { productAssetFiles } from "../../../lib/product-asset-files";

export const getStaticPaths = (async () => {
  const products = await getCollection("products");
  return products.flatMap((product) =>
    productAssetFiles(CONTENT_ROOT, product.id, product.data, existsSync).map(({ path, file }) => ({
      params: { key: product.id, path },
      props: { file },
    })),
  );
}) satisfies GetStaticPaths;

export const GET: APIRoute<{ file: string }> = async ({ props }) => new Response(await readFile(props.file));
