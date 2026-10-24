import { spawn } from "node:child_process";

// Local mode fetches each repo's wyrd-foo-v2 branch from origin before it
// reads it, so a branch that was merged and pushed shows up. isomorphic-git
// cannot fetch over SSH, which the clones use, so this runs git itself. It
// updates only refs/remotes/origin/<branch>: no working tree, index, local
// branch, tag or FETCH_HEAD changes.

/** Bound on one fetch, in milliseconds, so an unreachable remote cannot stall the run. */
const FETCH_TIMEOUT_MS = 60_000;

/**
 * Time from SIGTERM to SIGKILL after the bound passes, in milliseconds. git
 * removes its `.lock` files on SIGTERM; SIGKILL stops a process that ignores it.
 */
export const FETCH_KILL_GRACE_MS = 5_000;

export type FetchResult = { ok: true } | { ok: false; message: string };

export interface FetchOptions {
  /** Bound on the fetch, in milliseconds. Tests pass a small one; the run uses the default. */
  timeoutMs?: number;
  /** Time from SIGTERM to SIGKILL, in milliseconds. Tests pass their own; the run uses the default. */
  graceMs?: number;
}

/**
 * Fetch `branch` from origin into `refs/remotes/origin/<branch>`. Never prompts.
 * On timeout, sends SIGTERM to git and every process it started (ssh
 * included), then SIGKILL to any of them still running after the grace.
 */
export function fetchBranch(dir: string, branch: string, options: FetchOptions = {}): Promise<FetchResult> {
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;
  const graceMs = options.graceMs ?? FETCH_KILL_GRACE_MS;
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
    let killed = false;
    let closed = false;
    let code: number | null = null;
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => (stderr += chunk));
    /** Signals git's process group; false when no process of the group is left. */
    const signal = (name: NodeJS.Signals | 0) => {
      try {
        process.kill(-child.pid!, name);
        return true;
      } catch {
        return false;
      }
    };
    let grace: NodeJS.Timeout | undefined;
    const timer = setTimeout(() => {
      timedOut = true;
      signal("SIGTERM");
      grace = setTimeout(() => {
        killed = true;
        signal("SIGKILL");
        finish();
      }, graceMs);
    }, timeoutMs);
    // After a timeout, the result waits until the group is gone or was sent
    // SIGKILL: git leaving first does not end the processes it started.
    const finish = () => {
      if (!closed || (timedOut && !killed && signal(0))) return;
      clearTimeout(timer);
      clearTimeout(grace);
      if (timedOut) return resolve({ ok: false, message: `timed out after ${timeoutMs / 1000} s` });
      if (code === 0) return resolve({ ok: true });
      const detail = stderr.split("\n").find((line) => line.trim() !== "")?.trim() ?? `git fetch exited with code ${code}`;
      resolve({ ok: false, message: detail });
    };
    child.on("error", (error) => {
      clearTimeout(timer);
      clearTimeout(grace);
      resolve({ ok: false, message: error.message });
    });
    child.on("close", (exitCode) => {
      closed = true;
      code = exitCode;
      finish();
    });
  });
}
