/*
 * The map of a product's docs: sections, groups and pages, from the product's
 * `nav` in docs.yml. Pages that `nav` does not list go into a trailing "More"
 * group. A product with no `nav` has one section with no name, holding only
 * the "More" group.
 */
import type { ProductEntry } from "../schema/index.ts";

export const MORE_GROUP = "More";

export interface DocsMapPage {
  slug: string;
  title: string;
  order?: number;
}

export interface DocsMapGroup<P extends DocsMapPage = DocsMapPage> {
  group: string;
  pages: P[];
}

export interface DocsMapSection<P extends DocsMapPage = DocsMapPage> {
  /** The section name; null for a product with no `nav`. */
  section: string | null;
  groups: DocsMapGroup<P>[];
}

/** Pages `nav` does not list: by `order` (pages without one last), then title, then slug. */
function byOrder(a: DocsMapPage, b: DocsMapPage): number {
  const oa = a.order ?? Number.POSITIVE_INFINITY;
  const ob = b.order ?? Number.POSITIVE_INFINITY;
  if (oa !== ob) return oa < ob ? -1 : 1;
  if (a.title !== b.title) return a.title < b.title ? -1 : 1;
  return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
}

export function docsMap<P extends DocsMapPage>(nav: ProductEntry["nav"], pages: readonly P[]): DocsMapSection<P>[] {
  const bySlug = new Map(pages.map((page) => [page.slug, page]));
  const listed = new Set<string>();
  const sections: DocsMapSection<P>[] = [];
  for (const { section, groups } of nav ?? []) {
    const mapped: DocsMapGroup<P>[] = [];
    for (const { group, pages: slugs } of groups) {
      const found: P[] = [];
      for (const slug of slugs) {
        const page = bySlug.get(slug);
        if (page === undefined || listed.has(slug)) continue;
        listed.add(slug);
        found.push(page);
      }
      if (found.length > 0) mapped.push({ group, pages: found });
    }
    if (mapped.length > 0) sections.push({ section, groups: mapped });
  }
  const more = pages.filter((page) => !listed.has(page.slug)).sort(byOrder);
  if (more.length > 0) {
    const group = { group: MORE_GROUP, pages: more };
    const last = sections.at(-1);
    if (last === undefined) sections.push({ section: null, groups: [group] });
    else last.groups.push(group);
  }
  return sections;
}

/** The pages of a docs map in reading order. */
export function readingOrder<P extends DocsMapPage>(map: readonly DocsMapSection<P>[]): P[] {
  return map.flatMap((section) => section.groups.flatMap((group) => group.pages));
}
