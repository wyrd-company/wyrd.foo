import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { checkFailure } from "../../scripts/typecheck-site.ts";
import { COLOUR, plainText } from "./colour.ts";

// `pnpm typecheck:site` fails closed: a checker run that did not check
// the site fails, whatever its exit code.

const REPO = new URL("../../", import.meta.url).pathname;
const RESULT = "Result (130 files): \n- 0 errors\n- 0 warnings\n- 2 hints\n";

describe("checkFailure", () => {
  it("passes a run that exits 0 and checked files", () => {
    assert.equal(checkFailure(`Getting diagnostics...\n${RESULT}`, 0), undefined);
    assert.equal(checkFailure(`\u001b[1mResult (1 file): \u001b[22m\n`, 0), undefined);
  });

  it("fails a run that exits 0 with no result line", () => {
    const prompt = "Astro will run the following command:\n pnpm add @astrojs/check typescript\n◆  Continue?\n";
    assert.match(checkFailure(prompt, 0) ?? "", /no "Result \(N files\)" line/);
    assert.match(checkFailure("", 0) ?? "", /no "Result \(N files\)" line/);
  });

  it("fails a run that checked no files", () => {
    assert.match(checkFailure("Result (0 files): \n- 0 errors\n", 0) ?? "", /checked 0 files/);
  });

  it("fails a run that exits non-zero, even with a result line", () => {
    assert.match(checkFailure(RESULT.replace("0 errors", "1 error"), 1) ?? "", /exited with 1/);
    assert.match(checkFailure("", null) ?? "", /exited with a signal/);
  });
});

describe("pnpm typecheck:site without @astrojs/check", () => {
  // A module hook that makes @astrojs/check unresolvable in every Node process
  // that loads it, as when the package is missing from node_modules.
  const work = mkdtempSync(join(tmpdir(), "wyrd-typecheck-"));
  after(() => rmSync(work, { recursive: true, force: true }));
  const hook = join(work, "hide-astro-check.mjs");
  writeFileSync(
    hook,
    `import { registerHooks } from "node:module";
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "@astrojs/check" || specifier.startsWith("@astrojs/check/")) {
      throw Object.assign(new Error("Cannot find package '@astrojs/check'"), { code: "ERR_MODULE_NOT_FOUND" });
    }
    return next(specifier, context);
  },
});
`,
  );
  const run = (command: string, args: string[]) =>
    spawnSync(command, args, {
      cwd: REPO,
      env: { ...process.env, ...COLOUR, NODE_OPTIONS: `--import=${hook}` },
      input: "",
      encoding: "utf8",
      timeout: 120_000,
    });

  it("control: the checker cannot load when its package is missing", () => {
    const control = run(process.execPath, [join(REPO, "scripts/typecheck-site.ts"), "--check"]);
    const output = plainText(`${control.stdout}${control.stderr}`);
    assert.notEqual(control.status, 0, output);
    assert.match(output, /@astrojs\/check/);
    assert.doesNotMatch(output, /Result \(\d+ files?\)/);
  });

  it("fails", () => {
    const wrapped = run(process.execPath, [join(REPO, "scripts/typecheck-site.ts")]);
    const output = plainText(`${wrapped.stdout}${wrapped.stderr}`);
    assert.equal(wrapped.status, 1, output);
    assert.match(output, /typecheck:site: astro check exited with 1/);
  });
});
