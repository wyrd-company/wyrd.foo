import fs from "node:fs";
import { join, relative } from "node:path";
import git from "isomorphic-git";

// Read access to a tool repo's files at one ref, and to its tags. Local mode
// reads a local clone through git objects only: it never checks out, changes
// the working tree or index, commits, fetches or pushes.

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

/**
 * Resolve a branch of a local clone: the local branch, else the branch of
 * the `origin` remote. Undefined when neither exists.
 */
export async function resolveBranch(dir: string, branch: string): Promise<GitRef | undefined> {
  for (const ref of [`refs/heads/${branch}`, `refs/remotes/origin/${branch}`]) {
    const oid = await resolve(dir, ref);
    if (oid !== undefined) return { oid, ref };
  }
  return undefined;
}

/**
 * The commit a ref names: a branch, tag or remote branch name, a full ref,
 * `HEAD`, or a commit id. Undefined when the clone has no such ref.
 */
export async function resolveCommit(dir: string, ref: string): Promise<string | undefined> {
  let oid = await resolve(dir, ref);
  if (oid === undefined && /^[0-9a-f]{4,40}$/i.test(ref)) {
    oid = await git.expandOid({ fs, dir, oid: ref.toLowerCase() }).catch(() => undefined);
  }
  while (oid !== undefined) {
    const object = await git.readObject({ fs, dir, oid });
    if (object.type !== "tag") return object.type === "commit" ? oid : undefined;
    oid = (await git.readTag({ fs, dir, oid })).tag.object;
  }
  return undefined;
}

/** The clone's `remote.origin.url`, when it has one. */
export async function originUrl(dir: string): Promise<string | undefined> {
  const url: unknown = await git.getConfig({ fs, dir, path: "remote.origin.url" });
  return typeof url === "string" ? url : undefined;
}

/** `owner/repo` of a GitHub remote URL (https or ssh), when the URL is one. */
export function ownerRepoOf(url: string): string | undefined {
  const match = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([A-Za-z0-9-]+\/[A-Za-z0-9._-]+?)(?:\.git)?\/?$/.exec(url);
  return match?.[1];
}

/** The files of the commit `oid` in the clone at `dir`. */
export function gitFiles(dir: string, oid: string): RepoFiles {
  const cache = {};
  return {
    async list(prefix) {
      return (await git.listFiles({ fs, dir, ref: oid, cache })).filter((path) => path.startsWith(prefix)).sort();
    },
    async read(path) {
      try {
        const { blob } = await git.readBlob({ fs, dir, oid, filepath: path, cache });
        return blob;
      } catch (error) {
        if (isNotFound(error)) return undefined;
        throw error;
      }
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
  const cache = {};
  return {
    async read(name) {
      const oid = await resolve(dir, `refs/tags/${name}`);
      if (oid === undefined) return undefined;
      const object = await git.readObject({ fs, dir, oid, cache });
      if (object.type === "tag") {
        const { tag } = await git.readTag({ fs, dir, oid, cache });
        return { name, annotated: true, date: new Date(tag.tagger.timestamp * 1000), message: tag.message };
      }
      const { commit } = await git.readCommit({ fs, dir, oid, cache });
      return { name, annotated: false, date: new Date(commit.committer.timestamp * 1000), message: "" };
    },
  };
}

async function resolve(dir: string, ref: string): Promise<string | undefined> {
  try {
    return await git.resolveRef({ fs, dir, ref });
  } catch (error) {
    if (isNotFound(error)) return undefined;
    throw error;
  }
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && (error as { code?: string }).code === "NotFoundError";
}
