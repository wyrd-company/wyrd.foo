import { z } from "zod";
import { oneLine, productKey, relationships } from "./fields.ts";

/** The front matter of a docs page: any `.md` file under `docs/user/`. */
export const pageSchema = z
  .strictObject({
    title: oneLine.describe("Sidebar and heading label."),
    product: productKey.describe("The product key in docs.yml that the page belongs to."),
    order: z.number().int().optional().describe("Page order where nav does not decide it."),
    install: z.boolean().default(false).describe("Render the install block at the top."),
    relationships: relationships.optional(),
  })
  .describe("Front matter of a page under docs/user/.");

export type PageFrontMatter = z.output<typeof pageSchema>;

/** A page's slug: its file name without `.md`. Unique within a product. */
export function pageSlugOf(path: string): string {
  const name = path.split("/").pop() ?? path;
  return name.replace(/\.md$/i, "");
}

/** The page slug the docs changelog route takes (`/docs/<key>/changelog`). No page may use it. */
export const CHANGELOG_SLUG = "changelog";

/**
 * True when a page slug is the reserved `changelog`, in any letter case. The
 * site build and the publisher cross-check both use it, so they agree.
 */
export function isReservedSlug(slug: string): boolean {
  return slug.toLowerCase() === CHANGELOG_SLUG;
}

/** The file name of a docs unit changelog. intentional writes it at the unit path. */
export const DOCS_CHANGELOG = "CHANGELOG.md";

/**
 * The docs unit changelog paths, relative to `docs/user/`: `CHANGELOG.md` for
 * a repo with one docs unit, and `<key>/CHANGELOG.md` for each product key
 * when each docs unit has its own folder.
 */
export function docsChangelogPaths(productKeys: Iterable<string>): Set<string> {
  return new Set([DOCS_CHANGELOG, ...[...productKeys].map((key) => `${key}/${DOCS_CHANGELOG}`)]);
}

/**
 * True when `path`, relative to `docs/user/`, is a page: a `.md` file that is
 * not a docs unit changelog. A changelog is data, not a page, and needs no
 * front matter.
 */
export function isPageFile(path: string, productKeys: Iterable<string>): boolean {
  return /\.md$/i.test(path) && !docsChangelogPaths(productKeys).has(path);
}
