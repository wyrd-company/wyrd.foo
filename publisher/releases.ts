import type { TagRecord } from "./repo-files.ts";

// Release data for a product: the GitHub Release on the unit's primary tag,
// or, when none is reachable in local mode, the local tag and the unit
// changelog. Feature entries always use the tag and the changelog.

export interface ReleaseData {
  version: string;
  date: Date;
  url?: string;
  notes?: string;
}

/** Why a GitHub Release could not be read. */
export type ReleaseLookupReason =
  /** The repo has no Release on that tag (or the token cannot see the repo). */
  | "not-found"
  /** The API refused the request: missing or bad credentials, or a rate limit. */
  | "denied"
  /** No answer: a network failure or a timeout. */
  | "unreachable"
  /** An answer that is not a Release. */
  | "malformed";

export class ReleaseLookupError extends Error {
  readonly reason: ReleaseLookupReason;
  readonly tag: string;

  constructor(reason: ReleaseLookupReason, tag: string, detail: string) {
    super(`GitHub Release for tag ${tag}: ${reason}: ${detail}`);
    this.name = "ReleaseLookupError";
    this.reason = reason;
    this.tag = tag;
  }
}

/** A GitHub Release: the release data without the version, which the tag names. */
export interface GitHubRelease {
  date: Date;
  url: string;
  notes?: string;
}

/** Reads GitHub Releases. Throws ReleaseLookupError when it cannot return one. */
export interface ReleaseLookup {
  release(ownerRepo: string, tag: string): Promise<GitHubRelease>;
}

export interface GitHubReleasesOptions {
  /** A token for private repos and a higher rate limit. Optional. */
  token?: string;
  /** Base URL of the REST API. */
  apiUrl?: string;
  /** Bound on one request, in milliseconds. */
  timeoutMs?: number;
  fetch?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 10_000;

/** GitHub Releases over the REST API. It only reads. */
export function gitHubReleases(options: GitHubReleasesOptions = {}): ReleaseLookup {
  const apiUrl = options.apiUrl ?? "https://api.github.com";
  const doFetch = options.fetch ?? fetch;
  return {
    async release(ownerRepo, tag) {
      const url = `${apiUrl}/repos/${ownerRepo}/releases/tags/${encodeURIComponent(tag)}`;
      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "User-Agent": "wyrd-foo-publisher",
        "X-GitHub-Api-Version": "2022-11-28",
      };
      if (options.token) headers.Authorization = `Bearer ${options.token}`;
      let response: Response;
      try {
        response = await doFetch(url, { headers, signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS) });
      } catch (error) {
        throw new ReleaseLookupError("unreachable", tag, (error as Error).message);
      }
      if (response.status === 404) throw new ReleaseLookupError("not-found", tag, "HTTP 404");
      if ([401, 403, 429].includes(response.status)) throw new ReleaseLookupError("denied", tag, `HTTP ${response.status}`);
      if (!response.ok) throw new ReleaseLookupError("unreachable", tag, `HTTP ${response.status}`);
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new ReleaseLookupError("malformed", tag, "the answer is not JSON");
      }
      return releaseOf(body, tag);
    },
  };
}

function releaseOf(body: unknown, tag: string): GitHubRelease {
  const release = body as { tag_name?: unknown; published_at?: unknown; html_url?: unknown; body?: unknown; draft?: unknown };
  if (typeof release !== "object" || release === null || release.tag_name !== tag) {
    throw new ReleaseLookupError("malformed", tag, "the answer is not the Release of that tag");
  }
  if (release.draft === true) throw new ReleaseLookupError("not-found", tag, "the Release is a draft");
  const date = typeof release.published_at === "string" ? new Date(release.published_at) : undefined;
  if (date === undefined || Number.isNaN(date.getTime()) || typeof release.html_url !== "string") {
    throw new ReleaseLookupError("malformed", tag, "the Release has no published_at or html_url");
  }
  const notes = typeof release.body === "string" && release.body.trim() !== "" ? release.body : undefined;
  return { date, url: release.html_url, ...(notes === undefined ? {} : { notes }) };
}

/** Release data from a local tag; the notes are the version's changelog section. */
export function releaseFromTag(tag: TagRecord, version: string, changelog: string | undefined): ReleaseData {
  const notes = changelog === undefined ? undefined : changelogSection(changelog, version);
  return { version, date: tag.date, ...(notes === undefined ? {} : { notes }) };
}

/**
 * The body of the `## <version>` section of an intentional changelog, or
 * undefined when it has none.
 */
export function changelogSection(changelog: string, version: string): string | undefined {
  const lines = changelog.split(/\r?\n/);
  const start = lines.findIndex((line) => /^##\s+/.test(line) && line.replace(/^##\s+/, "").trim() === version);
  if (start === -1) return undefined;
  const end = lines.findIndex((line, index) => index > start && /^##\s/.test(line));
  const body = lines.slice(start + 1, end === -1 ? undefined : end).join("\n").trim();
  return body === "" ? undefined : body;
}
