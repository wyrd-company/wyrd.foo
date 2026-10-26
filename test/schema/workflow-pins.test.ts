import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { parse } from "yaml";

// The PR build and CD workflows, and the deploy actions CD calls, run
// third-party actions only at a full commit SHA with its version in a comment
// (Renovate keeps both current), and check out without leaving the token in
// the git config. The comment is the action's release tag as published, with
// or without a `v`.

const REPO = new URL("../../", import.meta.url).pathname;
const FILES = [
  ".github/workflows/pr-build.yml",
  ".github/workflows/cd.yml",
  ".github/actions/deploy-cf-pages/action.yml",
  ".github/actions/deploy-gh-pages/action.yml",
];

interface Step {
  uses?: string;
  with?: Record<string, unknown>;
}

for (const path of FILES) {
  const source = readFileSync(`${REPO}${path}`, "utf8");
  const file = parse(source);
  const steps: Step[] = file.runs
    ? (file.runs.steps as Step[])
    : Object.values(file.jobs as Record<string, { steps?: Step[] }>).flatMap((job) => job.steps ?? []);
  const remote = steps.filter((step) => step.uses !== undefined && !step.uses.startsWith("./") && !step.uses.startsWith("$/"));

  describe(path, () => {
    it("pins every action to a full commit SHA with a version comment", () => {
      assert.ok(remote.length > 0, "the workflow uses actions");
      for (const { uses } of remote) {
        assert.match(uses!, /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/, uses);
        const line = source.split("\n").find((candidate) => candidate.includes(`uses: ${uses}`));
        assert.match(line ?? "", / # v?\d+\.\d+\.\d+$/, `${uses} has a version comment`);
      }
    });

    it("checks out without persisting credentials", () => {
      const checkouts = remote.filter(({ uses }) => uses!.startsWith("actions/checkout@"));
      if (file.jobs) assert.ok(checkouts.length > 0, "the workflow checks out");
      for (const checkout of checkouts) assert.equal(checkout.with?.["persist-credentials"], false);
    });
  });
}
