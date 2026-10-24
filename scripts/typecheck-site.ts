// Type-checks the site with `astro check`, and fails unless the check ran.
//
//   node scripts/typecheck-site.ts
//
// When `astro check` cannot load @astrojs/check it offers to install it and,
// with no answer, exits 0 without checking anything. This runs it without a
// terminal to answer (stdin closed, CI set, so it never waits on the prompt)
// and passes only when it exits 0 and prints its "Result (N files)" line with
// N greater than 0.

import { spawn } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";

/** Why a finished `astro check` run does not count as a check, or undefined when it does. */
export function checkFailure(output: string, status: number | null): string | undefined {
  if (status !== 0) return `astro check exited with ${status ?? "a signal"}`;
  const files = /^Result \((\d+) files?\):/m.exec(stripVTControlCharacters(output))?.[1];
  if (files === undefined) return 'astro check printed no "Result (N files)" line, so it did not check the site';
  if (Number(files) === 0) return "astro check checked 0 files";
  return undefined;
}

async function main() {
  const astro = join(import.meta.dirname, "../node_modules/.bin/astro");
  const child = spawn(astro, ["check"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, CI: "true" },
  });
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString();
    process.stdout.write(chunk);
  });
  child.stderr.on("data", (chunk: Buffer) => {
    output += chunk.toString();
    process.stderr.write(chunk);
  });
  const status = await new Promise<number | null>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  const failure = checkFailure(output, status);
  if (failure !== undefined) {
    console.error(`typecheck:site: ${failure}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
