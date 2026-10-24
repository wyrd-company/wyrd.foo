import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { parse } from "yaml";
import { OWNER, Workspace, type Files } from "./fixture-repo.ts";
import { ALPHA_TAGS, alphaFiles } from "./fixtures.ts";
import { SITE_TOKEN, siteRepo, type SiteRepo } from "./site-server.ts";

// The publish-docs@v2 action as the runner runs it: the `root` and `publish`
// steps of .github/actions/publish-docs/action.yml, with each step's env
// built from the parsed action (inputs and their defaults), under bash as a
// composite `shell: bash` step. The site is a local bare repo; the GitHub
// Releases API is a local server. The setup-node, pnpm and install steps are
// the runner's, not tested here.

const ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const ACTION_DIR = join(ROOT, ".github/actions/publish-docs");
const SCHEMA_ASSETS = join(ROOT, "test/schema/fixtures/assets");
const RELEASE_TOKEN = "release-token-for-tests";
const ALPHA = `${OWNER}/alpha`;

interface Step {
  id?: string;
  run?: string;
  env?: Record<string, string>;
}
const action = parse(readFileSync(join(ACTION_DIR, "action.yml"), "utf8")) as {
  inputs: Record<string, { required?: boolean; default?: string }>;
  outputs: Record<string, { value: string }>;
  runs: { steps: Step[] };
};
const step = (id: string) => action.runs.steps.find((candidate) => candidate.id === id)!;

interface Run {
  code: number;
  stdout: string;
  outputs: Record<string, string>;
}

/** A GitHub Releases API that knows the Releases in `releases`, by tag. */
async function releasesApi(releases: Record<string, { published_at: string; html_url: string; body?: string }>) {
  const authorizations: (string | undefined)[] = [];
  const server: Server = createServer((request, response) => {
    authorizations.push(request.headers.authorization);
    const match = /^\/repos\/([^/]+\/[^/]+)\/releases\/tags\/(.+)$/.exec(request.url ?? "");
    const tag = match === null ? undefined : decodeURIComponent(match[2]);
    const release = match?.[1] === ALPHA && tag !== undefined ? releases[tag] : undefined;
    if (release === undefined) return void response.writeHead(404).end('{"message":"Not Found"}');
    response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ tag_name: tag, draft: false, ...release }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, authorizations, close: () => new Promise((resolve) => server.close(resolve)) };
}

const BOTH_RELEASES = {
  "alpha-cli@1.2.0": { published_at: "2026-01-05T00:00:00Z", html_url: "https://example.invalid/alpha-cli", body: "Notes." },
  "alpha-app@0.3.0": { published_at: "2026-02-04T00:00:00Z", html_url: "https://example.invalid/alpha-app" },
};

describe("publish-docs@v2 action", () => {
  let ws: Workspace;
  let site: SiteRepo;
  let api: Awaited<ReturnType<typeof releasesApi>>;

  beforeEach(async () => {
    ws = new Workspace();
    site = await siteRepo({ "content/other/tool.yaml": "owner: sample-org/other\n" });
    api = await releasesApi(BOTH_RELEASES);
  });
  afterEach(async () => {
    await api.close();
    await site.close();
    ws.remove();
  });

  /** Run the action's root and publish steps, as the runner would, with these inputs. */
  async function runAction(source: string, inputs: Record<string, string>): Promise<Run> {
    const github = { repository: ALPHA, token: RELEASE_TOKEN, api_url: api.url };
    const runner = join(ws.root, "runner");
    mkdirSync(runner, { recursive: true });
    const base = { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", GITHUB_WORKSPACE: ws.root, GITHUB_ACTION_PATH: ACTION_DIR, RUNNER_TEMP: runner };

    const rootOutput = join(runner, "root-output");
    writeFileSync(rootOutput, "");
    await bash(step("root").run!, { ...base, GITHUB_OUTPUT: rootOutput });
    const steps = { root: outputsOf(rootOutput) };

    const given: Record<string, string> = { source, "site-url": site.url, "site-token": SITE_TOKEN, "author-name": "bot", "author-email": "bot@example.invalid", ...inputs };
    const value = (name: string): string => {
      assert.ok(name in action.inputs, `the step reads input ${name}, which the action declares`);
      return given[name] ?? expand(action.inputs[name].default ?? "", { inputs: {}, github, steps: {} });
    };
    const env: Record<string, string> = {};
    for (const [name, template] of Object.entries(step("publish").env!)) env[name] = expand(template, { inputs: { get: value }, github, steps });
    const output = join(runner, "publish-output");
    writeFileSync(output, "");
    const result = await bash(step("publish").run!, { ...base, ...env, GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: join(runner, "summary") });
    return { ...result, outputs: outputsOf(output) };
  }

  const alpha = (files: Files = alphaFiles()) => ws.repo("alpha", files, { tags: ALPHA_TAGS });

  it("publishes, sends the release token to the Releases API, and writes its outputs", async () => {
    const run = await runAction(alpha(), { ref: "wyrd-foo-v2" });
    assert.equal(run.code, 0, run.stdout);
    assert.equal(run.outputs.outcome, "published");
    assert.equal(run.outputs.commit, site.rev());
    assert.ok(site.paths().includes("content/alpha-cli/tool.yaml"));
    assert.deepEqual(api.authorizations, [`Bearer ${RELEASE_TOKEN}`, `Bearer ${RELEASE_TOKEN}`]);
    assert.match(run.stdout, /sample-org\/alpha @ wyrd-foo-v2 [0-9a-f]{12}: published/);
    for (const name of Object.keys(action.outputs)) assert.ok(name in run.outputs, `output ${name} is written`);
  });

  it("fails with an error annotation naming the tag when a code unit's primary tag has no GitHub Release", async () => {
    await api.close();
    api = await releasesApi({ "alpha-cli@1.2.0": BOTH_RELEASES["alpha-cli@1.2.0"] });
    const tip = site.rev();
    const run = await runAction(alpha(), { ref: "wyrd-foo-v2" });
    assert.equal(run.code, 1);
    assert.match(run.stdout, /^::error::error \[alpha-app\] GitHub Release for tag alpha-app@0\.3\.0: not-found: HTTP 404 \(requirement: GitHub Release\)$/m);
    assert.equal(run.outputs.outcome, "failed");
    assert.equal(run.outputs.commit, "");
    assert.equal(site.rev(), tip);
  });

  it("fails a social image that is not 1200x630, naming the file and the field", async () => {
    const files = withProductField("social-image", "assets/social.png", readFileSync(join(SCHEMA_ASSETS, "social-small.png")));
    const run = await runAction(alpha(files), { ref: "wyrd-foo-v2" });
    assert.equal(run.code, 1);
    assert.match(run.stdout, /^::error::error docs\/user\/docs\.yml: products\.alpha-cli\.social-image: assets\/social\.png must be 1200x630; it is 1200x600$/m);
    assert.equal(site.pushes, 0);
  });

  it("fails a favicon that is not SVG or PNG", async () => {
    const files = withProductField("favicon", "assets/favicon.png", readFileSync(join(SCHEMA_ASSETS, "social.jpg")));
    const run = await runAction(alpha(files), { ref: "wyrd-foo-v2" });
    assert.equal(run.code, 1);
    assert.match(run.stdout, /^::error::error docs\/user\/docs\.yml: products\.alpha-cli\.favicon: assets\/favicon\.png must be SVG or PNG; its content is not PNG$/m);
    assert.equal(site.pushes, 0);
  });

  it("features the named product from the feature inputs", async () => {
    const run = await runAction(alpha(), { ref: "wyrd-foo-v2", feature: "true", "feature-product": "alpha-cli", "feature-days": "3", "feature-reason": "A new sample" });
    assert.equal(run.code, 0, run.stdout);
    const featured = parse(site.show("content/alpha-cli/tool.yaml")).featured;
    assert.equal(featured.reason, "A new sample");
    assert.equal(new Date(featured.until).getTime() - new Date(featured.from).getTime(), 3 * 86_400_000);
    assert.equal(parse(site.show("content/alpha-app/tool.yaml")).featured, undefined);
  });

  it("a dry run pushes nothing", async () => {
    const run = await runAction(alpha(), { ref: "wyrd-foo-v2", "dry-run": "true" });
    assert.equal(run.code, 0, run.stdout);
    assert.equal(run.outputs.outcome, "dry-run");
    assert.equal(run.outputs.commit, "");
    assert.equal(site.pushes, 0);
  });

  it("refuses a flag that is not true or false, before it reads anything", async () => {
    const run = await runAction(alpha(), { ref: "wyrd-foo-v2", "dry-run": "yes" });
    assert.equal(run.code, 1);
    assert.match(run.stdout, /^::error::input: PUBLISH_DRY_RUN must be true or false; it is yes$/m);
    assert.equal(site.authorizations.length, 0);
  });
});

/** alphaFiles with one more asset field on alpha-cli, its file at assets/<name> in the product's folder. */
function withProductField(field: string, path: string, bytes: Uint8Array): Files {
  const files = alphaFiles();
  const docs = parse(files["docs/user/docs.yml"] as string);
  docs.products["alpha-cli"][field] = path;
  docs.assets.push(`alpha-cli/${path}`);
  return { ...files, "docs/user/docs.yml": JSON.stringify(docs), [`docs/user/alpha-cli/${path}`]: bytes };
}

interface Context {
  inputs: { get?: (name: string) => string };
  github: Record<string, string>;
  steps: Record<string, Record<string, string>>;
}

/** Replace each `${{ ... }}` the action uses; any other expression fails the test. */
function expand(template: string, context: Context): string {
  return template.replace(/\$\{\{\s*([^}]+?)\s*\}\}/g, (_, expression: string) => {
    let match = /^inputs\.([a-z-]+)$/.exec(expression);
    if (match !== null && context.inputs.get !== undefined) return context.inputs.get(match[1]);
    match = /^github\.([a-z_]+)$/.exec(expression);
    if (match !== null && match[1] in context.github) return context.github[match[1]];
    match = /^steps\.([a-z-]+)\.outputs\.([a-z-]+)$/.exec(expression);
    if (match !== null && context.steps[match[1]]?.[match[2]] !== undefined) return context.steps[match[1]][match[2]];
    throw new Error(`the test cannot expand \${{ ${expression} }}`);
  });
}

function outputsOf(file: string): Record<string, string> {
  const outputs: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const at = line.indexOf("=");
    if (at > 0) outputs[line.slice(0, at)] = line.slice(at + 1);
  }
  return outputs;
}

/** Run a script as a composite `shell: bash` step does. */
function bash(script: string, env: Record<string, string>): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve) => {
    execFile("bash", ["--noprofile", "--norc", "-eo", "pipefail", "-c", script], { env, cwd: env.GITHUB_WORKSPACE, encoding: "utf8" }, (error, stdout) => {
      resolve({ code: error === null ? 0 : typeof error.code === "number" ? error.code : 1, stdout });
    });
  });
}
