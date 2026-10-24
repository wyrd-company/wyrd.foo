/*
 * The asset files a product's tool.yaml names: `logo`, and for a full product
 * also `logo-dark`, `favicon`, `social-image` and each `media[].src`. Their
 * paths are relative to the product's docs folder (productDocsFolder in
 * src/schema), which the publisher mirrors to `<content root>/<key>/docs/`;
 * the assets endpoint serves each one at productAssetUrl(key, path).
 */
import { join } from "node:path";
import type { ToolFile } from "../schema/index.ts";

/** The asset paths a tool.yaml names, each once, in field order. */
export function namedAssetPaths(data: ToolFile): string[] {
  const paths = [data.logo];
  if (!("source" in data)) {
    paths.push(data["logo-dark"], data.favicon, data["social-image"], ...data.media.map((item) => item.src));
  }
  return [...new Set(paths.filter((path): path is string => path !== undefined))];
}

export interface ProductAssetFile {
  /** The path tool.yaml names, relative to the product's docs folder. */
  path: string;
  /** The published file: `<root>/<key>/docs/<path>`. */
  file: string;
}

/**
 * The published file of each asset a product's tool.yaml names. Throws when a
 * named file was not published, so the build fails and names the product and
 * the field value, instead of a page linking to a missing file.
 */
export function productAssetFiles(
  root: string,
  key: string,
  data: ToolFile,
  exists: (file: string) => boolean,
): ProductAssetFile[] {
  return namedAssetPaths(data).map((path) => {
    const file = join(root, key, "docs", path);
    if (!exists(file)) throw new Error(`${key}/tool.yaml names ${path}, but ${file} does not exist`);
    return { path, file };
  });
}
