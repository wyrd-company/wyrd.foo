import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { parse } from "yaml";

// The PR build check: the agreements between the workflow, the migration
// script and the content config that a green workflow file alone does not show.

const REPO = new URL("../../", import.meta.url).pathname;
const read = (path: string) => readFileSync(`${REPO}${path}`, "utf8");

interface Step {
  name?: string;
  uses?: string;
  run?: string;
  env?: Record<string, string>;
}
const workflow = parse(read(".github/workflows/pr-build.yml"));
const steps: Step[] = workflow.jobs.build.steps;
const step = (name: RegExp) => {
  const found = steps.filter((candidate) => candidate.name !== undefined && name.test(candidate.name));
  assert.equal(found.length, 1, `one step named ${name}`);
  return found[0];
};

describe("the PR build workflow", () => {
  it("runs on pull requests to main, and only reads the repository", () => {
    assert.deepEqual(workflow.on, { pull_request: { branches: ["main"] } });
    assert.deepEqual(workflow.permissions, { contents: "read" });
  });

  it("runs the contract checks, the migration, the build and the built-output checks, in that order", () => {
    const order = ["Validate the docs contract", "Migrate content/", "Build the site", "Check the built output"].map((name) =>
      steps.findIndex((candidate) => candidate.name?.startsWith(name)),
    );
    assert.ok(order.every((index) => index >= 0), `all steps present: ${order}`);
    assert.deepEqual(order, [...order].sort((a, b) => a - b));
    const validate = step(/^Validate the docs contract/).run ?? "";
    assert.match(validate, /^pnpm typecheck$/m);
    assert.match(validate, /^pnpm test$/m);
    assert.match(step(/^Build the site/).run ?? "", /^pnpm build$/);
    assert.match(step(/^Check the built output/).run ?? "", /^pnpm test:dist$/);
  });

  it("builds on the folder the migration wrote, through the variable the content config reads", () => {
    const migrate = step(/^Migrate content\//).run ?? "";
    const target = /--to "([^"]+)"/.exec(migrate)?.[1];
    assert.equal(target, "$RUNNER_TEMP/content-v2");
    // The content config takes its root from lib/content-root.ts, which reads the variable.
    assert.match(read("src/lib/content-root.ts"), /process\.env\.WYRD_CONTENT_DIR\b/);
    const config = read("src/content.config.ts");
    assert.match(config, /^import \{ CONTENT_ROOT \} from "\.\/lib\/content-root\.ts";$/m);
    assert.equal(
      config.match(/base: CONTENT_ROOT,/g)?.length,
      5,
      "every v2 collection reads the content root: products, pages, docs changelogs, feature READMEs, code changelogs",
    );
    assert.equal(step(/^Build the site/).env?.WYRD_CONTENT_DIR, "${{ runner.temp }}/content-v2");
  });

  it("calls a script that exists", () => {
    const script = /node (scripts\/\S+)/.exec(step(/^Migrate content\//).run ?? "")?.[1];
    assert.equal(script, "scripts/migrate-content-v2.ts");
    assert.ok(read(script).includes("export function migrate"));
  });
});
