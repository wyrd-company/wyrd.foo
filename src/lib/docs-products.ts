/*
 * The products that have docs, built from the published content: each
 * product's pages, docs map, first page, asset URLs and docs changelog. No
 * content collection here; lib/docs.ts reads the collections.
 */
import { isFeatureEntry, type Kind, type ToolFile, type ToolProduct } from "../schema/index.ts";
import { docsMap, readingOrder, type DocsMapSection } from "./docs-map";
import { groupPages, type GroupedPage, type PageSource } from "./docs-pages";
import { productAssetUrl } from "./product-assets";

export interface DocsProduct<E extends PageSource = PageSource, C = unknown> {
  key: string;
  data: ToolProduct;
  name: string;
  kinds: Kind[];
  /** Asset URLs. */
  logo?: string;
  logoDark?: string;
  favicon?: string;
  socialImage?: string;
  pages: GroupedPage<E>[];
  map: DocsMapSection<GroupedPage<E>>[];
  /** The first page in reading order: where `/docs/<key>/` goes. */
  first: GroupedPage<E>;
  changelog?: C;
}

const asset = (key: string, path?: string) => (path === undefined ? undefined : productAssetUrl(key, path));

/** Every product that has at least one docs page, in catalog order: `order` first, then by name. */
export function docsProducts<E extends PageSource, C extends { id: string }>(
  products: readonly { id: string; data: ToolFile }[],
  pages: readonly E[],
  changelogs: readonly C[],
): DocsProduct<E, C>[] {
  const byProduct = groupPages(pages);
  const result: DocsProduct<E, C>[] = [];
  for (const { id: key, data } of products) {
    const list = byProduct.get(key);
    if (list === undefined || isFeatureEntry(data)) continue;
    byProduct.delete(key);
    const map = docsMap(data.nav, list);
    result.push({
      key,
      data,
      name: data.name,
      kinds: data.kinds.map((block) => block.kind),
      logo: asset(key, data.logo),
      logoDark: asset(key, data["logo-dark"]),
      favicon: asset(key, data.favicon),
      socialImage: asset(key, data["social-image"]),
      pages: list,
      map,
      first: readingOrder(map)[0],
      changelog: changelogs.find((entry) => entry.id === key),
    });
  }
  // A page whose product has no tool.yaml, or is a feature entry, has nowhere to go.
  for (const [key, list] of byProduct) {
    throw new Error(`${list[0].entry.filePath ?? list[0].entry.id}: names product ${key}, which has no docs (no tool.yaml, or a feature entry)`);
  }
  return result.sort((a, b) => {
    const oa = a.data.order ?? Number.POSITIVE_INFINITY;
    const ob = b.data.order ?? Number.POSITIVE_INFINITY;
    if (oa !== ob) return oa < ob ? -1 : 1;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
}
