/*
 * Docs page rules that need no content collection: URLs, the Edit on GitHub
 * link, the version footer and reading progress. lib/docs.ts applies them to
 * the published content.
 */
import { resolve } from "node:path";
import { CONTENT_ROOT } from "./content-root.ts";
import { CHANGELOG_SLUG, reservedSlugPurpose, type KindBlock } from "../schema/index.ts";
import { readingOrder, type DocsMapPage, type DocsMapSection } from "./docs-map";

export class ReservedSlugError extends Error {
  constructor(file: string, slug: string, purpose: string) {
    super(`${file}: page slug "${slug.toLowerCase()}" is reserved for ${purpose}; rename the file`);
    this.name = "ReservedSlugError";
  }
}

export class DuplicateSlugError extends Error {
  constructor(key: string, slug: string, files: readonly string[]) {
    super(`product ${key} has more than one page with slug "${slug}": ${files.join(", ")}`);
    this.name = "DuplicateSlugError";
  }
}

export const docsHome = (key: string) => `/docs/${key}`;
export const pageHref = (key: string, slug: string) => `/docs/${key}/${slug}`;
export const markdownHref = (key: string, slug: string) => `/docs/${key}/${slug}.md`;
export const changelogHref = (key: string) => `/docs/${key}/${CHANGELOG_SLUG}`;

/**
 * A page's path under its product's docs folder, from its file path:
 * `<root>/<folder>/docs/<rel>`. `root` is the content root and `folder` the
 * product folder. Both paths are resolved against the working directory, so a
 * `<folder>/docs` inside the root's own path never matches.
 *
 * It assumes the working directory is the Astro project root: Astro's entry
 * `filePath` is relative to that root, and `resolve` reads it against the
 * working directory. In a build run from another directory (`astro build
 * --root <dir>`), a page path can resolve outside the content root and fail
 * with "is not under", for example with an absolute WYRD_CONTENT_DIR. The only
 * `--root` build (`build:fixtures`, the head-site fixture) has no docs pages.
 */
export function relPathOf(filePath: string, folder: string, root: string): string {
  const file = resolve(filePath).replace(/\\/g, "/");
  const prefix = `${resolve(root).replace(/\\/g, "/").replace(/\/$/, "")}/${folder}/docs/`;
  if (!file.startsWith(prefix)) throw new Error(`${filePath} is not under ${folder}/docs/ of the content root ${root}`);
  return file.slice(prefix.length);
}

/** The GitHub edit link of a page: the repo's default branch (`HEAD`), `<docs-path>/<rel>`. */
export function editUrl(owner: string, docsPath: string, rel: string): string {
  const path = [...docsPath.split("/"), ...rel.split("/")].filter(Boolean).map(encodeURIComponent).join("/");
  return `https://github.com/${owner}/edit/HEAD/${path}`;
}

/** "Docs 0.2.3 · for trowel 0.2.0" (REDESIGN.md, "Docs"). */
export function versionLine(product: { name: string; version: string; docsVersion: string }) {
  return { docs: `Docs ${product.docsVersion}`, product: `for ${product.name} ${product.version}` };
}

export type Progress = "done" | "current" | "ahead";

/** Reading progress of each page of the current page's section. */
export function progressOf<P extends DocsMapPage>(section: DocsMapSection<P>, currentSlug: string): Map<string, Progress> {
  const pages = readingOrder([section]);
  const at = pages.findIndex((page) => page.slug === currentSlug);
  return new Map(pages.map((page, i) => [page.slug, i < at ? "done" : i === at ? "current" : "ahead"]));
}

/** The section that holds a page. */
export function sectionOf<P extends DocsMapPage>(map: readonly DocsMapSection<P>[], slug: string): DocsMapSection<P> | undefined {
  return map.find((section) => section.groups.some((group) => group.pages.some((page) => page.slug === slug)));
}

/** Previous and next page in the product's reading order. */
export function neighbours<P extends DocsMapPage>(map: readonly DocsMapSection<P>[], slug: string): { prev?: P; next?: P } {
  const pages = readingOrder(map);
  const at = pages.findIndex((page) => page.slug === slug);
  return at === -1 ? {} : { prev: pages[at - 1], next: pages[at + 1] };
}

/** The Markdown that Copy as Markdown puts on the clipboard: the title as a heading, then the body. */
export function pageMarkdown(title: string, body: string): string {
  return `# ${title}\n\n${body.replace(/^\s+/, "")}`;
}

/** The command an install block at the top of a page shows: the primary kind's default install, or its reference. */
export function primaryInstall(kind: KindBlock): { label: string; command: string } {
  if ("install" in kind) {
    const entry = kind.install.find((e) => e.default) ?? kind.install[0];
    return { label: entry.label ?? entry.method, command: entry.command };
  }
  return { label: "Reference", command: kind.ref };
}

/** A published page as the docs read it: collection id `<folder>/<slug>`, file path and front matter. */
export interface PageSource {
  id: string;
  filePath?: string;
  data: { title: string; product: string; order?: number; install: boolean };
}

export interface GroupedPage<E extends PageSource> {
  key: string;
  slug: string;
  title: string;
  order?: number;
  install: boolean;
  /** Path under the product's docs folder, for example `guides/configuration.md`. */
  rel: string;
  entry: E;
}

/**
 * Pages by product key: the page's `product:`, and its file-name slug. `root`
 * is the content root the pages were read from.
 * Fails on a reserved slug (`changelog`, `index`) and on two pages of one product with
 * one slug.
 */
export function groupPages<E extends PageSource>(entries: readonly E[], root: string = CONTENT_ROOT): Map<string, GroupedPage<E>[]> {
  const byProduct = new Map<string, GroupedPage<E>[]>();
  for (const entry of entries) {
    const key = entry.data.product;
    const folder = entry.id.split("/")[0];
    const file = entry.filePath ?? entry.id;
    const slug = entry.id.slice(folder.length + 1);
    const reserved = reservedSlugPurpose(slug, key);
    if (reserved !== undefined) throw new ReservedSlugError(file, slug, reserved);
    const list = byProduct.get(key) ?? [];
    const twin = list.find((page) => page.slug === slug);
    if (twin) throw new DuplicateSlugError(key, slug, [twin.entry.filePath ?? twin.entry.id, file]);
    const { title, order, install } = entry.data;
    list.push({ key, slug, title, order, install, rel: relPathOf(file, folder, root), entry });
    byProduct.set(key, list);
  }
  return byProduct;
}
