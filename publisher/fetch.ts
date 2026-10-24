import { execFile } from "node:child_process";

// Local mode fetches each repo's wyrd-foo-v2 branch from origin before it
// reads it, so a branch that was merged and pushed shows up. isomorphic-git
// cannot fetch over SSH, which the clones use, so this runs git itself. It
// updates only refs/remotes/origin/<branch>: no working tree, index, local
// branch, tag or FETCH_HEAD changes.

/** Bound on one fetch, in milliseconds, so an unreachable remote cannot stall the run. */
const FETCH_TIMEOUT_MS = 60_000;

export type FetchResult = { ok: true } | { ok: false; message: string };

/** Fetch `branch` from origin into `refs/remotes/origin/<branch>`. Never prompts. */
export function fetchBranch(dir: string, branch: string): Promise<FetchResult> {
  const env: Record<string, string> = { GIT_TERMINAL_PROMPT: "0", GIT_SSH_COMMAND: "ssh -o BatchMode=yes" };
  for (const [name, value] of Object.entries(process.env)) {
    if (!name.startsWith("GIT_") && value !== undefined) env[name] = value;
  }
  const refspec = `+refs/heads/${branch}:refs/remotes/origin/${branch}`;
  const args = ["fetch", "--quiet", "--no-tags", "--no-write-fetch-head", "origin", refspec];
  return new Promise((resolve) => {
    execFile("git", args, { cwd: dir, env, timeout: FETCH_TIMEOUT_MS }, (error, _stdout, stderr) => {
      if (error === null) return resolve({ ok: true });
      const detail = stderr.split("\n").find((line) => line.trim() !== "")?.trim() ?? error.message;
      resolve({ ok: false, message: detail });
    });
  });
}
