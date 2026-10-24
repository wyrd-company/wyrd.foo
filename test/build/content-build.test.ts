import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

// The site build validates content/ against the docs contract: a product that
// breaks it fails the build and the error names the product and the field.

const REPO = new URL("../../", import.meta.url).pathname;
const ASTRO = join(REPO, "node_modules/.bin/astro");
const work = mkdtempSync(join(tmpdir(), "wyrd-content-build-"));
// Astro moves build output by rename, so the output folder sits in the checkout.
const out = join(REPO, "dist-fixtures/content-build");
after(() => {
  rmSync(work, { recursive: true, force: true });
  rmSync(out, { recursive: true, force: true });
});

/** Copies content/ into the work folder, lets `edit` change the copy, and builds the site on it. */
function buildOnCopy(name: string, edit: (root: string) => void = () => {}) {
  const root = join(work, name, "content");
  cpSync(join(REPO, "content"), root, { recursive: true });
  edit(root);
  const run = spawnSync(ASTRO, ["build", "--outDir", join(out, name)], {
    cwd: REPO,
    env: { ...process.env, WYRD_CONTENT_DIR: root },
    encoding: "utf8",
  });
  return { status: run.status, output: `${run.stdout}${run.stderr}` };
}

describe("the site build on content/", () => {
  it("builds an unbroken copy of content/, after a sync of content/ itself", () => {
    // The copy has the same pages as content/. A content store kept across
    // roots would hand the build content/'s file paths for every unchanged page.
    const env = { ...process.env };
    delete env.WYRD_CONTENT_DIR;
    const sync = spawnSync(ASTRO, ["sync"], { cwd: REPO, env, encoding: "utf8" });
    assert.equal(sync.status, 0, `${sync.stdout}${sync.stderr}`);
    const { status, output } = buildOnCopy("unbroken");
    assert.equal(status, 0, output);
    assert.ok(existsSync(join(out, "unbroken/tools/beholder/index.html")), "the copy's product page was built");
  });

  it("fails on a product whose tool.yaml breaks the schema, naming the product and the field", () => {
    const { status, output } = buildOnCopy("broken", (root) => {
      const file = join(root, "beholder/tool.yaml");
      const source = readFileSync(file, "utf8");
      assert.match(source, /^version: \S+$/m);
      writeFileSync(file, source.replace(/^version: \S+$/m, "version: bogus"));
    });
    assert.notEqual(status, 0, output);
    assert.match(output, /\[InvalidContentEntryDataError\] products → beholder data does not match collection schema/);
    assert.match(output, /^\s*version: must be a SemVer 2\.0\.0 version/m);
  });
});
