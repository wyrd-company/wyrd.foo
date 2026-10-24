import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { parse } from "yaml";

// The PR build check: the agreements between the workflow and the content
// config that a green workflow file alone does not show.

const REPO = new URL("../../", import.meta.url).pathname;
const read = (path: string) => readFileSync(`${REPO}${path}`, "utf8");

interface Step {
  id?: string;
  name?: string;
  uses?: string;
  if?: string;
  run?: string;
  with?: Record<string, string>;
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

  it("runs the contract checks, the build, the built-output checks and the browser tests, in that order", () => {
    const order = ["Validate the docs contract", "Build the site", "Check the built output", "Run the browser tests"].map((name) =>
      steps.findIndex((candidate) => candidate.name?.startsWith(name)),
    );
    assert.ok(order.every((index) => index >= 0), `all steps present: ${order}`);
    assert.deepEqual(order, [...order].sort((a, b) => a - b));
    const validate = step(/^Validate the docs contract/).run ?? "";
    assert.match(validate, /^pnpm typecheck$/m);
    assert.match(validate, /^pnpm test$/m);
    assert.match(step(/^Build the site/).run ?? "", /^pnpm build$/);
    assert.match(step(/^Check the built output/).run ?? "", /^pnpm test:dist$/);
    assert.match(step(/^Run the browser tests/).run ?? "", /^pnpm test:browser$/);
  });

  it("installs Chromium before the browser tests, from a cache keyed by the Playwright version", () => {
    const at = (name: RegExp) => steps.indexOf(step(name));
    const version = step(/^Resolve the Playwright version/);
    assert.equal(version.id, "playwright");
    assert.match(version.run ?? "", /pnpm exec playwright --version/);
    assert.match(version.run ?? "", />> "\$GITHUB_OUTPUT"$/);

    const cache = step(/^Cache the Playwright browsers/);
    assert.equal(cache.id, "playwright-cache");
    assert.match(cache.uses ?? "", /^actions\/cache@[0-9a-f]{40}$/);
    assert.equal(cache.with?.path, "~/.cache/ms-playwright");
    assert.match(cache.with?.key ?? "", /\$\{\{ steps\.playwright\.outputs\.version \}\}/);

    const install = step(/^Install Chromium$/);
    assert.equal(install.if, "steps.playwright-cache.outputs.cache-hit != 'true'");
    assert.equal(install.run, "pnpm exec playwright install --with-deps chromium");
    const deps = step(/^Install the Chromium system dependencies/);
    assert.equal(deps.if, "steps.playwright-cache.outputs.cache-hit == 'true'");
    assert.equal(deps.run, "pnpm exec playwright install-deps chromium");

    const order = [/^Resolve the Playwright version/, /^Cache the Playwright browsers/, /^Install Chromium$/, /^Install the Chromium system/, /^Run the browser tests/].map(at);
    assert.deepEqual(order, [...order].sort((a, b) => a - b));
    assert.equal(step(/^Run the browser tests/).if, undefined, "the browser tests always run");
  });

  it("builds on content/, through the default of the variable the content config reads", () => {
    assert.match(read("src/lib/content-root.ts"), /= process\.env\.WYRD_CONTENT_DIR \?\? "\.\/content";$/m);
    const config = read("src/content.config.ts");
    assert.match(config, /^import \{ CONTENT_ROOT \} from "\.\/lib\/content-root\.ts";$/m);
    assert.equal(
      config.match(/base: CONTENT_ROOT,/g)?.length,
      5,
      "every collection reads the content root: products, pages, docs changelogs, feature READMEs, code changelogs",
    );
    assert.equal(config.match(/base:/g)?.length, 5, "no collection reads another root");
    for (const candidate of steps) {
      assert.equal(candidate.env?.WYRD_CONTENT_DIR, undefined, `${candidate.name ?? candidate.uses} keeps the default root`);
      assert.doesNotMatch(candidate.run ?? "", /WYRD_CONTENT_DIR/);
    }
    assert.equal(workflow.env?.WYRD_CONTENT_DIR, undefined);
    assert.equal(workflow.jobs.build.env?.WYRD_CONTENT_DIR, undefined);
  });
});
