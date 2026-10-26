import fs from "node:fs";
import { join, relative, resolve as resolvePath } from "node:path";
import git from "isomorphic-git";

// Read access to a tool repo's files at one ref, and to its tags. Local mode
// reads a local clone through git objects only: it never checks out, changes
// the working tree or index, commits, fetches or pushes. The checkout can be a
// linked worktree; gitDirs finds its git dirs the way git does.

export interface RepoFiles {
  /** Every file path under the folder `prefix` (for example `docs/user/`), relative to the repo root, sorted. */
  list(prefix: string): Promise<string[]>;
  /** A file's bytes, or undefined when the ref has no such file. */
  read(path: string): Promise<Uint8Array | undefined>;
}

export interface TagRecord {
  name: string;
  /** True for an annotated tag; false for a lightweight tag. */
  annotated: boolean;
  /** The tagger date of an annotated tag; the commit date of a lightweight tag. */
  date: Date;
  /** The annotated tag message. Empty for a lightweight tag. */
  message: string;
}

export interface RepoTags {
  /** The tag, or undefined when the repo has no tag of that name. */
  read(name: string): Promise<TagRecord | undefined>;
}

export interface GitRef {
  /** Commit the ref names. */
  oid: string;
  /** The full ref name that was found, for example `refs/remotes/origin/wyrd-foo-v2`. */
  ref: string;
}

/** The git dirs of a checkout. In a plain clone both are `<dir>/.git`. */
export interface GitDirs {
  /** The common git dir: objects, refs, packed-refs and config. */
  common: string;
  /** The checkout's own git dir: HEAD and the other per-worktree refs. */
  own: string;
}

/**
 * The git dirs of the checkout at `dir`, found the way git finds them. When
 * `.git` is a file (a linked worktree or a submodule), it holds
 * `gitdir: <path>`, relative to `dir` or absolute; that git dir's `commondir`
 * file, when it has one, names the common git dir, relative to it or absolute.
 */
export function gitDirs(dir: string): GitDirs {
  const dotgit = join(dir, ".git");
  if (!fs.statSync(dotgit, { throwIfNoEntry: false })?.isFile()) return { common: dotgit, own: dotgit };
  const pointer = /^gitdir: (.+)$/m.exec(fs.readFileSync(dotgit, "utf8"))?.[1].trim();
  if (pointer === undefined) throw new Error(`${dotgit} is a file but not a gitdir: pointer`);
  const own = resolvePath(dir, pointer);
  const commondir = join(own, "commondir");
  const common = fs.existsSync(commondir) ? resolvePath(own, fs.readFileSync(commondir, "utf8").trim()) : own;
  return { common, own };
}

/**
 * Resolve a branch of a local clone: the branch of the `origin` remote, else
 * the local branch. Undefined when neither exists.
 */
export async function resolveBranch(dir: string, branch: string): Promise<GitRef | undefined> {
  const dirs = gitDirs(dir);
  for (const ref of [`refs/remotes/origin/${branch}`, `refs/heads/${branch}`]) {
    const oid = await resolve(dirs, ref);
    if (oid !== undefined) return { oid, ref };
  }
  return undefined;
}

/**
 * The commit a ref names: a branch, tag or remote branch name, a full ref,
 * `HEAD`, or a commit id. Undefined when the clone has no such ref.
 */
export async function resolveCommit(dir: string, ref: string): Promise<string | undefined> {
  const dirs = gitDirs(dir);
  const gitdir = dirs.common;
  let oid = await resolve(dirs, ref);
  if (oid === undefined && /^[0-9a-f]{4,40}$/i.test(ref)) {
    oid = await git.expandOid({ fs, gitdir, oid: ref.toLowerCase() }).catch(() => undefined);
  }
  while (oid !== undefined) {
    const object = await git.readObject({ fs, gitdir, oid });
    if (object.type !== "tag") return object.type === "commit" ? oid : undefined;
    oid = (await git.readTag({ fs, gitdir, oid })).tag.object;
  }
  return undefined;
}

/** The clone's `remote.origin.url`, when it has one. */
export async function originUrl(dir: string): Promise<string | undefined> {
  const url: unknown = await git.getConfig({ fs, gitdir: gitDirs(dir).common, path: "remote.origin.url" });
  return typeof url === "string" ? url : undefined;
}

/** `owner/repo` of a GitHub remote URL (https or ssh), when the URL is one. */
export function ownerRepoOf(url: string): string | undefined {
  const match = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([A-Za-z0-9-]+\/[A-Za-z0-9._-]+?)(?:\.git)?\/?$/.exec(url);
  return match?.[1];
}

/** The files of the commit `oid` in the clone at `dir`. */
export function gitFiles(dir: string, oid: string): RepoFiles {
  const gitdir = gitDirs(dir).common;
  const cache = {};
  let paths: Promise<string[]> | undefined;
  const all = () => (paths ??= git.listFiles({ fs, gitdir, ref: oid, cache }).then((list) => list.sort()));
  return {
    async list(prefix) {
      return (await all()).filter((path) => path.startsWith(prefix));
    },
    // Only a path the commit's tree does not hold reads as missing; any other
    // failure (a missing object in a damaged clone) is thrown.
    async read(path) {
      if (!(await all()).includes(path)) return undefined;
      const { blob } = await git.readBlob({ fs, gitdir, oid, filepath: path, cache });
      return blob;
    },
  };
}

/**
 * The files of the working tree at `dir`, as they are on disk, committed or
 * not. For a tool-repo author who checks a change before committing it.
 */
export function workingTreeFiles(dir: string): RepoFiles {
  return {
    async list(prefix) {
      const folder = join(dir, prefix);
      if (!fs.existsSync(folder)) return [];
      return fs
        .readdirSync(folder, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split("\\").join("/"))
        .sort();
    },
    async read(path) {
      const file = join(dir, path);
      return fs.existsSync(file) && fs.statSync(file).isFile() ? new Uint8Array(fs.readFileSync(file)) : undefined;
    },
  };
}

/** The tags of the clone at `dir`. */
export function gitTags(dir: string): RepoTags {
  const dirs = gitDirs(dir);
  const gitdir = dirs.common;
  const cache = {};
  return {
    async read(name) {
      const oid = await resolve(dirs, `refs/tags/${name}`);
      if (oid === undefined) return undefined;
      const object = await git.readObject({ fs, gitdir, oid, cache });
      if (object.type === "tag") {
        const { tag } = await git.readTag({ fs, gitdir, oid, cache });
        return { name, annotated: true, date: new Date(tag.tagger.timestamp * 1000), message: tag.message };
      }
      const { commit } = await git.readCommit({ fs, gitdir, oid, cache });
      return { name, annotated: false, date: new Date(commit.committer.timestamp * 1000), message: "" };
    },
  };
}

/**
 * A per-worktree ref, which git keeps in the checkout's own git dir: `HEAD`,
 * another pseudo-ref such as `ORIG_HEAD`, or one under `refs/worktree/`,
 * `refs/bisect/` or `refs/rewritten/`.
 */
function perWorktree(ref: string): boolean {
  return /^[A-Z][A-Z_]*$/.test(ref) || /^refs\/(worktree|bisect|rewritten)\//.test(ref);
}

async function resolve(dirs: GitDirs, ref: string): Promise<string | undefined> {
  try {
    if (!perWorktree(ref) || dirs.own === dirs.common) return await git.resolveRef({ fs, gitdir: dirs.common, ref });
    // One step in the checkout's own git dir: a commit id, or the name of a
    // shared ref (HEAD names a branch), which the common git dir resolves.
    const target = await git.resolveRef({ fs, gitdir: dirs.own, ref, depth: 2 });
    return /^[0-9a-f]{40}$/.test(target) ? target : await git.resolveRef({ fs, gitdir: dirs.common, ref: target });
  } catch (error) {
    if (isNotFound(error)) return undefined;
    throw error;
  }
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && (error as { code?: string }).code === "NotFoundError";
}
