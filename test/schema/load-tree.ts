import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parse } from "yaml";
import {
  docsFileSchema,
  isPageFile,
  pageSchema,
  parseWith,
  type ContractIssue,
  type DocsTree,
} from "../../src/schema/index.ts";

export const FIXTURES = new URL("./fixtures/", import.meta.url).pathname;
export const KIND_FIXTURES = ["cli", "app", "mcp-server", "devcontainer-feature", "devcontainer-image"] as const;

export interface LoadedTree {
  tree?: DocsTree;
  issues: ContractIssue[];
}

/** A parsed YAML document that a test changes before it is validated. */
export type Raw = Record<string, any>;

/** The raw docs.yml of a fixture tree, for tests that change it before parsing. */
export function readRawDocs(name: string): Raw {
  return parse(readFileSync(join(FIXTURES, name, "docs.yml"), "utf8"));
}

/**
 * Load a fixture as a docs/user/ tree, the way the publisher sees one. The
 * shared fixtures/assets/ folder is the tree's assets/ folder.
 */
export function loadTree(name: string, raw: unknown = readRawDocs(name)): LoadedTree {
  const root = join(FIXTURES, name);
  const docsFile = `${name}/docs.yml`;
  const issues: ContractIssue[] = [];
  const docs = parseWith(docsFileSchema, raw, docsFile);
  if (!docs.ok) issues.push(...docs.issues);
  const pages: DocsTree["pages"][number][] = [];
  const keys = Object.keys((raw as Raw | undefined)?.products ?? {});
  for (const path of walk(root).filter((p) => isPageFile(p, keys))) {
    const page = parseWith(pageSchema, frontMatter(readFileSync(join(root, path), "utf8")), `${name}/${path}`);
    if (page.ok) pages.push({ path: `${name}/${path}`, data: page.data });
    else issues.push(...page.issues);
  }
  const files = new Map<string, Uint8Array>();
  for (const path of walk(root)) files.set(path, readFileSync(join(root, path)));
  for (const path of walk(join(FIXTURES, "assets"))) files.set(`assets/${path}`, readFileSync(join(FIXTURES, "assets", path)));
  return { issues, tree: docs.ok ? { docsFile, docs: docs.data, pages, files } : undefined };
}

export function frontMatter(source: string): unknown {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source);
  if (match === null) throw new Error("page has no front matter");
  return parse(match[1]);
}

function walk(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)))
    .sort();
}
