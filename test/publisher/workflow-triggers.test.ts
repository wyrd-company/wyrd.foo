// ---
// relationships:
//   verifies: publisher/workflow-triggers.ts
//   references: docs/technical-designs/publishing.yml
// ---
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { after, describe, it } from "node:test";
import { validateRepo } from "../../publisher/local.ts";
import { fakeReleases, git, OWNER, Workspace, yaml } from "./fixture-repo.ts";
import {
  alphaFiles,
  ALPHA_TAGS,
  ALPHA_CLI_RELEASE,
  betaFiles,
  BETA_TAGS,
} from "./fixtures.ts";

const CALLER = ".github/workflows/publish-docs.yml";
const caller = (names: string | string[]) =>
  yaml({
    name: "Publish docs",
    on: {
      workflow_run: { workflows: names, types: ["completed"] },
      workflow_dispatch: {},
    },
    jobs: {
      publish: { uses: "sample-org/site/.github/workflows/publish.yml@main" },
    },
  });
const triggers = (report: Awaited<ReturnType<typeof validateRepo>>) =>
  report.findings.filter(
    (finding) => finding.requirement === "workflow trigger",
  );

describe("validate workflow_run names", () => {
  const ws = new Workspace();
  after(() => ws.remove());
  let sequence = 0;
  function repo(workflows: Record<string, string>) {
    const name = `sample-${sequence++}`;
    const dir = ws.repo(
      name,
      { ...alphaFiles({ withApp: false }), ...workflows },
      { tags: ALPHA_TAGS },
    );
    git(dir, "checkout", "-q", "wyrd-foo-v2");
    const releases = fakeReleases({
      [`${OWNER}/${name}@alpha-cli@1.2.0`]: ALPHA_CLI_RELEASE,
    });
    return { dir, releases };
  }

  it("warns with the caller path and exact missing name, and fails only in strict mode", async () => {
    const options = repo({
      [CALLER]: caller(["Release"]),
      ".github/workflows/release.yml": "name: release\non: push\n",
    });
    const loose = await validateRepo(options);
    assert.equal(loose.outcome, "passed");
    assert.equal(triggers(loose).length, 1);
    assert.equal(triggers(loose)[0].severity, "warning");
    assert.equal(triggers(loose)[0].file, CALLER);
    assert.match(
      triggers(loose)[0].message,
      /names "Release".*case-sensitive workflow name:/,
    );
    const strict = await validateRepo({ ...options, strict: true });
    assert.equal(strict.outcome, "failed");
    assert.deepEqual(
      strict.findings,
      [{ ...triggers(loose)[0], severity: "error" }],
      "no other requirement fails",
    );
  });

  it("accepts exact names from yml and yaml, and reports each unmatched name once", async () => {
    const options = repo({
      [CALLER]: caller(["release", "Build package"]),
      ".github/workflows/release.yaml": "name: release\non: push\n",
      ".github/workflows/build.yml":
        "name: Build package\non: [push, pull_request]\n",
    });
    assert.deepEqual(
      triggers(await validateRepo({ ...options, strict: true })),
      [],
    );
    writeFileSync(
      join(options.dir, CALLER),
      caller(["release", "Missing", "Other", "Missing"]),
    );
    const report = await validateRepo(options);
    assert.equal(triggers(report).length, 2);
    assert.match(triggers(report)[0].message, /"Missing"/);
    assert.match(triggers(report)[1].message, /"Other"/);
  });

  for (const filter of ["Missing", ["Missing"]]) {
    it(`validates ${typeof filter === "string" ? "scalar" : "array"} filters with matching controls`, async () => {
      const options = repo({ [CALLER]: caller(filter) });
      const loose = await validateRepo(options);
      assert.equal(loose.outcome, "passed");
      assert.equal(triggers(loose)[0].severity, "warning");
      assert.equal(
        (await validateRepo({ ...options, strict: true })).outcome,
        "failed",
      );
      writeFileSync(
        join(options.dir, CALLER),
        caller(typeof filter === "string" ? "Publish docs" : ["Publish docs"]),
      );
      assert.equal(
        (await validateRepo({ ...options, strict: true })).outcome,
        "passed",
      );
    });
  }

  for (const extension of ["yml", "yaml"]) {
    it(`uses default ${extension} names in working trees and refs, but explicit names override paths`, async () => {
      const target = `.github/workflows/release.${extension}`;
      const options = repo({
        [CALLER]: caller(target),
        [target]: "on: push\n",
      });
      for (const ref of [undefined, "HEAD"]) {
        assert.equal(
          (await validateRepo({ ...options, ref, strict: true })).outcome,
          "passed",
        );
      }
      writeFileSync(join(options.dir, target), "name: Release\non: push\n");
      assert.equal(triggers(await validateRepo(options)).length, 1);
      assert.equal(
        (await validateRepo({ ...options, ref: "HEAD", strict: true })).outcome,
        "passed",
      );
    });
  }

  const patterns: [string, string, boolean][] = [
    ["Build", "Build/", false],
    ["Build/", "Build/", true],
    ["Absent", "Build/", false],
    ["Build/*", "Build/package", true],
    ["Release*", "Release package", true],
    ["Release*", "release package", false],
    ["Release*", "Release", true],
    ["Release*", "Release/package", false],
    ["Release [AB]", "Release A", true],
    ["Release [AB]", "Release C", false],
    ["Release [0-9]", "Release 3", true],
    ["Release [0-9]", "Release x", false],
    [String.raw`Build C\+\+`, "Build C++", true],
    [String.raw`Build C\+\+`, "Build C", false],
    [String.raw`Release\*`, "Release*", true],
    [String.raw`Release\*`, "Release package", false],
    [String.raw`\!Release`, "!Release", true],
    ["#Release", "#Release", true],
    ["*", ".Release", true],
    ["Release (A|B)", "Release A", false],
    ["Release {A,B}", "Release A", false],
  ];
  for (const [pattern, name, expected] of patterns) {
    it(`checks filter ${JSON.stringify(pattern)} against ${JSON.stringify(name)}`, async () => {
      const options = repo({
        [CALLER]: caller([pattern]),
        ".github/workflows/build.yml": yaml({ name, on: "push" }),
      });
      for (const strict of [false, true]) {
        const result = await validateRepo({ ...options, strict });
        assert.equal(triggers(result).length, expected ? 0 : 1);
        assert.equal(result.outcome, expected || !strict ? "passed" : "failed");
      }
    });
  }

  for (const [pattern, name] of [
    ["Build/*", "Build/"],
    ["Release?", "Releas"],
    ["Release+", "Releaseee"],
    ["**.yml", ".github/workflows/release.yml"],
    ["**/release.yml", ".github/workflows/release.yml"],
    ["!Absent", "Release"],
    ["*", "."],
    ["Release*", "../Release"],
    ["a".repeat(65537), "Release"],
  ]) {
    it(`does not reject unchecked filter forms (${pattern.slice(0, 40)}, ${name})`, async () => {
      const options = repo({
        [CALLER]: caller([pattern]),
        ".github/workflows/build.yml": yaml({ name, on: "push" }),
      });
      assert.equal(
        (await validateRepo({ ...options, strict: true })).outcome,
        "passed",
      );
    });
  }

  it("does not use an unnamed workflow's basename or change path case", async () => {
    const options = repo({
      [CALLER]: caller(["release.yml", ".github/workflows/Release.yml"]),
      ".github/workflows/release.yml": "on: push\n",
    });
    const report = await validateRepo({ ...options, strict: true });
    assert.equal(report.outcome, "failed");
    assert.equal(triggers(report).length, 2);
  });

  it("does not require excluded names to exist, including before re-inclusion", async () => {
    const options = repo({
      [CALLER]: caller(["Release*", "!Release old", "Release*"]),
      ".github/workflows/release.yml": "name: Release package\non: push\n",
    });
    assert.equal(
      (await validateRepo({ ...options, strict: true })).outcome,
      "passed",
    );
  });

  it("uses the selected ref rather than the working tree", async () => {
    const options = repo({
      [CALLER]: caller(["Release"]),
      ".github/workflows/release.yml": "name: release\non: push\n",
    });
    writeFileSync(join(options.dir, CALLER), caller(["release"]));
    assert.deepEqual(triggers(await validateRepo(options)), []);
    assert.equal(
      triggers(await validateRepo({ ...options, ref: "HEAD" })).length,
      1,
    );
  });

  it("skips repos without workflow_run and files outside the workflow folder", async () => {
    const options = repo({
      ".github/workflows/manual.yaml": "on: workflow_dispatch\n",
      ".github/workflows/push.yml": "on: [push, pull_request]\n",
      ".github/workflows/notes.txt": caller(["Missing"]),
      ".github/workflows/nested/ignored.yml": caller(["Missing"]),
    });
    assert.equal(
      (await validateRepo({ ...options, strict: true })).outcome,
      "passed",
    );
    const missing = repo({
      [CALLER]: caller(["Release"]),
      ".github/workflows/nested/release.yml": "name: Release\n",
    });
    assert.equal(triggers(await validateRepo(missing)).length, 1);
    assert.equal((await validateRepo(repo({}))).outcome, "passed");
  });

  it("reports malformed YAML so an unreadable workflow does not silently pass", async () => {
    const options = repo({ ".github/workflows/broken.yml": "name: [\n" });
    const loose = await validateRepo(options);
    assert.equal(loose.outcome, "passed");
    assert.match(triggers(loose)[0].message, /not valid YAML/);
    assert.equal(
      (await validateRepo({ ...options, strict: true })).outcome,
      "failed",
    );
  });

  for (const scalar of [false, true]) {
    it(`prints warning/error CLI exits for ${scalar ? "scalar" : "array"} filters`, () => {
      // A feature-only repo needs no GitHub Release lookup, even with --strict.
      const files = betaFiles();
      const docs = parse(String(files["docs/user/docs.yml"]));
      delete docs.products["sample-image"];
      delete files["docs/user/overview.md"];
      files["docs/user/docs.yml"] = yaml(docs);
      const dir = ws.repo(
        `feature-cli-${scalar}`,
        { ...files, [CALLER]: caller(scalar ? "Missing" : ["Missing"]) },
        { tags: BETA_TAGS },
      );
      git(dir, "checkout", "-q", "wyrd-foo-v2");
      const cli = new URL("../../publisher/cli.ts", import.meta.url).pathname;
      for (const strict of [false, true]) {
        const run = spawnSync(
          process.execPath,
          [cli, "validate", dir, ...(strict ? ["--strict"] : ["--offline"])],
          {
            encoding: "utf8",
            env: { ...process.env, GITHUB_TOKEN: "", GH_TOKEN: "" },
          },
        );
        assert.equal(run.status, strict ? 1 : 0, run.stdout + run.stderr);
        assert.match(
          run.stdout,
          new RegExp(
            `${strict ? "error" : "warning"} \\.github/workflows/publish-docs\\.yml: workflow_run.workflows names "Missing"`,
          ),
        );
      }
      writeFileSync(
        join(dir, CALLER),
        caller(scalar ? "Publish docs" : ["Publish docs"]),
      );
      const control = spawnSync(
        process.execPath,
        [cli, "validate", dir, "--strict"],
        {
          encoding: "utf8",
          env: { ...process.env, GITHUB_TOKEN: "", GH_TOKEN: "" },
        },
      );
      assert.equal(control.status, 0, control.stdout + control.stderr);
    });
  }
});
