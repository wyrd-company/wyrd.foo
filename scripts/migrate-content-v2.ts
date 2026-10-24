// One-time migration of the v1 `content/<key>/` folders to the v2 ingested
// format (the format the publisher writes). Run it with plain Node:
//
//   node scripts/migrate-content-v2.ts [--from content] [--to .content-v2]
//
// Everything is read and validated against the shared docs contract before
// anything is written, so a failed run changes nothing. `--to` may equal
// `--from` to convert a folder in place.

import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { isMap, isScalar, parse, parseDocument, stringify } from "yaml";
import {
  CATEGORIES,
  formatIssue,
  pageSchema,
  parseWith,
  toolFileSchema,
  type ContractIssue,
} from "../src/schema/index.ts";

/** Version of a product when the v1 format has none. The publisher overwrites it. */
export const FILL_VERSION = "0.1.0";

const PLACEHOLDER_MEDIA = "assets/placeholder.svg";
const PLACEHOLDER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" role="img">' +
  '<rect width="640" height="360" fill="#e5e7eb"/></svg>\n';

// v1 categories that are not in the closed list, and the category they become.
const CATEGORY_RENAMES: Record<string, (typeof CATEGORIES)[number]> = {
  "Code Quality": "Code Intelligence",
  "Developer Tools": "Dev Containers",
  Development: "Agent Tooling",
};
// A product whose v1 category maps to a different home than the rename above.
const CATEGORY_BY_KEY: Record<string, (typeof CATEGORIES)[number]> = {
  toha: "Templates & Scaffolding",
};

// The v1 format records no kind. Products are CLIs unless listed here.
const APP_KEYS = new Set(["trowel", "wyrwood", "xolotl"]);

const DESKTOP = ["macos", "linux", "windows"] as const;
const INSTALL_BY_LABEL: Record<string, { method: string; os?: readonly string[]; label?: string }> = {
  Homebrew: { method: "homebrew", os: ["macos", "linux"] },
  Cargo: { method: "cargo", os: DESKTOP },
  "Cargo (Git)": { method: "cargo", os: DESKTOP, label: "Git" },
  npm: { method: "npm", os: DESKTOP },
  npx: { method: "npx", os: DESKTOP },
  APT: { method: "apt", os: ["linux"] },
  RPM: { method: "rpm", os: ["linux"] },
  AUR: { method: "aur", os: ["linux"] },
  Docker: { method: "docker" },
};

/** A v1 folder that cannot be converted, or a result that does not validate. */
export class MigrationError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(`migration failed with ${issues.length} issue(s):\n${issues.map((issue) => `  ${issue}`).join("\n")}`);
    this.name = "MigrationError";
    this.issues = issues;
  }
}

export interface MigrationResult {
  /** Product keys written, sorted. */
  keys: string[];
  /** Each field the v1 format could not supply, and what it was filled with. */
  fills: string[];
}

interface Converted {
  key: string;
  toolYaml: string;
  pages: Map<string, string>;
  /** Every other file under `docs/`, by path relative to `docs/`. */
  assets: Map<string, Uint8Array>;
}

export function migrate(from: string, to: string): MigrationResult {
  const keys = readdirSync(from, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  if (keys.length === 0) throw new MigrationError([`${from}: holds no product folders`]);

  const problems: string[] = [];
  const fills: string[] = [];
  const converted: Converted[] = [];
  for (const key of keys) {
    try {
      converted.push(convert(from, key, fills));
    } catch (error) {
      if (!(error instanceof MigrationError)) throw error;
      problems.push(...error.issues);
    }
  }
  if (problems.length > 0) throw new MigrationError(problems);

  for (const product of converted) write(to, product);
  return { keys, fills };
}

function convert(from: string, key: string, fills: string[]): Converted {
  const dir = join(from, key);
  const file = `${key}/tool.yaml`;
  const old = parse(readFileSync(join(dir, "tool.yaml"), "utf8")) as Record<string, any> | null;
  const owner = /^https:\/\/github\.com\/([^/]+\/[^/]+?)\/?$/.exec(String(old?.repo ?? ""))?.[1];
  if (old === null || typeof old !== "object" || !Array.isArray(old.install) || owner === undefined) {
    throw new MigrationError([`${file}: is not a v1 tool.yaml (needs repo: https://github.com/<owner>/<repo> and install[])`]);
  }

  const { pages, assets } = readDocs(dir, key);
  const category = CATEGORY_BY_KEY[key] ?? CATEGORY_RENAMES[old.category] ?? old.category;
  if (category !== old.category) fills.push(`${key}: category: ${old.category} -> ${category} (closed list)`);

  const install = old.install.map((item: { label: string; command: string }, index: number) => {
    const known = INSTALL_BY_LABEL[item.label];
    if (known === undefined) throw new MigrationError([`${file}: install[${index}]: unknown label ${item.label}`]);
    return { ...known, ...(index === 0 ? { default: true } : {}), command: item.command };
  });
  const kind = APP_KEYS.has(key) ? "app" : "cli";
  fills.push(`${key}: kinds: ${kind} with ${install.length} install method(s) from the v1 labels`);
  fills.push(`${key}: highlights: the tagline`);
  fills.push(`${key}: version, docs-version: ${FILL_VERSION}`);

  const media = pickMedia(key, pages, assets, fills);
  const entry = {
    name: old.name,
    version: FILL_VERSION,
    "docs-version": FILL_VERSION,
    "release-unit": key,
    tagline: old.tagline,
    blurb: old.blurb,
    status: old.status,
    category,
    ...(old.order === undefined ? {} : { order: old.order }),
    kinds: [{ kind, install }],
    highlights: [old.tagline],
    media: [media],
  };
  const tool = { ...entry, owner };

  const problems: ContractIssue[] = [];
  const toolResult = parseWith(toolFileSchema, tool, file);
  if (!toolResult.ok) problems.push(...toolResult.issues);

  const pageText = new Map<string, string>();
  for (const [name, source] of pages) {
    const path = `${key}/docs/${name}`;
    const { text, front } = addProduct(source, key, path);
    const result = parseWith(pageSchema, front, path);
    if (!result.ok) problems.push(...result.issues);
    pageText.set(name, text);
  }
  if (problems.length > 0) throw new MigrationError(problems.map(formatIssue));

  return { key, toolYaml: stringify(tool, { lineWidth: 100 }), pages: pageText, assets };
}

function readDocs(dir: string, key: string) {
  const root = join(dir, "docs");
  const pages = new Map<string, string>();
  const assets = new Map<string, Uint8Array>();
  for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = relative(root, join(entry.parentPath, entry.name)).split("\\").join("/");
    if (path.endsWith(".md") && !path.includes("/")) pages.set(path, readFileSync(join(root, path), "utf8"));
    else assets.set(path, readFileSync(join(root, path)));
  }
  if (pages.size === 0) throw new MigrationError([`${key}/docs: holds no pages`]);
  return { pages, assets };
}

// The first image a page shows, by page order, is the product's hero media. A
// product that shows none gets a placeholder file, so the entry validates.
function pickMedia(key: string, pages: Map<string, string>, assets: Map<string, Uint8Array>, fills: string[]) {
  const ordered = [...pages].sort(([, a], [, b]) => orderOf(a) - orderOf(b));
  for (const [, source] of ordered) {
    for (const match of source.matchAll(/!\[([^\]\n]*)\]\(([^)\s]+)\)/g)) {
      const [, alt, src] = match;
      if (assets.has(src) && alt.trim() !== "") return { src, caption: alt.trim() };
    }
  }
  assets.set(PLACEHOLDER_MEDIA, new TextEncoder().encode(PLACEHOLDER_SVG));
  fills.push(`${key}: media: placeholder ${PLACEHOLDER_MEDIA} (no page shows an image)`);
  return { src: PLACEHOLDER_MEDIA, caption: "Placeholder until the product has media." };
}

function orderOf(source: string): number {
  const order = Number(/^order:\s*(\d+)/m.exec(source)?.[1]);
  return Number.isNaN(order) ? Number.MAX_SAFE_INTEGER : order;
}

// Adds `product: <key>` after `title`, leaving the rest of the front matter
// (comments included) and the body as they are.
function addProduct(source: string, key: string, path: string) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  if (match === null) throw new MigrationError([`${path}: has no front matter`]);
  const doc = parseDocument(match[1]);
  const map = doc.contents;
  if (!isMap(map)) throw new MigrationError([`${path}: front matter is not a mapping`]);
  if (doc.has("product")) throw new MigrationError([`${path}: already names a product`]);
  const title = map.items.findIndex((item) => isScalar(item.key) && item.key.value === "title");
  map.items.splice(title + 1, 0, doc.createPair("product", key));
  return { text: `---\n${String(doc).trimEnd()}\n---\n${source.slice(match[0].length)}`, front: doc.toJS() };
}

function write(to: string, product: Converted) {
  const dir = join(to, product.key);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "docs"), { recursive: true });
  writeFileSync(join(dir, "tool.yaml"), product.toolYaml);
  for (const [name, text] of product.pages) writeFileSync(join(dir, "docs", name), text);
  for (const [name, bytes] of product.assets) {
    mkdirSync(dirname(join(dir, "docs", name)), { recursive: true });
    writeFileSync(join(dir, "docs", name), bytes);
  }
}

function option(args: string[], name: string, fallback: string): string {
  const at = args.indexOf(name);
  return at === -1 ? fallback : (args[at + 1] ?? fallback);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  try {
    const { keys, fills } = migrate(option(args, "--from", "content"), option(args, "--to", ".content-v2"));
    console.log(`migrated ${keys.length} products: ${keys.join(", ")}`);
    for (const fill of fills) console.log(`  fill: ${fill}`);
  } catch (error) {
    if (!(error instanceof MigrationError)) throw error;
    console.error(error.message);
    process.exitCode = 1;
  }
}
