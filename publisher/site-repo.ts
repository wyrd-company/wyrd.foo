import fs from "node:fs";
import git, { Errors, type HttpClient } from "isomorphic-git";

// The wyrd.foo repo as the publish action sees it: a shallow clone of one
// branch over HTTPS, a commit of the content folder, and a push. It runs on
// isomorphic-git, so the action spawns no git process. The token goes only to
// the URL it was given: the HTTP client refuses redirects.

/** Bound on one HTTP request to the site repo, in milliseconds. */
const REQUEST_TIMEOUT_MS = 60_000;

export interface SiteRemote {
  /** Clone URL of the site repo, for example `https://github.com/wyrd-company/wyrd.foo.git`. */
  url: string;
  /** The branch the publish writes to. */
  branch: string;
  /** A token with contents write access to the site repo. */
  token?: string;
}

export interface Identity {
  name: string;
  email: string;
}

/** Why a push did not update the branch. */
export class PushRejected extends Error {
  constructor(detail: string) {
    super(`push rejected: ${detail}`);
    this.name = "PushRejected";
  }
}

/** An HTTP client for isomorphic-git on the platform fetch, with no redirects and a bound per request. */
export const siteHttp: HttpClient = {
  async request({ url, method = "GET", headers = {}, body }) {
    const payload = body === undefined ? undefined : Buffer.concat(await collect(body));
    const response = await fetch(url, {
      method,
      headers,
      body: payload,
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const bytes = new Uint8Array(await response.arrayBuffer());
    return {
      url,
      method,
      statusCode: response.status,
      statusMessage: response.statusText,
      headers: Object.fromEntries(response.headers),
      body: once(bytes),
    };
  },
};

async function* once(bytes: Uint8Array): AsyncIterableIterator<Uint8Array> {
  yield bytes;
}

async function collect(body: AsyncIterableIterator<Uint8Array> | Uint8Array[]): Promise<Uint8Array[]> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of body) chunks.push(chunk);
  return chunks;
}

const onAuth = (remote: SiteRemote) => () => (remote.token === undefined ? { cancel: true } : { username: "x-access-token", password: remote.token });

/** Clone the branch at depth 1 into `dir` and return its tip. */
export async function cloneSite(remote: SiteRemote, dir: string): Promise<string> {
  await git.clone({
    fs,
    http: siteHttp,
    dir,
    url: remote.url,
    ref: remote.branch,
    singleBranch: true,
    depth: 1,
    noTags: true,
    onAuth: onAuth(remote),
  });
  return git.resolveRef({ fs, dir, ref: "HEAD" });
}

/** The tip of the branch on the remote, read without changing the clone. */
export async function remoteTip(remote: SiteRemote): Promise<string | undefined> {
  const refs = await git.listServerRefs({ http: siteHttp, url: remote.url, prefix: `refs/heads/${remote.branch}`, onAuth: onAuth(remote) });
  return refs.find((ref) => ref.ref === `refs/heads/${remote.branch}`)?.oid;
}

/**
 * Stage every change under `folder` (additions, edits and deletions) and
 * commit it. Returns the files changed, sorted, and the commit; no commit is
 * made when nothing changed.
 */
export async function commitFolder(dir: string, folder: string, message: string, author: Identity): Promise<{ changed: string[]; commit?: string }> {
  const changed: string[] = [];
  for (const [path, head, workdir, stage] of await git.statusMatrix({ fs, dir, filepaths: [folder] })) {
    if (head === 1 && workdir === 1 && stage === 1) continue;
    if (workdir === 0) await git.remove({ fs, dir, filepath: path });
    else await git.add({ fs, dir, filepath: path });
    changed.push(path);
  }
  if (changed.length === 0) return { changed };
  const commit = await git.commit({ fs, dir, message, author, committer: author });
  return { changed: changed.sort(), commit };
}

/** Push HEAD to the branch. Throws PushRejected when the remote refuses the update. */
export async function pushSite(remote: SiteRemote, dir: string): Promise<void> {
  // isomorphic-git returns only when every ref was updated; a refusal by the remote is a GitPushError.
  try {
    await git.push({ fs, http: siteHttp, dir, remote: "origin", ref: "HEAD", remoteRef: `refs/heads/${remote.branch}`, onAuth: onAuth(remote) });
  } catch (error) {
    if (error instanceof Errors.PushRejectedError) throw new PushRejected(error.data.reason);
    if (error instanceof Errors.GitPushError) throw new PushRejected(error.message);
    throw error;
  }
}
