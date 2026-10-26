import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { parse } from "yaml";

// The major-tag workflow: it moves vX to a release tag X.Y.Z, and only to the
// highest X.y.z. Its script runs here against a stub gh that answers from a
// list of tags and records each call.

const REPO = new URL("../../", import.meta.url).pathname;
const workflow = parse(readFileSync(`${REPO}.github/workflows/major-tag.yml`, "utf8"));
const steps: { uses?: string; run?: string; env?: Record<string, string> }[] = workflow.jobs.move.steps;
const script = steps[0].run ?? "";

const STUB = `#!/usr/bin/env bash
echo "$*" >> "$STUB_LOG"
case "$*" in
  "api repos/sample/site/git/matching-refs/tags/"*)
    prefix="\${2#repos/sample/site/git/matching-refs/tags/}"
    for tag in $STUB_TAGS; do [[ "$tag" == "$prefix"* ]] && echo "refs/tags/$tag"; done
    exit 0 ;;
  "api repos/sample/site/commits/"*) echo "c0ffee" ;;
  "api repos/sample/site/git/tags "*) echo "tag-object" ;;
  "api repos/sample/site/git/ref/tags/"*) [ -n "$STUB_MAJOR_EXISTS" ] ;;
  *) exit 0 ;;
esac
`;

const dir = mkdtempSync(join(tmpdir(), "major-tag-"));
writeFileSync(join(dir, "gh"), STUB);
chmodSync(join(dir, "gh"), 0o755);
after(() => rmSync(dir, { recursive: true, force: true }));

const run = (tag: string, tags: string[], majorExists: boolean) => {
  const log = join(dir, `${tag}-${tags.join("_")}-${majorExists}.log`);
  writeFileSync(log, "");
  const result = spawnSync("bash", ["-c", script], {
    encoding: "utf8",
    env: {
      PATH: `${dir}:${process.env.PATH}`,
      REPO: "sample/site",
      TAG: tag,
      STUB_TAGS: tags.join(" "),
      STUB_MAJOR_EXISTS: majorExists ? "1" : "",
      STUB_LOG: log,
    },
  });
  const calls = readFileSync(log, "utf8").split("\n").filter(Boolean);
  return { status: result.status, stdout: result.stdout, calls, writes: calls.filter((call) => /git\/tags |git\/refs/.test(call)) };
};

describe("the major-tag workflow", () => {
  it("runs only on a push of a bare SemVer tag", () => {
    assert.deepEqual(workflow.on, { push: { tags: ["[0-9]+.[0-9]+.[0-9]+"] } });
  });

  it("can write contents only in its one job", () => {
    assert.deepEqual(workflow.permissions, {});
    assert.deepEqual(Object.keys(workflow.jobs), ["move"]);
    assert.deepEqual(workflow.jobs.move.permissions, { contents: "write" });
  });

  it("runs no action, so it checks nothing out and keeps no credentials", () => {
    assert.equal(steps.length, 1);
    assert.equal(steps[0].uses, undefined);
    assert.equal(steps[0].env?.GH_TOKEN, "${{ github.token }}");
    assert.equal(steps[0].env?.TAG, "${{ github.ref_name }}");
  });

  it("runs one move at a time, without cancelling one", () => {
    assert.deepEqual(workflow.concurrency, { group: "major-tag", "cancel-in-progress": false });
  });

  it("creates vX at the release commit when vX does not exist", () => {
    const { status, writes } = run("2.0.0", ["2.0.0"], false);
    assert.equal(status, 0);
    assert.deepEqual(writes, [
      "api repos/sample/site/git/tags -f tag=v2 -f message=v2: 2.0.0 -f object=c0ffee -f type=commit --jq .sha",
      "api repos/sample/site/git/refs -f ref=refs/tags/v2 -f sha=tag-object --silent",
    ]);
  });

  it("moves an existing vX to the highest X.y.z", () => {
    const { status, writes } = run("2.10.0", ["2.0.0", "2.9.1", "2.10.0", "20.0.0", "2.11.0-beta.1"], true);
    assert.equal(status, 0);
    assert.equal(writes.length, 2);
    assert.equal(writes[1], "api -X PATCH repos/sample/site/git/refs/tags/v2 -f sha=tag-object -F force=true --silent");
  });

  it("leaves vX where it is for a release that is not the highest X.y.z", () => {
    const { status, stdout, writes } = run("2.0.1", ["2.0.0", "2.0.1", "2.1.0"], true);
    assert.equal(status, 0);
    assert.deepEqual(writes, []);
    assert.match(stdout, /v2 stays: 2\.0\.1 is not the highest 2\.y\.z release \(2\.1\.0\)/);
  });

  it("refuses a tag that is not a bare release version, before it calls the API", () => {
    for (const tag of ["2.0.0-beta.1", "v2.0.0", "2.0"]) {
      const { status, calls } = run(tag, [tag], true);
      assert.equal(status, 1, tag);
      assert.deepEqual(calls, [], tag);
    }
  });
});
