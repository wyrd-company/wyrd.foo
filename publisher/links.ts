import { posix } from "node:path";

// Relative links in a docs page. Only docs/user/ is published, so a link
// that resolves outside it points at a file the site does not have.

export interface PageLink {
  /** 1-based line in the page file. */
  line: number;
  /** The link as written. */
  target: string;
  /** The linked path, relative to the repo root. */
  resolved: string;
}

const INLINE = /!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+[^)]*)?\)/g;
const REFERENCE = /^\s{0,3}\[[^\]]+\]:\s*<?([^\s>]+)>?/;
const HTML = /\s(?:src|href)\s*=\s*["']([^"']+)["']/gi;

/** The relative links of a page at `pagePath` (repo-relative) that resolve outside `root`. */
export function linksOutside(pagePath: string, markdown: string, root: string): PageLink[] {
  const outside: PageLink[] = [];
  const dir = posix.dirname(pagePath);
  let fence: string | undefined;
  markdown.split(/\r?\n/).forEach((text, index) => {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(text)?.[1];
    if (marker !== undefined && (fence === undefined || marker.startsWith(fence))) {
      fence = fence === undefined ? marker : undefined;
      return;
    }
    if (fence !== undefined) return;
    const line = text.replace(/`[^`]*`/g, "");
    const targets = [...line.matchAll(INLINE), ...line.matchAll(HTML)].map((match) => match[1]);
    const reference = REFERENCE.exec(line)?.[1];
    if (reference !== undefined) targets.push(reference);
    for (const target of targets) {
      const path = relativePath(target);
      if (path === undefined) continue;
      const resolved = posix.normalize(posix.join(dir, path));
      if (!resolved.startsWith(root)) outside.push({ line: index + 1, target, resolved });
    }
  });
  return outside;
}

// The path part of a relative link; undefined for a URL, a root path or an anchor.
function relativePath(target: string): string | undefined {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("/") || target.startsWith("#")) return undefined;
  const path = target.replace(/[?#].*$/, "");
  if (path === "") return undefined;
  try {
    return decodeURI(path);
  } catch {
    return path;
  }
}
