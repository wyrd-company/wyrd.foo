import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { stripVTControlCharacters } from "node:util";

// The dev server keeps its content store in .astro/, one per checkout. After a
// dev run on content/, a dev run on another root with the same products (the
// dev content folder) must serve that root's docs pages, not content/'s cached
// file paths.

const REPO = new URL("../../", import.meta.url).pathname;
const ASTRO = join(REPO, "node_modules/astro/bin/astro.mjs");
const PAGE = "/docs/gitpr/overview/";
const work = mkdtempSync(join(tmpdir(), "wyrd-dev-root-"));
after(() => rmSync(work, { recursive: true, force: true }));

/** A port that is free now, so both dev runs use the same server config. */
async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  await new Promise((resolve) => server.close(resolve));
  return port;
}

/** Starts `astro dev` on `root` (content/ when undefined), fetches PAGE, and stops the server. */
async function devRun(port: number, root: string | undefined) {
  // Keep Astro in the child so this test owns its lifetime and shutdown.
  const env: NodeJS.ProcessEnv = { ...process.env, ASTRO_DEV_BACKGROUND: "0" };
  delete env.WYRD_CONTENT_DIR;
  if (root !== undefined) env.WYRD_CONTENT_DIR = root;
  const child = spawn(process.execPath, [ASTRO, "dev", "--port", String(port)], { cwd: REPO, env, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  const exited = new Promise<number | null>((resolve) => child.on("exit", resolve));
  try {
    const url = await new Promise<string>((resolve, reject) => {
      const read = (chunk: Buffer) => {
        output += chunk.toString();
        const found = /Local\s+(http:\/\/\S+?)\/?\s/.exec(stripVTControlCharacters(output));
        if (found) resolve(found[1]);
      };
      child.stdout.on("data", read);
      child.stderr.on("data", read);
      exited.then((code) => reject(new Error(`astro dev exited with ${code} before it was ready:\n${output}`)));
    });
    const response = await fetch(`${url}${PAGE}`);
    return { url, status: response.status, body: await response.text(), output };
  } finally {
    if (child.exitCode === null) child.kill("SIGTERM");
    await exited;
  }
}

describe("the dev server after a switch of content root", () => {
  it("serves the docs pages of the new root", async () => {
    const copy = join(work, "content");
    cpSync(join(REPO, "content"), copy, { recursive: true });
    const port = await freePort();

    const first = await devRun(port, undefined);
    assert.equal(first.status, 200, `content/: ${first.output}`);
    const second = await devRun(port, copy);
    assert.equal(second.url, first.url, "both runs use the same server config");
    assert.doesNotMatch(second.body, /is not under/);
    assert.equal(second.status, 200, `copy: ${second.output}`);
  });
});
