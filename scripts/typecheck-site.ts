// Sync Astro types, then run @astrojs/check with its own TypeScript 6.
// Astro 7's CLI rejects the project's TypeScript 7 before loading the checker.
// The schema check keeps TypeScript 7; .pnpmfile.cjs gives the checker its API.
// A successful exit counts only when the checker reports checked files.

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

async function run(command: string, args: string[]) {
  const child = spawn(command, args, {
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
  return { output, status };
}

async function main() {
  const astro = join(import.meta.dirname, "../node_modules/.bin/astro");
  const sync = await run(astro, ["sync"]);
  if (sync.status !== 0) {
    console.error(`typecheck:site: astro sync exited with ${sync.status ?? "a signal"}`);
    process.exitCode = 1;
    return;
  }
  const { output, status } = await run(process.execPath, [fileURLToPath(import.meta.url), "--check"]);
  const failure = checkFailure(output, status);
  if (failure !== undefined) {
    console.error(`typecheck:site: ${failure}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === "--check") {
    const { check } = await import("@astrojs/check");
    process.exitCode = (await check({ watch: false })) ? 1 : 0;
  } else {
    await main();
  }
}
