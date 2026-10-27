// ---
// relationships:
//   verifies: major-tag
// ---
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { parse } from "yaml";

const REPO = new URL("../../", import.meta.url).pathname;
const workflow = parse(
  readFileSync(`${REPO}.github/workflows/major-tag.yml`, "utf8"),
);
const job = workflow.jobs.release;
const script = job.steps[0].run;
const NOTES =
  "### Fixes\n\n- Preserve literal `$(exit 9)` and $values in release notes.";
const CHANGELOG = `# Changelog\n\n## 3.3.0\n\n- A newer release.\n\n## 3.2.1\n\n${NOTES}\n\n## 3.1.0\n\n- An older release.\n`;

// Runs the actual workflow shell with a gh boundary stub. No real credentials
// or network are available; the stub captures the notes file sent to create.
const STUB = `#!/usr/bin/env bash
set -euo pipefail
echo "$*" >> "$STUB_LOG"
case "$*" in
  "api --include repos/sample/site/releases/tags/"*)
    printf 'HTTP/2.0 %s response\n\n%s\n' "$STUB_READ_STATUS" "$STUB_DRAFT"
    [[ "$STUB_READ_STATUS" == 200 ]] ;;
  "api repos/sample/site/commits/"*)
    echo c0ffee
    exit "$STUB_COMMIT_STATUS" ;;
  "api repos/sample/site/contents/CHANGELOG.md?ref=c0ffee "*)
    cat "$STUB_CHANGELOG_FILE"
    exit "$STUB_CONTENT_STATUS" ;;
  "release create "*)
    while [[ $# -gt 0 ]]; do
      if [[ "$1" == --notes-file ]]; then cp "$2" "$STUB_CAPTURE"; break; fi
      shift
    done
    exit "$STUB_CREATE_STATUS" ;;
  *) echo "Unexpected gh call: $*" >&2; exit 9 ;;
esac
`;

function run(overrides: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "release-workflow-"));
  try {
    const { STUB_CHANGELOG: changelog = CHANGELOG, ...envOverrides } =
      overrides;
    const log = join(dir, "calls.log");
    const capture = join(dir, "captured-notes.md");
    const changelogFile = join(dir, "CHANGELOG.md");
    writeFileSync(join(dir, "gh"), STUB);
    chmodSync(join(dir, "gh"), 0o755);
    writeFileSync(log, "");
    writeFileSync(capture, "");
    writeFileSync(changelogFile, changelog);
    const result = spawnSync("bash", ["--noprofile", "--norc", "-c", script], {
      encoding: "utf8",
      env: {
        PATH: `${dir}:${process.env.PATH}`,
        REPO: "sample/site",
        TAG: "3.2.1",
        RUNNER_TEMP: dir,
        STUB_LOG: log,
        STUB_CAPTURE: capture,
        STUB_READ_STATUS: "404",
        STUB_DRAFT: "false",
        STUB_COMMIT_STATUS: "0",
        STUB_CONTENT_STATUS: "0",
        STUB_CREATE_STATUS: "0",
        STUB_CHANGELOG_FILE: changelogFile,
        ...envOverrides,
      },
    });
    return {
      status: result.status,
      output: `${result.stdout}${result.stderr}`,
      calls: readFileSync(log, "utf8").split("\n").filter(Boolean),
      notes: readFileSync(capture, "utf8"),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("GitHub Release publication", () => {
  it("uses only the job's contents-write token, without a checkout", () => {
    assert.deepEqual(workflow.permissions, {});
    assert.deepEqual(job.permissions, { contents: "write" });
    assert.equal(job.steps.length, 1);
    assert.equal(job.steps[0].uses, undefined);
    assert.deepEqual(job.steps[0].env, {
      GH_TOKEN: "${{ github.token }}",
      REPO: "${{ github.repository }}",
      TAG: "${{ github.ref_name }}",
    });
    assert.doesNotMatch(script, /\$\{\{/);
  });

  it("publishes the exact version's notes from the tagged commit", () => {
    const { status, output, calls, notes } = run();
    assert.equal(status, 0, output);
    assert.equal(notes.trim(), NOTES);
    assert.ok(calls.includes("api repos/sample/site/commits/3.2.1 --jq .sha"));
    assert.ok(
      calls.includes(
        "api repos/sample/site/contents/CHANGELOG.md?ref=c0ffee -H Accept: application/vnd.github.raw+json",
      ),
    );
    const create = calls.filter((call) => call.startsWith("release create "));
    assert.equal(create.length, 1);
    assert.match(
      create[0],
      /^release create 3\.2\.1 --repo sample\/site --verify-tag --title 3\.2\.1 --notes-file /,
    );
  });

  it("preserves an existing published Release on a rerun", () => {
    const { status, output, calls } = run({ STUB_READ_STATUS: "200" });
    assert.equal(status, 0, output);
    assert.match(output, /already published/);
    assert.equal(calls.length, 1, "no changelog read or release mutation");
  });

  it("reads a long changelog to the end without breaking the API pipe", () => {
    const { status, output, notes } = run({
      STUB_CHANGELOG: `${CHANGELOG}${"- An older change.\n".repeat(40000)}`,
    });
    assert.equal(status, 0, output);
    assert.equal(notes.trim(), NOTES);
  });

  it("reports an existing unpublished Release without changing it", () => {
    const { status, output, calls } = run({
      STUB_READ_STATUS: "200",
      STUB_DRAFT: "true",
    });
    assert.equal(status, 1, output);
    assert.match(output, /exists but is not published/);
    assert.equal(calls.length, 1);
  });

  it("does not treat a failed Release lookup as a missing Release", () => {
    for (const readStatus of ["403", "500"]) {
      const { status, output, calls } = run({ STUB_READ_STATUS: readStatus });
      assert.equal(status, 1, output);
      assert.match(output, /Could not check the GitHub Release/);
      assert.equal(calls.length, 1);
    }
  });

  it("fails before publication when the tag cannot resolve to a commit", () => {
    const { status, calls } = run({ STUB_COMMIT_STATUS: "1" });
    assert.equal(status, 1);
    assert.equal(calls.length, 2);
  });

  it("fails when the changelog read fails, even if it printed valid notes", () => {
    const { status, output, calls } = run({ STUB_CONTENT_STATUS: "1" });
    assert.equal(status, 1, output);
    assert.match(output, /Could not read the changelog section/);
    assert.ok(calls.every((call) => !call.startsWith("release create ")));
  });

  it("rejects missing and empty sections instead of publishing other notes", () => {
    for (const changelog of [
      "## 3.2.10\n\n- Another version.\n",
      "## 3.2.1\n\n## 3.1.0\n\n- Older notes.\n",
    ]) {
      const { status, calls } = run({ STUB_CHANGELOG: changelog });
      assert.equal(status, 1);
      assert.ok(calls.every((call) => !call.startsWith("release create ")));
    }
  });

  it("fails the job when GitHub refuses publication", () => {
    const { status, notes } = run({ STUB_CREATE_STATUS: "1" });
    assert.equal(status, 1);
    assert.equal(notes.trim(), NOTES);
  });

  it("rejects a non-release tag before it calls GitHub", () => {
    for (const tag of ["v3.2.1", "3.2.1-beta.1", "3.2"]) {
      const { status, calls } = run({ TAG: tag });
      assert.equal(status, 1);
      assert.deepEqual(calls, []);
    }
  });
});
