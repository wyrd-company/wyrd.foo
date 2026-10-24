import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { parse } from "yaml";

// `task dev:v2` publishes, then starts `astro dev` with the options in
// ASTRO_ARGS. The run test needs Task on PATH; hosted CI has none, so there
// only the shape test runs.

const ROOT = new URL("../../", import.meta.url).pathname;
const taskfile = parse(readFileSync(join(ROOT, "Taskfile.yml"), "utf8")) as {
  tasks: Record<string, { cmds: (string | { task: string })[]; vars?: Record<string, unknown> }>;
};
// The node stub must not run Task itself: the npm build of Task is a node
// script, so it is started with this node, by its resolved path.
const taskPath = spawnSync("sh", ["-c", "command -v task"], { encoding: "utf8" }).stdout.trim();
const hasTask = taskPath !== "";
const taskCommand = (args: string[]): [string, string[]] =>
  hasTask && readFileSync(taskPath).subarray(0, 64).toString().startsWith("#!/usr/bin/env node") ? [process.execPath, [taskPath, ...args]] : [taskPath, args];

const stubs = mkdtempSync(join(tmpdir(), "wyrd-taskfile-"));
after(() => rmSync(stubs, { recursive: true, force: true }));

/** Runs `task dev:v2` with `pnpm` and `node` stubs that record each call's arguments as `[arg][arg]`. */
function runDevV2(vars: string[]): { pnpm: string[]; node: string[] } {
  const dir = mkdtempSync(join(stubs, "run-"));
  for (const name of ["pnpm", "node"]) {
    const stub = join(dir, name);
    writeFileSync(stub, `#!/bin/sh\n{ for arg; do printf '[%s]' "$arg"; done; echo; } >> "${dir}/${name}.log"\n`);
    chmodSync(stub, 0o755);
  }
  const [command, args] = taskCommand(["dev:v2", ...vars]);
  const run = spawnSync(command, args, {
    cwd: ROOT,
    env: { PATH: `${dir}:${process.env.PATH}`, HOME: process.env.HOME },
    encoding: "utf8",
  });
  assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
  const lines = (name: string) => readFileSync(join(dir, `${name}.log`), "utf8").trimEnd().split("\n");
  return { pnpm: lines("pnpm"), node: lines("node") };
}

describe("Taskfile.yml dev:v2", () => {
  it("publishes, then runs astro dev with ASTRO_ARGS as its last command", () => {
    const task = taskfile.tasks["dev:v2"];
    assert.deepEqual(task.cmds, [{ task: "publish:local" }, "pnpm astro dev {{.ASTRO_ARGS}}"]);
    assert.equal(task.vars?.ASTRO_ARGS, undefined, "no task var overrides ASTRO_ARGS");
  });

  it("passes ASTRO_ARGS to astro dev, word by word", { skip: hasTask ? false : "task is not on PATH" }, () => {
    const { pnpm, node } = runDevV2(["ASTRO_ARGS=--port 4999 --host"]);
    assert.deepEqual(node, ["[publisher/cli.ts][local]"]);
    assert.deepEqual(pnpm, ["[astro][dev][--port][4999][--host]"]);
  });

  it("runs astro dev with no options when ASTRO_ARGS is not given", { skip: hasTask ? false : "task is not on PATH" }, () => {
    assert.deepEqual(runDevV2([]).pnpm, ["[astro][dev]"]);
  });
});
