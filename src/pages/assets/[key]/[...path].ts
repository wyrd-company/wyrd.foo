/*
 * Product assets at /assets/<key>/<path> (lib/product-assets.ts): each file
 * a product's tool.yaml names and each other published file of its docs folder
 * that is not Markdown (lib/product-asset-files.ts), read from
 * <content root>/<key>/docs/<path>. A named file that was not published fails
 * the build.
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { APIRoute, GetStaticPaths } from "astro";
import { getCollection } from "astro:content";
import { CONTENT_ROOT } from "../../../lib/content-root";
import { docsTargets, filesUnder } from "../../../lib/docs-links";
import { servedAssetFiles } from "../../../lib/product-asset-files";

export const getStaticPaths = (async () => {
  const products = await getCollection("products");
  return products.flatMap((product) =>
    servedAssetFiles(CONTENT_ROOT, product.id, product.data, existsSync, [
      ...docsTargets(filesUnder(join(CONTENT_ROOT, product.id, "docs"))).assets,
    ]).map(({ path, file }) => ({
      params: { key: product.id, path },
      props: { file },
    })),
  );
}) satisfies GetStaticPaths;

export const GET: APIRoute<{ file: string }> = async ({ props }) => new Response(await readFile(props.file));
