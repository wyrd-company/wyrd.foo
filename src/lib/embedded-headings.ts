/*
 * Embedded Markdown on the product page: a feature's README and the code unit
 * changelog render inside the page's own sections, so their headings nest
 * under the section's <h2> and their ids cannot take a section's id. A rehype
 * step does it for those two files only; docs pages render as before. A
 * release entry of the changelog (src/lib/latest-entries.ts) renders as its
 * changelog, with a unit of its own in its front matter, so entries of two
 * products on one page keep apart.
 */
import { relative, resolve, sep } from "node:path";

/** The level that the top heading of an embedded document gets, one below the section's <h2>. */
export const EMBEDDED_TOP_LEVEL = 3;

/** Which embedded document a file is, by the id prefix it gets; `<key>/README.md` and `<key>/CHANGELOG.md` only. */
const UNITS: Record<string, string> = { "README.md": "readme", "CHANGELOG.md": "changelog" };

/** The separator between the prefix and the heading's own id. No section id of the page holds it. */
export const PREFIX_SEPARATOR = "--";

/** The front matter key that names the unit of an embedded document in place of its file name's. */
const UNIT_KEY = "embedded-unit";

/** Markdown with front matter that names its unit. */
export function withEmbeddedUnit(markdown: string, unit: string): string {
  return `---\n${UNIT_KEY}: ${JSON.stringify(unit)}\n---\n\n${markdown}`;
}

export function embeddedUnit(path: string | undefined, contentRoot: string): string | undefined {
  if (!path) return undefined;
  const parts = relative(resolve(contentRoot), path).split(sep);
  // A file outside the content root, like a README.md one level above it, is no product's.
  if (parts[0] === "..") return undefined;
  // `<key>/README.md`: a file in `<key>/docs/` has three parts and is a docs page. The name must be one of the
  // two, not an inherited property of the object that holds them (`constructor`).
  return parts.length === 2 && Object.hasOwn(UNITS, parts[1]) ? UNITS[parts[1]] : undefined;
}

interface HastNode {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

const HEADING = /^h([1-6])$/;

function walk(node: HastNode, visit: (node: HastNode) => void) {
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
}

/**
 * Move the headings of a document down so that its top level is an <h3> and
 * each deeper level moves by the same amount (nothing goes past <h6>), and
 * prefix each heading id with `<unit>--`. A link to a heading of the same
 * document follows the new id.
 */
export function nestHeadings(tree: HastNode, unit: string): void {
  const headings: HastNode[] = [];
  walk(tree, (node) => {
    if (node.type === "element" && node.tagName && HEADING.test(node.tagName)) headings.push(node);
  });
  if (headings.length === 0) return;
  const level = (node: HastNode) => Number(HEADING.exec(node.tagName!)![1]);
  const shift = EMBEDDED_TOP_LEVEL - Math.min(...headings.map(level));
  const renamed = new Set<string>();
  for (const heading of headings) {
    heading.tagName = `h${Math.min(level(heading) + shift, 6)}`;
    const id = heading.properties?.id;
    if (typeof id === "string") {
      renamed.add(id);
      heading.properties!.id = `${unit}${PREFIX_SEPARATOR}${id}`;
    }
  }
  walk(tree, (node) => {
    const href = node.type === "element" && node.tagName === "a" ? node.properties?.href : undefined;
    if (typeof href !== "string" || !href.startsWith("#")) return;
    const target = href.slice(1);
    let id = target;
    try {
      id = decodeURIComponent(target);
    } catch {
      // Not valid percent-encoding: compare it as written.
    }
    if (renamed.has(id)) node.properties!.href = `#${unit}${PREFIX_SEPARATOR}${target}`;
  });
}

interface MarkdownFile {
  path?: string;
  data: { astro?: { frontmatter?: Record<string, unknown> } };
}

interface Processor {
  use(plugin: () => (tree: HastNode, file: MarkdownFile) => void): unknown;
}

/**
 * The rehype plugin. The built-in heading ids and the parse of raw HTML run
 * after every configured rehype plugin, so this plugin adds its step last:
 * ids exist and raw `<h1>` elements are elements by then.
 */
export function rehypeEmbeddedHeadings(this: Processor, options: { contentRoot: string }): void {
  this.use(() => (tree, file) => {
    const unit = embeddedUnit(file.path, options.contentRoot);
    if (!unit) return;
    // Only an embedded document's front matter can name its unit: a docs page's cannot.
    const named = file.data.astro?.frontmatter?.[UNIT_KEY];
    nestHeadings(tree, typeof named === "string" && named !== "" ? named : unit);
  });
}
