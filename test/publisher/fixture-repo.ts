import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { parse, stringify } from "yaml";
import { ReleaseLookupError, type GitHubRelease, type ReleaseLookup, type ReleaseLookupReason } from "../../publisher/index.ts";

// Fixture tool repos, made with real git in a temp folder. The docs live on a
// wyrd-foo-v2 branch; the working tree is left on main, so the publisher must
// read the branch through git objects.

export const OWNER = "sample-org";

export type Files = Record<string, string | Uint8Array>;

export interface TagSpec {
  name: string;
  /** Annotated tag message; omit for a lightweight tag. */
  message?: string;
  /** Tagger (or commit) date, ISO 8601. */
  date?: string;
}

/** A temp folder with clones under `tools/` and a content folder at `content/`. */
export class Workspace {
  readonly root: string;
  readonly toolsDir: string;
  readonly contentDir: string;

  constructor() {
    this.root = mkdtempSync(join(tmpdir(), "publisher-test-"));
    this.toolsDir = join(this.root, "tools");
    this.contentDir = join(this.root, "content");
    mkdirSync(this.toolsDir);
  }

  /** Make a clone with `files` committed on `branch` and `tags` on that commit. */
  repo(name: string, files: Files, options: { tags?: TagSpec[]; branch?: string | null; origin?: string } = {}): string {
    const dir = join(this.toolsDir, name);
    mkdirSync(dir);
    git(dir, "init", "-q", "-b", "main");
    git(dir, "remote", "add", "origin", options.origin ?? `git@github.com:${OWNER}/${name}.git`);
    writeFileSync(join(dir, "README.md"), `# ${name}\n`);
    git(dir, "add", "README.md");
    git(dir, "commit", "-q", "-m", "main");
    if (options.branch === null) return dir;
    git(dir, "checkout", "-q", "-b", options.branch ?? "wyrd-foo-v2");
    this.commit(dir, files, options.tags ?? []);
    git(dir, "checkout", "-q", "main");
    return dir;
  }

  /** Replace the files of the current branch tip of `branch` with `files`, as a new commit. */
  update(dir: string, files: Files, branch = "wyrd-foo-v2") {
    git(dir, "checkout", "-q", branch);
    git(dir, "rm", "-q", "-r", "--ignore-unmatch", ".");
    this.commit(dir, files, []);
    git(dir, "checkout", "-q", "main");
  }

  private commit(dir: string, files: Files, tags: TagSpec[]) {
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), content);
    }
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "docs");
    for (const tag of tags) {
      const env: Record<string, string> = tag.date === undefined ? {} : { GIT_COMMITTER_DATE: tag.date };
      if (tag.message === undefined) git(dir, { env }, "tag", tag.name);
      else git(dir, { env }, "tag", "-a", tag.name, "-m", tag.message);
    }
  }

  /** Every file under `content/<key>/`, sorted. */
  files(key: string): string[] {
    return walk(join(this.contentDir, key));
  }

  tool(key: string): Record<string, any> {
    return parse(readFileSync(join(this.contentDir, key, "tool.yaml"), "utf8"));
  }

  text(key: string, path: string): string {
    return readFileSync(join(this.contentDir, key, path), "utf8");
  }

  remove() {
    rmSync(this.root, { recursive: true, force: true });
  }
}

/** Run git with an environment that has no inherited GIT_* variable or user config. */
export function git(dir: string, ...args: (string | { env: Record<string, string> })[]): string {
  const extra = typeof args[0] === "object" ? (args.shift() as { env: Record<string, string> }).env : {};
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (!name.startsWith("GIT_") && value !== undefined) env[name] = value;
  }
  Object.assign(env, {
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "Sample Author",
    GIT_AUTHOR_EMAIL: "author@example.com",
    GIT_COMMITTER_NAME: "Sample Author",
    GIT_COMMITTER_EMAIL: "author@example.com",
    ...extra,
  });
  return execFileSync("git", args as string[], { cwd: dir, env, encoding: "utf8" });
}

function walk(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)))
    .sort();
}

/** GitHub Releases from a table keyed by `owner/repo@tag`; a reason makes the lookup fail. */
export function fakeReleases(table: Record<string, GitHubRelease | ReleaseLookupReason>): ReleaseLookup & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async release(ownerRepo, tag) {
      calls.push(`${ownerRepo}@${tag}`);
      const entry = table[`${ownerRepo}@${tag}`] ?? "not-found";
      if (typeof entry === "string") throw new ReleaseLookupError(entry, tag, "from the fixture");
      return entry;
    },
  };
}

// --- file builders ----------------------------------------------------------

export const SQUARE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32"/></svg>\n';
export const WIDE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 32"><rect width="64" height="32"/></svg>\n';

export function yaml(value: unknown): string {
  return stringify(value);
}

export function page(product: string, title: string, body = "Body.\n", extra: Record<string, unknown> = {}): string {
  return `---\n${stringify({ title, product, ...extra }).trimEnd()}\n---\n\n${body}`;
}

/** A full product entry with the fields every product needs. */
export function product(name: string, kinds: unknown[], extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name,
    version: "1.2.0",
    "docs-version": "1.0.0",
    tagline: `The ${name} sample.`,
    blurb: `A sample product named ${name}.`,
    status: "stable",
    category: "Agent Tooling",
    highlights: ["Does one sample thing."],
    media: [{ src: "assets/demo.svg", caption: "A sample screen." }],
    kinds,
    ...extra,
  };
}

export const cliKind = { kind: "cli", install: [{ method: "npm", os: ["linux"], command: "npm install -g sample" }] };
export const appKind = { kind: "app", install: [{ method: "docker", command: "docker run --rm sample" }] };

/** A contract-1 intentional config with one primary tag per unit. */
export function intentional(units: Record<string, { path: string; template: string; projections?: unknown[] }>): string {
  const releaseUnits: Record<string, unknown> = {};
  for (const [id, unit] of Object.entries(units)) {
    releaseUnits[id] = {
      path: unit.path,
      projections: unit.projections ?? [],
      tags: { primary: { role: "primary", template: unit.template } },
    };
  }
  return stringify({ contract: "contract-1", "release-units": releaseUnits });
}

export function changelog(...versions: [string, string][]): string {
  return `# Changelog\n\n${versions.map(([version, line]) => `## ${version}\n\n### Features\n\n- ${line}\n`).join("\n")}`;
}
