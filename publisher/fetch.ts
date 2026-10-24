import { spawn } from "node:child_process";

// Local mode fetches each repo's wyrd-foo-v2 branch from origin before it
// reads it, so a branch that was merged and pushed shows up. isomorphic-git
// cannot fetch over SSH, which the clones use, so this runs git itself. It
// updates only refs/remotes/origin/<branch>: no working tree, index, local
// branch, tag or FETCH_HEAD changes.

/** Bound on one fetch, in milliseconds, so an unreachable remote cannot stall the run. */
const FETCH_TIMEOUT_MS = 60_000;

export type FetchResult = { ok: true } | { ok: false; message: string };

export interface FetchOptions {
  /** Bound on the fetch, in milliseconds. Tests pass a small one; the run uses the default. */
  timeoutMs?: number;
}

/**
 * Fetch `branch` from origin into `refs/remotes/origin/<branch>`. Never prompts.
 * On timeout, stops git and every process it started (ssh included).
 */
export function fetchBranch(dir: string, branch: string, options: FetchOptions = {}): Promise<FetchResult> {
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;
  const env: Record<string, string> = { GIT_TERMINAL_PROMPT: "0", GIT_SSH_COMMAND: "ssh -o BatchMode=yes" };
  for (const [name, value] of Object.entries(process.env)) {
    if (!name.startsWith("GIT_") && value !== undefined) env[name] = value;
  }
  const refspec = `+refs/heads/${branch}:refs/remotes/origin/${branch}`;
  // --refmap= keeps git from also updating whatever ref the clone's
  // remote.origin.fetch maps the branch to (a local branch, with a custom refspec).
  const args = ["fetch", "--quiet", "--no-tags", "--no-write-fetch-head", "--refmap=", "origin", refspec];
  return new Promise((resolve) => {
    // detached: git leads its own process group, so one group kill reaches ssh too.
    const child = spawn("git", args, { cwd: dir, env, detached: true, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    let timedOut = false;
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => (stderr += chunk));
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-child.pid!, "SIGKILL");
      } catch {
        // The group is already gone.
      }
    }, timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ ok: false, message: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) return resolve({ ok: false, message: `timed out after ${timeoutMs / 1000} s` });
      if (code === 0) return resolve({ ok: true });
      const detail = stderr.split("\n").find((line) => line.trim() !== "")?.trim() ?? `git fetch exited with code ${code}`;
      resolve({ ok: false, message: detail });
    });
  });
}
