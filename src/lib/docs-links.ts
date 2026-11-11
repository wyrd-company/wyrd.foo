/*
 * Relative links in docs pages. A page file is `<key>/docs/<rel>` in the
 * content root, but the site serves it at `/docs/<key>/<slug>/`, so a link
 * written for the file (`other.md#heading`, as on GitHub) would resolve
 * inside the page's own URL folder. A rehype step rewrites each relative
 * link that resolves to a page, the docs changelog or a published asset of
 * the same product to that file's site URL, and keeps the query and
 * fragment. Other links stay as written.
 */
import { readdirSync } from "node:fs";
import { join, posix, relative, resolve, sep } from "node:path";
import { pageSlugOf } from "../schema/index.ts";
import { changelogHref, pageHref } from "./docs-pages.ts";
import { productAssetUrl } from "./product-assets.ts";

/** The docs file of a product: its key and its path under `<key>/docs/`. */
export interface DocsFile {
  key: string;
  rel: string;
}

/** The product and path of a file under `<root>/<key>/docs/`, or undefined for any other file. */
export function docsFileOf(path: string | undefined, contentRoot: string): DocsFile | undefined {
  if (!path) return undefined;
  const parts = relative(resolve(contentRoot), resolve(path)).split(sep);
  if (parts[0] === ".." || parts.length < 3 || parts[1] !== "docs") return undefined;
  return { key: parts[0], rel: parts.slice(2).join("/") };
}

/** The files of a product's docs folder, by path under it, that links can reach. */
export interface DocsTargets {
  /** Page paths (`guides/configuration.md`), each to its slug. */
  pages: Map<string, string>;
  /** Slugs of the pages, for a bare-slug link. */
  slugs: Set<string>;
  /** The docs changelog is published. */
  changelog: boolean;
  /** Paths of the published files that are not Markdown: the assets. */
  assets: Set<string>;
}

const CHANGELOG_FILE = "CHANGELOG.md";
const MARKDOWN = /\.md$/i;

/** The link targets from a list of file paths under a product's docs folder. */
export function docsTargets(files: readonly string[]): DocsTargets {
  const targets: DocsTargets = { pages: new Map(), slugs: new Set(), changelog: false, assets: new Set() };
  for (const file of files) {
    if (file === CHANGELOG_FILE) targets.changelog = true;
    else if (MARKDOWN.test(file)) {
      const slug = pageSlugOf(file);
      targets.pages.set(file, slug);
      targets.slugs.add(slug);
    } else targets.assets.add(file);
  }
  return targets;
}

/** Every file under `dir`, by posix path relative to it. */
export function filesUnder(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true, recursive: true })
      .filter((entry) => entry.isFile())
      .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join("/"));
  } catch {
    return [];
  }
}

/**
 * The site URL of a relative link in the docs file `from`, or undefined to
 * keep the link as written. `other.md`, `guides/other.md` and `../other.md`
 * resolve against the file's folder, as on GitHub. A link with no extension
 * (`other`) goes to the page `other.md` beside the file, or else, when it is
 * one path segment, to the product's page with that slug. A link to the
 * docs folder's `CHANGELOG.md` goes to the docs changelog, and a link to a
 * published file that is not Markdown goes to its asset URL.
 */
export function docsLinkHref(href: string, from: DocsFile, targets: DocsTargets): string | undefined {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("/") || href.startsWith("#")) return undefined;
  const at = href.search(/[?#]/);
  const written = at === -1 ? href : href.slice(0, at);
  const suffix = at === -1 ? "" : href.slice(at);
  if (written === "" || written.endsWith("/")) return undefined;
  let path = written;
  try {
    path = decodeURI(written);
  } catch {
    // Not valid percent-encoding: match it as written.
  }
  const resolved = posix.normalize(posix.join(posix.dirname(from.rel), path));
  if (resolved.startsWith("../")) return undefined;
  const page = (slug: string) => `${pageHref(from.key, slug)}/${suffix}`;
  if (resolved === CHANGELOG_FILE && targets.changelog) return `${changelogHref(from.key)}/${suffix}`;
  const slug = targets.pages.get(resolved);
  if (slug !== undefined) return page(slug);
  if (targets.assets.has(resolved)) return `${productAssetUrl(from.key, resolved)}${suffix}`;
  if (!/\.[^/]*$/.test(path)) {
    const sibling = targets.pages.get(`${resolved}.md`);
    if (sibling !== undefined) return page(sibling);
    if (!path.includes("/") && targets.slugs.has(path)) return page(path);
  }
  return undefined;
}

interface HastNode {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

function walk(node: HastNode, visit: (node: HastNode) => void) {
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
}

/** Rewrite the relative `<a href>` links of a docs file's tree (docsLinkHref). */
export function rewriteDocsLinks(tree: HastNode, from: DocsFile, targets: DocsTargets): void {
  walk(tree, (node) => {
    if (node.type !== "element" || node.tagName !== "a") return;
    const href = node.properties?.href;
    if (typeof href !== "string") return;
    const site = docsLinkHref(href, from, targets);
    if (site !== undefined) node.properties!.href = site;
  });
}

interface Processor {
  use(plugin: () => (tree: HastNode, file: { path?: string }) => void): unknown;
}

/**
 * The rehype plugin, for files under `<root>/<key>/docs/` only. Like
 * rehypeEmbeddedHeadings, it adds its step last, so raw HTML `<a>` elements
 * are elements by then. It lists the product's docs folder for each file, so
 * a page added in dev resolves without a restart.
 */
export function rehypeDocsLinks(this: Processor, options: { contentRoot: string }): void {
  this.use(() => (tree, file) => {
    const from = docsFileOf(file.path, options.contentRoot);
    if (!from) return;
    rewriteDocsLinks(tree, from, docsTargets(filesUnder(join(options.contentRoot, from.key, "docs"))));
  });
}
