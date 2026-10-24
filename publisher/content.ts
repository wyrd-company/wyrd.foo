import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parse, stringify } from "yaml";
import { toolFileSchema } from "../src/schema/index.ts";
import type { RepoResult } from "./compute.ts";
import { Findings, type Finding } from "./report.ts";

// The content folder: `<root>/<key>/` for every product of every repo. Each
// `tool.yaml` records the repo that owns its key in `owner`. A repo writes
// only keys it owns or that nobody owns, and deletes the folders it owns that
// are no longer in its map.

export const TOOL_FILE = "tool.yaml";

export interface ContentFolder {
  /** `owner/repo`, when the folder's tool.yaml names one. */
  owner?: string;
  /** The `featured` block, carried forward to the next write. */
  featured?: unknown;
  /** Why the folder's owner cannot be read. */
  problem?: string;
}

export interface ApplyResult {
  findings: Finding[];
  failed: boolean;
  written: string[];
  deleted: string[];
}

/** Every product folder in the content root, by key. */
export function readContent(root: string): Map<string, ContentFolder> {
  const folders = new Map<string, ContentFolder>();
  if (!existsSync(root)) return folders;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const file = join(root, entry.name, TOOL_FILE);
    if (!existsSync(file)) {
      folders.set(entry.name, { problem: `${TOOL_FILE} does not exist` });
      continue;
    }
    try {
      const tool = parse(readFileSync(file, "utf8")) as { owner?: unknown; featured?: unknown } | null;
      const owner = typeof tool?.owner === "string" ? tool.owner : undefined;
      folders.set(entry.name, owner === undefined ? { problem: `${TOOL_FILE} names no owner` } : { owner, featured: tool?.featured });
    } catch (error) {
      folders.set(entry.name, { problem: `${TOOL_FILE} is not YAML: ${(error as Error).message}` });
    }
  }
  return folders;
}

/**
 * Write a computed repo into the content root. Nothing is written when the
 * repo failed or when it names a key another repo owns.
 */
export function applyRepo(root: string, result: RepoResult): ApplyResult {
  const findings = new Findings(false);
  if (result.failed) return { findings: [], failed: true, written: [], deleted: [] };
  const existing = readContent(root);
  const keys = new Set(result.products.map((product) => product.key));

  for (const key of keys) {
    const folder = existing.get(key);
    if (folder === undefined) continue;
    if (folder.problem !== undefined) {
      findings.error({ key, message: `content/${key}/ has an unknown owner (${folder.problem}); it is not replaced` });
    } else if (folder.owner !== result.ownerRepo) {
      findings.error({ key, message: `key ${key} is owned by ${folder.owner}; ${result.ownerRepo} cannot publish it` });
    }
  }
  if (findings.failed) return { findings: findings.list, failed: true, written: [], deleted: [] };

  const outputs = result.products.map((product) => {
    const featured = product.feature ? undefined : existing.get(product.key)?.featured;
    if (featured === undefined) return product;
    const tool = { ...product.tool, featured };
    if (toolFileSchema.safeParse(tool).success) return { ...product, tool };
    findings.warning({ key: product.key, message: `content/${product.key}/${TOOL_FILE}: featured is not valid; it is dropped` });
    return product;
  });

  mkdirSync(root, { recursive: true });
  for (const output of outputs) {
    const staging = join(root, `.${output.key}.staging-${process.pid}`);
    rmSync(staging, { recursive: true, force: true });
    mkdirSync(staging, { recursive: true });
    writeFileSync(join(staging, TOOL_FILE), stringify(output.tool, { lineWidth: 0 }));
    for (const [path, bytes] of output.files) {
      mkdirSync(dirname(join(staging, path)), { recursive: true });
      writeFileSync(join(staging, path), bytes);
    }
    rmSync(join(root, output.key), { recursive: true, force: true });
    renameSync(staging, join(root, output.key));
  }

  const deleted: string[] = [];
  for (const [key, folder] of existing) {
    if (folder.owner === result.ownerRepo && !keys.has(key)) {
      rmSync(join(root, key), { recursive: true, force: true });
      deleted.push(key);
    }
  }
  return { findings: findings.list, failed: false, written: [...keys].sort(), deleted: deleted.sort() };
}
