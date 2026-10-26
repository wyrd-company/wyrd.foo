import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { parse } from "yaml";

// The reusable workflow and the action it wraps: what tool repos call, and
// the agreements between the two that actionlint cannot check for a `$/`
// call (rhysd/actionlint#760).

const ROOT = new URL("../../", import.meta.url).pathname;
const WORKFLOW_FILE = ".github/workflows/publish-docs.yml";
const ACTION_FILE = ".github/actions/publish-docs/action.yml";
const SELF_ACTION = "$/.github/actions/publish-docs";

interface Step {
  name?: string;
  id?: string;
  uses?: string;
  with?: Record<string, unknown>;
  env?: Record<string, string>;
  run?: string;
  if?: string;
}
const text = (path: string) => readFileSync(join(ROOT, path), "utf8");
const workflow = parse(text(WORKFLOW_FILE)) as {
  on: Record<string, { inputs: Record<string, { type: string; required?: boolean; default?: unknown }>; secrets: Record<string, unknown> }>;
  permissions: Record<string, string>;
  concurrency: unknown;
  jobs: Record<string, { steps: Step[]; permissions?: unknown }>;
};
const action = parse(text(ACTION_FILE)) as {
  inputs: Record<string, { required?: boolean; default?: string }>;
  runs: { using: string; steps: Step[] };
};
const steps = Object.values(workflow.jobs).flatMap((job) => job.steps);
const call = steps.find((step) => step.uses === SELF_ACTION)!;

describe("publish-docs reusable workflow", () => {
  it("is only callable from another workflow", () => {
    assert.deepEqual(Object.keys(workflow.on), ["workflow_call"]);
  });

  it("reads the repo and nothing more with GITHUB_TOKEN", () => {
    assert.deepEqual(workflow.permissions, { contents: "read" });
    for (const job of Object.values(workflow.jobs)) assert.equal(job.permissions, undefined);
  });

  it("pins every action by full commit SHA with a version comment, or takes it from this repo", () => {
    for (const file of [WORKFLOW_FILE, ACTION_FILE]) {
      const uses = text(file).split("\n").filter((line) => /^\s*(-\s+)?uses:/.test(line));
      assert.ok(uses.length > 0, file);
      for (const line of uses) {
        const pinned = /uses:\s+[\w.-]+\/[\w.-]+(\/[\w./-]+)?@[0-9a-f]{40} # v\d+\.\d+\.\d+$/.test(line);
        assert.ok(pinned || line.trim().endsWith(`uses: ${SELF_ACTION}`), `${file}: ${line.trim()}`);
      }
    }
  });

  it("checks out without persisting credentials", () => {
    const checkouts = [...steps, ...action.runs.steps].filter((step) => step.uses?.startsWith("actions/checkout@"));
    assert.ok(checkouts.length > 0);
    for (const step of checkouts) assert.equal(step.with?.["persist-credentials"], false, step.name);
  });

  it("checks out the tool repo at the ref, with its tags, at the path it publishes from", () => {
    const source = steps.find((step) => step.uses?.startsWith("actions/checkout@") && step.with?.ref === "${{ inputs.ref }}");
    assert.ok(source !== undefined);
    assert.equal(source.with?.["fetch-depth"], 0);
    assert.equal(call.with?.source, source.with?.path);
    assert.equal(call.with?.ref, "${{ inputs.ref }}");
  });

  it("runs the action from this repo at the workflow's own commit", () => {
    assert.equal(steps.filter((step) => step.uses === SELF_ACTION).length, 1);
    assert.equal(text(".github/actionlint.yaml").match(/^\s+- '/gm)?.length, 1, "actionlint ignores one message");
    assert.ok(text(".github/actionlint.yaml").includes(`'^specifying action "\\$/\\.github/actions/publish-docs" in invalid format'`));
  });

  it("passes only inputs the action declares, and every required one", () => {
    const given = Object.keys(call.with ?? {});
    for (const name of given) assert.ok(name in action.inputs, `the action has input ${name}`);
    for (const [name, spec] of Object.entries(action.inputs)) {
      if (spec.required) assert.ok(given.includes(name), `the call passes required input ${name}`);
    }
  });

  it("passes each of its own inputs to the action input of the same name, except none", () => {
    const own = Object.keys(workflow.on.workflow_call.inputs);
    for (const name of own) assert.equal(call.with?.[name], `\${{ inputs.${name} }}`, name);
  });

  it("mints a wyrd.foo App token that can write contents, and reads Releases with the tool repo's token", () => {
    const mint = steps.find((step) => step.uses?.startsWith("actions/create-github-app-token@"))!;
    assert.deepEqual(
      { owner: mint.with?.owner, repositories: mint.with?.repositories, contents: mint.with?.["permission-contents"] },
      { owner: "wyrd-company", repositories: "wyrd.foo", contents: "write" },
    );
    assert.equal(call.with?.["site-token"], `\${{ steps.${mint.id}.outputs.token }}`);
    assert.equal(call.with?.["release-token"], "${{ github.token }}");
  });

  it("runs one publish at a time per tool repo, without cancelling one", () => {
    assert.deepEqual(workflow.concurrency, { group: "publish-docs-${{ github.repository }}", "cancel-in-progress": false });
  });

  it("fails a run that features outside a manual run, before it mints a token or checks out", () => {
    const guards = steps.filter((step) => step.if?.includes("inputs.feature"));
    assert.equal(guards.length, 1, "one step guards on inputs.feature");
    const guard = guards[0];
    // Two `&&` conjuncts, nothing else: no `||` to exempt a case, no status
    // function to override the failure state, no group to hide an alternative.
    const condition = guard.if!;
    assert.ok(!condition.includes("||"), `no || in: ${condition}`);
    assert.ok(!/\b(success|failure|always|cancelled)\s*\(/.test(condition), `no status function in: ${condition}`);
    assert.ok(!/[()]/.test(condition), `no group in: ${condition}`);
    assert.deepEqual(condition.split("&&").map((part) => part.trim()).sort(), ["github.event_name != 'workflow_dispatch'", "inputs.feature"]);
    // It fails, and it names the event and the manual-run rule in an annotation.
    assert.match(guard.run ?? "", /^exit 1$/m);
    assert.match(guard.run ?? "", /^echo "::error [^"]*\$\{EVENT_NAME\}[^"]*workflow_dispatch[^"]*"$/m);
    assert.match(guard.run ?? "", /only allowed on a manual run/);
    // Inputs and the event reach the script only through env.
    assert.deepEqual(guard.env, { EVENT_NAME: "${{ github.event_name }}" });
    assert.ok(!(guard.run ?? "").includes("${{"));
    // It runs before the checkout and before the token mint.
    const index = (match: (step: Step) => boolean) => steps.findIndex(match);
    const guardAt = steps.indexOf(guard);
    const mintAt = index((step) => step.uses?.startsWith("actions/create-github-app-token@") ?? false);
    const checkoutAt = index((step) => step.uses?.startsWith("actions/checkout@") ?? false);
    assert.ok(mintAt >= 0 && checkoutAt >= 0);
    assert.ok(guardAt < mintAt, "the guard runs before the token mint");
    assert.ok(guardAt < checkoutAt, "the guard runs before the checkout");
  });

  it("lets no failure pass: no job or step, the guard included, sets continue-on-error", () => {
    // A guard that fails with continue-on-error lets the run go on and publish.
    for (const [name, job] of Object.entries(workflow.jobs)) {
      assert.ok(!("continue-on-error" in job), `job ${name} sets continue-on-error`);
      for (const step of job.steps) assert.ok(!("continue-on-error" in step), `step ${step.name ?? step.id} of job ${name} sets continue-on-error`);
    }
    for (const step of action.runs.steps) assert.ok(!("continue-on-error" in step), `action step ${step.name ?? step.id} sets continue-on-error`);
  });

  it("fires for feature on every event but a manual run, and for nothing else", () => {
    const guard = steps.find((step) => step.if?.includes("inputs.feature"))!;
    // The condition is valid JavaScript over the two names it reads.
    const fires = (feature: boolean, event: string) => new Function("inputs", "github", `return ${guard.if}`)({ feature }, { event_name: event }) as boolean;
    for (const event of ["push", "schedule", "pull_request", "release", "workflow_run", "repository_dispatch"]) {
      assert.equal(fires(true, event), true, `feature on ${event}`);
      assert.equal(fires(false, event), false, `no feature on ${event}`);
    }
    assert.equal(fires(true, "workflow_dispatch"), false);
    assert.equal(fires(false, "workflow_dispatch"), false);
  });

  it("runs the guard's script: it exits non-zero and names the event", () => {
    const guard = steps.find((step) => step.if?.includes("inputs.feature"))!;
    const run = spawnSync("bash", ["--noprofile", "--norc", "-eo", "pipefail", "-c", guard.run!], { env: { PATH: process.env.PATH, EVENT_NAME: "push" }, encoding: "utf8" });
    assert.notEqual(run.status, 0);
    assert.match(run.stdout, /^::error title=feature is only allowed on a manual run::.*a push event/m);
  });

  it("defaults to a run that features nothing and pushes", () => {
    const inputs = workflow.on.workflow_call.inputs;
    assert.equal(inputs.feature.default, false);
    assert.equal(inputs["dry-run"].default, false);
    assert.equal(inputs.ref.required, true);
  });
});

describe("publish-docs@v2 action", () => {
  it("is a composite action whose publish step reads every input once", () => {
    assert.equal(action.runs.using, "composite");
    const publish = action.runs.steps.find((step) => step.id === "publish")!;
    const read = Object.values(publish.env ?? {}).flatMap((value) => [...value.matchAll(/\$\{\{\s*inputs\.([a-z-]+)\s*\}\}/g)].map((match) => match[1]));
    assert.deepEqual([...read].sort(), Object.keys(action.inputs).sort());
  });

  it("passes inputs to scripts only through env, never into the script text", () => {
    for (const step of action.runs.steps) assert.ok(!(step.run ?? "").includes("${{"), step.id ?? step.uses);
    for (const step of steps) assert.ok(!(step.run ?? "").includes("${{"), step.name);
  });
});
