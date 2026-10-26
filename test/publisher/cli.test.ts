import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { stringify } from "yaml";
import { runLocal, validateRepo } from "../../publisher/index.ts";
import { git, OWNER, Workspace } from "./fixture-repo.ts";
import { ALPHA_TAGS, alphaFiles, gammaFiles } from "./fixtures.ts";

// validate on one checkout, and the cli.ts commands run as a process.

const CLI = new URL("../../publisher/cli.ts", import.meta.url).pathname;

function cli(...args: string[]) {
  const env = { ...process.env, GITHUB_TOKEN: "", GH_TOKEN: "" };
  return spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", env });
}

describe("validate: a linked worktree", () => {
  const ws = new Workspace();
  after(() => ws.remove());

  // The clone stays on main, which has no docs, so a read of the main
  // checkout's HEAD in place of the worktree's fails the repo.
  const clone = ws.repo("alpha", alphaFiles(), { tags: ALPHA_TAGS });
  const linked = (name: string, ...options: string[]) => {
    const dir = join(ws.root, name);
    git(clone, "worktree", "add", "-q", ...options, "--detach", dir, "wyrd-foo-v2");
    return dir;
  };

  for (const [label, options] of [
    ["an absolute", []],
    ["a relative", ["--relative-paths"]],
  ] as const) {
    it(`reads origin, refs, commits and tags through ${label} .git file and the common git dir`, async () => {
      const dir = linked(`worktree-${options.length}`, ...options);
      const head = git(dir, "rev-parse", "HEAD").trim();

      const tree = await validateRepo({ dir });
      assert.equal(tree.outcome, "passed", tree.findings.map((finding) => finding.message).join("\n"));
      assert.equal(tree.ownerRepo, `${OWNER}/alpha`, "origin from the common config");

      const commit = await validateRepo({ dir, ref: head.slice(0, 7) });
      assert.equal(commit.outcome, "passed", commit.findings.map((finding) => finding.message).join("\n"));
      assert.equal(commit.oid, head);

      const own = await validateRepo({ dir, ref: "HEAD" });
      assert.equal(own.oid, head, "HEAD is the worktree's HEAD, not the clone's");
      assert.equal(own.outcome, "passed");

      const tag = await validateRepo({ dir, ref: "alpha-cli@1.2.0" });
      assert.equal(tag.oid, git(dir, "rev-parse", "alpha-cli@1.2.0^{commit}").trim());
      assert.equal(tag.outcome, "passed");
    });
  }

  it("lets --owner override origin", async () => {
    const report = await validateRepo({ dir: linked("worktree-owner"), owner: "other-org/other" });
    assert.equal(report.ownerRepo, "other-org/other");
  });

  it("local mode reads the branch, origin and tags of a worktree checkout", async () => {
    const dir = linked("worktree-local");
    const [report] = await runLocal({
      config: { branch: "wyrd-foo-v2", repos: [{ name: "alpha", path: dir }] },
      toolsDir: ws.toolsDir,
      contentDir: ws.contentDir,
    });
    assert.equal(report.outcome, "published", report.findings.map((finding) => finding.message).join("\n"));
    assert.equal(report.ownerRepo, `${OWNER}/alpha`);
    assert.equal(report.ref, "refs/heads/wyrd-foo-v2");
    assert.equal(ws.tool("alpha-app").release.date, "2026-02-03T04:05:06.000Z", "release data from the local tag");
  });

  it("runs from the command line without --owner", () => {
    const dir = linked("worktree-cli");
    const run = cli("validate", dir, "--ref", git(dir, "rev-parse", "--short", "HEAD").trim(), "--offline");
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.match(run.stdout, new RegExp(`\\(${OWNER}/alpha\\) @ [0-9a-f]+ [0-9a-f]{12}: passed`));
  });
});

describe("validate", () => {
  const ws = new Workspace();
  after(() => ws.remove());

  it("checks the working tree, uncommitted edits included, and a ref through git objects", async () => {
    const dir = ws.repo("gamma", gammaFiles());
    git(dir, "checkout", "-q", "wyrd-foo-v2");
    assert.equal((await validateRepo({ dir })).outcome, "passed");

    writeFileSync(join(dir, "docs/user/docs.yml"), "schemaVersion: 2\nproducts: {}\n");
    const edited = await validateRepo({ dir });
    assert.equal(edited.outcome, "failed");
    assert.match(edited.findings.map((finding) => finding.message).join("\n"), /schemaVersion/);

    const committed = await validateRepo({ dir, ref: "HEAD" });
    assert.equal(committed.outcome, "passed");
    assert.deepEqual(committed.products, ["gamma-tool"]);
    assert.equal(committed.oid, git(dir, "rev-parse", "HEAD").trim());
    assert.equal((await validateRepo({ dir, ref: "no-such-ref" })).outcome, "failed");
  });

  it("reads an annotated tag ref as its commit", async () => {
    const dir = ws.repo("alpha", alphaFiles(), { tags: ALPHA_TAGS });
    const report = await validateRepo({ dir, ref: "alpha-cli@1.2.0" });
    assert.equal(report.outcome, "passed");
    assert.equal(report.oid, git(dir, "rev-parse", "alpha-cli@1.2.0^{commit}").trim());
  });

  it("exits 1 and prints the findings when the repo fails, and 0 when it passes", () => {
    const failing = cli("validate", join(ws.toolsDir, "gamma"), "--offline");
    assert.equal(failing.status, 1, failing.stderr);
    assert.match(failing.stdout, /: failed\n/);
    assert.match(failing.stdout, /error docs\/user\/docs\.yml: schemaVersion/);
    assert.match(failing.stdout, /1 repos: 0 published, 0 passed, 1 failed, 0 skipped/);

    const passing = cli("validate", join(ws.toolsDir, "alpha"), "--ref", "wyrd-foo-v2", "--offline");
    assert.equal(passing.status, 0, passing.stdout + passing.stderr);
    assert.match(passing.stdout, /products: alpha-app, alpha-cli/);
  });

  it("local writes the content folder and prints each repo's findings", () => {
    const config = join(ws.root, "repos.yml");
    writeFileSync(config, stringify({ branch: "wyrd-foo-v2", repos: [{ name: "alpha" }, { name: "gamma" }, { name: "missing" }] }));
    const run = cli("local", "--config", config, "--tools-dir", ws.toolsDir, "--content", ws.contentDir, "--offline");
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, new RegExp(`== alpha \\(${OWNER}/alpha\\) @ refs/heads/wyrd-foo-v2 [0-9a-f]{12}: published`));
    assert.match(run.stdout, /wrote: alpha-app, alpha-cli/);
    assert.match(run.stdout, /warning \.intentional\/config\.yml: does not exist; no release data or changelog \(requirement: intentional\)/);
    assert.match(run.stdout, /== missing: skipped\n {2}warning no local clone/);
    assert.match(run.stdout, /3 repos: 2 published, 0 passed, 0 failed, 1 skipped/);
    assert.doesNotMatch(run.stdout, /could not fetch/, "--offline does not fetch");
    assert.equal(ws.tool("alpha-cli").owner, `${OWNER}/alpha`);
  });

  it("prints usage and exits 2 for an unknown command", () => {
    const run = cli("publish");
    assert.equal(run.status, 2);
    assert.match(run.stderr, /usage:/);
  });
});
