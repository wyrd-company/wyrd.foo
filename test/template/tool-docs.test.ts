import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { parse } from "yaml";
import { runLocal, validateRepo, type RepoReport } from "../../publisher/index.ts";
import { pageSchema } from "../../src/schema/index.ts";

// The tool-docs template (templates/tool-docs/) applied to scratch tool repos
// with the real Toha, git and Intentional: the result passes the publisher's
// validate and local mode, `intentional check` passes once the docs baseline
// tag exists, and `--update` from a Git address keeps an operator's edit or
// reports a conflict.
//
// TOHA names the Toha binary (default `toha` on PATH); INTENTIONAL names an
// Intentional 0.2.1 binary (default: `npm exec` of 0.2.1 from npmjs).

const ROOT = new URL("../../", import.meta.url).pathname;
const TEMPLATE = realpathSync(join(ROOT, "templates/tool-docs"));
const TOHA = process.env.TOHA ?? "toha";
const OWNER = "sample-org";

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
}

function run(command: string, args: string[], cwd: string): Run {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.error) throw result.error;
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function ok(command: string, args: string[], cwd: string): string {
  const result = run(command, args, cwd);
  assert.equal(result.status, 0, `${command} ${args.join(" ")} failed:\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

const git = (dir: string, ...args: string[]) => ok("git", args, dir);

function intentional(dir: string, ...args: string[]): Run {
  if (process.env.INTENTIONAL) return run(process.env.INTENTIONAL, args, dir);
  return run(
    "npm",
    ["exec", "--yes", "--package=@wyrd-company/intentional@0.2.1", "--@wyrd-company:registry=https://registry.npmjs.org", "--", "intentional", ...args],
    dir,
  );
}

const scratch = mkdtempSync(join(tmpdir(), "tool-docs-template-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

interface Answers {
  key: string;
  name: string;
  release_unit: string;
  version: string;
  tagline: string;
  blurb: string;
  status: string;
  category: string;
  kind: string;
  install_method?: string;
  install_command: string;
  release_workflow: string;
  intentional: boolean;
  code_unit_projections?: boolean;
  taskfile: string;
}

const CLI_ANSWERS: Answers = {
  key: "sample",
  name: "Sample",
  release_unit: "sample-tool",
  version: "0.3.0",
  tagline: "A sample tool: it does one thing.",
  blurb: "A longer description of the sample tool.",
  status: "preview",
  category: "Agent Tooling",
  kind: "cli",
  install_method: "homebrew",
  install_command: "brew install sample-org/tap/sample",
  release_workflow: "Release",
  intentional: true,
  code_unit_projections: true,
  taskfile: "Taskfile.yml",
};

function answersFile(template: string, answers: Partial<Answers>): string {
  const file = join(mkdtempSync(join(scratch, "answers-")), "answers.json");
  writeFileSync(file, JSON.stringify({ template, answers }));
  return file;
}

/** The config an npm tool repo has after `intentional init`, with its code unit `unit`. */
function intentionalConfig(unit: string, projections: boolean): string {
  return [
    "$schema: https://intentional.foo/schemas/config.yml",
    "contract: contract-1",
    "settings:",
    "  internal-dependency-bump: patch",
    "  pre-1-0-bump-mapping: compatibility",
    ...(projections ? ["discovery:", "  managed-paths:", "  - detector: npm-package", "    path: package.json", `    release-unit: ${unit}`] : []),
    "release-units:",
    `  ${unit}:`,
    "    path: .",
    ...(projections ? ["    projections:", "    - adapter: npm", "      file: package.json", "      mode: committed"] : []),
    "    tags:",
    "      primary:",
    "        role: primary",
    "        template: '{version}'",
    "",
  ].join("\n");
}

const TASKFILE = "version: '3'\n\ntasks:\n  test:\n    cmds:\n      - echo test\n";

/** A scratch tool repo with one commit and its code unit's release tag. */
function toolRepo(name: string, options: { unit?: string; version?: string; projections?: boolean; taskfile?: boolean; intentional?: boolean } = {}): string {
  const dir = join(scratch, name);
  const unit = options.unit ?? "sample-tool";
  const version = options.version ?? "0.3.0";
  mkdirSync(dir);
  git(dir, "init", "-q", "-b", "main");
  git(dir, "remote", "add", "origin", `git@github.com:${OWNER}/${name}.git`);
  writeFileSync(join(dir, "README.md"), `# ${name}\n`);
  if (options.projections !== false) writeFileSync(join(dir, "package.json"), `${JSON.stringify({ name: unit, version, private: true }, null, 2)}\n`);
  if (options.intentional !== false) {
    mkdirSync(join(dir, ".intentional/intents"), { recursive: true });
    writeFileSync(join(dir, ".intentional/config.yml"), intentionalConfig(unit, options.projections !== false));
    writeFileSync(join(dir, ".intentional/intents/.gitkeep"), "");
  }
  if (options.taskfile !== false) writeFileSync(join(dir, "Taskfile.yml"), TASKFILE);
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "init");
  git(dir, "tag", "-a", version, "-m", version);
  return dir;
}

/** `toha apply` on the scripted route; returns its result document. */
function apply(template: string, target: string, answers: string, ...flags: string[]): { status: string; kind?: string; message?: string; merge?: { conflicted: string[] } } {
  const result = run(TOHA, ["apply", template, target, "--answers", answers, ...flags], scratch);
  assert.ok(result.stdout.trim().startsWith("{"), `toha printed no result document:\n${result.stdout}\n${result.stderr}`);
  return JSON.parse(result.stdout);
}

const errors = (report: RepoReport) => report.findings.filter((finding) => finding.severity === "error").map((finding) => finding.message);

const readYaml = <T>(dir: string, path: string) => parse(readFileSync(join(dir, path), "utf8")) as T;

interface Unit {
  path: string;
  "depends-on"?: string[];
  projections?: { adapter: string; file: string; pointer?: string; mode: string }[];
  tags: { primary: { role: string; template: string } };
}

before(() => {
  const version = run(TOHA, ["--version"], scratch);
  assert.equal(version.status, 0, `Toha is not runnable as ${TOHA}; set TOHA to the Toha 0.4.0 binary`);
});

describe("tool-docs apply to a repo with intentional and a Taskfile", () => {
  let dir: string;

  before(() => {
    dir = toolRepo("cli-repo");
    const result = apply(TEMPLATE, dir, answersFile(TEMPLATE, CLI_ANSWERS));
    assert.equal(result.status, "applied", JSON.stringify(result));
  });

  it("writes docs.yml with one product and a starter page that names it", () => {
    const docs = readYaml<{ schemaVersion: number; products: Record<string, { version: string; "docs-version": string; "release-unit": string }> }>(dir, "docs/user/docs.yml");
    assert.equal(docs.schemaVersion, 1);
    assert.deepEqual(Object.keys(docs.products), ["sample"]);
    assert.equal(docs.products.sample.version, "0.3.0");
    assert.equal(docs.products.sample["docs-version"], "0.1.0");
    assert.equal(docs.products.sample["release-unit"], "sample-tool");
    const page = readFileSync(join(dir, "docs/user/overview.md"), "utf8");
    const front = pageSchema.parse(parse(page.split("---\n")[1]));
    assert.equal(front.product, "sample");
  });

  it("says in docs.yml that check reports missing-baseline until the baseline tag, and that the first docs intent is patch", () => {
    const text = readFileSync(join(dir, "docs/user/docs.yml"), "utf8");
    assert.match(text, /`intentional check` reports missing-baseline for sample-docs/);
    assert.match(text, /intentional tag --baseline --version sample-docs=0\.1\.0/);
    assert.match(text, /The first docs intent is `patch`/);
  });

  it("writes a caller of the v2 reusable workflow that never publishes on a plain push", () => {
    const workflow = readYaml<{
      on: { workflow_run: { workflows: string[]; types: string[] }; push: Record<string, unknown>; workflow_dispatch: { inputs: Record<string, unknown> } };
      jobs: { publish: { if: string; uses: string; with: Record<string, string> } };
    }>(dir, ".github/workflows/publish-docs.yml");
    assert.deepEqual(workflow.on.workflow_run, { workflows: ["Release"], types: ["completed"] });
    assert.deepEqual(workflow.on.push, { tags: ["sample-docs@*"] });
    assert.deepEqual(Object.keys(workflow.on.workflow_dispatch.inputs), ["ref", "feature", "feature-product", "feature-days", "feature-reason"]);
    const job = workflow.jobs.publish;
    assert.equal(job.uses, "wyrd-company/wyrd.foo/.github/workflows/publish-docs.yml@v2");
    assert.deepEqual(Object.keys(job.with), ["ref", "feature", "feature-product", "feature-days", "feature-reason"]);
    // The guard: a workflow_run caller runs only after a successful push run of this repo.
    const conjuncts = job.if.split("||")[1].replace(/[()]/g, "").split("&&").map((part) => part.trim());
    assert.equal(job.if.split("||")[0].trim(), "github.event_name != 'workflow_run'");
    assert.deepEqual(conjuncts, [
      "github.event.workflow_run.conclusion == 'success'",
      "github.event.workflow_run.event == 'push'",
      "github.event.workflow_run.head_repository.full_name == github.repository",
    ]);
  });

  it("adds the docs unit and the code unit's version projection to .intentional/config.yml", () => {
    const config = readYaml<{ "release-units": Record<string, Unit> }>(dir, ".intentional/config.yml");
    assert.deepEqual(config["release-units"]["sample-docs"], {
      path: "docs/user",
      "depends-on": ["sample-tool"],
      projections: [{ adapter: "yaml", file: "/docs/user/docs.yml", pointer: "/products/sample/docs-version", mode: "committed" }],
      tags: { primary: { role: "primary", template: "{id}@{version}" } },
    });
    assert.deepEqual(config["release-units"]["sample-tool"].projections, [
      { adapter: "yaml", file: "/docs/user/docs.yml", pointer: "/products/sample/version", mode: "committed" },
      { adapter: "npm", file: "package.json", mode: "committed" },
    ]);
  });

  it("adds docs:validate to the Taskfile, which runs the publisher's validate on the repo", () => {
    const taskfile = readYaml<{ tasks: Record<string, { cmds: string[] }> }>(dir, "Taskfile.yml");
    assert.deepEqual(Object.keys(taskfile.tasks), ["docs:validate", "test"]);
    assert.deepEqual(taskfile.tasks["docs:validate"].cmds, ['node "{{.WYRD_FOO_DIR | default "../wyrd.foo"}}/publisher/cli.ts" validate "{{.ROOT_DIR}}" {{.CLI_ARGS}}']);
  });

  it("passes the publisher's validate with no errors", async () => {
    const report = await validateRepo({ dir });
    assert.deepEqual(errors(report), []);
    assert.equal(report.outcome, "passed");
    assert.deepEqual(report.products, ["sample"]);
  });

  it("passes local mode with no errors", async () => {
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "docs: onboard to wyrd.foo");
    git(dir, "branch", "wyrd-foo-v2");
    const content = mkdtempSync(join(scratch, "content-"));
    const [report] = await runLocal({ config: { branch: "wyrd-foo-v2", repos: [{ name: "cli-repo" }] }, toolsDir: scratch, contentDir: content });
    assert.deepEqual(errors(report), []);
    assert.equal(report.outcome, "published");
    assert.ok(existsSync(join(content, "sample/tool.yaml")));
    assert.ok(existsSync(join(content, "sample/docs/overview.md")));
  });

  it("reports missing-baseline until the docs baseline tag exists, then intentional check passes and the first docs intent is patch", () => {
    const before = intentional(dir, "check");
    assert.equal(before.status, 1);
    assert.match(before.stdout + before.stderr, /missing-baseline.*sample-docs/);
    assert.equal(intentional(dir, "tag", "--baseline", "--version", "sample-docs=0.1.0").status, 0);
    const check = intentional(dir, "check");
    assert.equal(check.status, 0, check.stdout + check.stderr);
    assert.equal(intentional(dir, "add", "--release-unit", "sample-docs:patch", "--message", "Describe the sample tool.").status, 0);
    assert.match(intentional(dir, "status").stdout, /sample-docs: 0\.1\.0 -> 0\.1\.1 \(patch\)/);
  });
});

describe("tool-docs apply to a repo whose code unit has no projections", () => {
  let dir: string;

  before(() => {
    dir = toolRepo("mcp-repo", { unit: "sample-server", version: "1.2.0", projections: false, taskfile: false });
    const answers: Partial<Answers> = {
      ...CLI_ANSWERS,
      key: "sample-mcp",
      release_unit: "sample-server",
      version: "1.2.0",
      kind: "mcp-server",
      install_command: "claude mcp add sample -- sample-server",
      install_method: undefined,
      code_unit_projections: false,
      taskfile: "none",
    };
    const result = apply(TEMPLATE, dir, answersFile(TEMPLATE, answers));
    assert.equal(result.status, "applied", JSON.stringify(result));
  });

  it("adds a projections list to the code unit", () => {
    const config = readYaml<{ "release-units": Record<string, Unit> }>(dir, ".intentional/config.yml");
    assert.deepEqual(config["release-units"]["sample-server"].projections, [
      { adapter: "yaml", file: "/docs/user/docs.yml", pointer: "/products/sample-mcp/version", mode: "committed" },
    ]);
    assert.equal(config["release-units"]["sample-mcp-docs"].path, "docs/user");
  });

  it("passes the publisher's validate and, after the docs baseline, intentional check", async () => {
    const report = await validateRepo({ dir });
    assert.deepEqual(errors(report), []);
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "docs: onboard to wyrd.foo");
    assert.equal(intentional(dir, "tag", "--baseline", "--version", "sample-mcp-docs=0.1.0").status, 0);
    const check = intentional(dir, "check");
    assert.equal(check.status, 0, check.stdout + check.stderr);
  });
});

describe("tool-docs apply to a repo without intentional", () => {
  it("writes the docs and the workflow and injects nothing", async () => {
    const dir = toolRepo("plain-repo", { intentional: false, taskfile: false });
    const result = apply(TEMPLATE, dir, answersFile(TEMPLATE, { ...CLI_ANSWERS, intentional: false, code_unit_projections: undefined, taskfile: "none" }));
    assert.equal(result.status, "applied", JSON.stringify(result));
    assert.ok(!existsSync(join(dir, ".intentional")));
    assert.deepEqual(errors(await validateRepo({ dir })), []);
  });
});

describe("tool-docs apply over an existing file", () => {
  it("refuses, names the file and writes nothing", () => {
    const dir = toolRepo("collision-repo");
    mkdirSync(join(dir, "docs/user"), { recursive: true });
    writeFileSync(join(dir, "docs/user/docs.yml"), "schemaVersion: 1\n");
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "existing docs");
    const result = apply(TEMPLATE, dir, answersFile(TEMPLATE, CLI_ANSWERS));
    assert.equal(result.status, "error");
    assert.equal(result.kind, "conflict");
    assert.match(result.message ?? "", /docs\/user\/docs\.yml/);
    assert.equal(git(dir, "status", "--porcelain"), "");
  });
});

describe("tool-docs update", () => {
  // The template from a Git address: a scratch repo that holds a copy of
  // templates/tool-docs, so the test can commit a template change.
  const HEADER = "# The products this repo publishes to wyrd.foo. Made by the wyrd.foo";
  let templateRepo: string;
  let templateBase: string;
  let address: string;

  function changeTemplate(line: string) {
    const file = join(templateRepo, "templates/tool-docs/template/docs/user/docs.yml");
    const text = readFileSync(file, "utf8");
    assert.ok(text.includes(HEADER), "the template's docs.yml holds the header line");
    writeFileSync(file, text.replace(HEADER, line));
    git(templateRepo, "commit", "-q", "-a", "-m", "change the template");
  }

  function editDocs(dir: string, from: string, to: string) {
    const file = join(dir, "docs/user/docs.yml");
    const text = readFileSync(file, "utf8");
    assert.ok(text.includes(from), `docs.yml holds ${from}`);
    writeFileSync(file, text.replace(from, to));
    git(dir, "commit", "-q", "-a", "-m", "operator edit");
  }

  function appliedRepo(name: string): string {
    const dir = toolRepo(name);
    const result = apply(address, dir, answersFile(address, CLI_ANSWERS));
    assert.equal(result.status, "applied", JSON.stringify(result));
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "docs: onboard to wyrd.foo");
    return dir;
  }

  before(() => {
    templateRepo = join(scratch, "template-repo");
    mkdirSync(join(templateRepo, "templates"), { recursive: true });
    cpSync(TEMPLATE, join(templateRepo, "templates/tool-docs"), { recursive: true });
    git(templateRepo, "init", "-q", "-b", "main");
    git(templateRepo, "add", "-A");
    git(templateRepo, "commit", "-q", "-m", "template");
    templateBase = git(templateRepo, "rev-parse", "HEAD");
    address = `file://${templateRepo}@main#templates/tool-docs`;
  });

  it("keeps an edit that does not overlap the template change and applies the change", () => {
    git(templateRepo, "reset", "-q", "--hard", templateBase);
    const dir = appliedRepo("update-repo");
    editDocs(dir, '      - "A sample tool: it does one thing."\n', '      - "A sample tool: it does one thing."\n      - "An operator highlight."\n');
    changeTemplate("# The products this repo publishes to wyrd.foo, changed by the template. Made by the wyrd.foo");
    const result = apply(address, dir, answersFile(address, {}), "--update");
    assert.equal(result.status, "applied", JSON.stringify(result));
    assert.deepEqual(result.merge?.conflicted, []);
    const text = readFileSync(join(dir, "docs/user/docs.yml"), "utf8");
    assert.match(text, /changed by the template/);
    assert.match(text, /An operator highlight\./);
  });

  it("reports an edit that overlaps the template change as a conflict", () => {
    git(templateRepo, "reset", "-q", "--hard", templateBase);
    const dir = appliedRepo("conflict-repo");
    editDocs(dir, HEADER, "# The products this repo publishes to wyrd.foo, edited by the operator. Made by the wyrd.foo");
    changeTemplate("# The products this repo publishes to wyrd.foo, changed by the template. Made by the wyrd.foo");
    const result = apply(address, dir, answersFile(address, {}), "--update");
    assert.equal(result.status, "applied", JSON.stringify(result));
    assert.deepEqual(result.merge?.conflicted, ["docs/user/docs.yml"]);
    assert.match(git(dir, "status", "--porcelain"), /^UU docs\/user\/docs\.yml$/m);
  });

  // README.md, "Update", says this; Toha 0.4.0 does not report it as drift.
  it("replaces an edit inside a managed region with the template's body", () => {
    git(templateRepo, "reset", "-q", "--hard", templateBase);
    const dir = appliedRepo("region-repo");
    const file = join(dir, "Taskfile.yml");
    writeFileSync(file, readFileSync(file, "utf8").replace("  docs:validate:\n", "  docs:validate:\n    silent: true\n"));
    git(dir, "commit", "-q", "-a", "-m", "operator edit in the region");
    changeTemplate("# The products this repo publishes to wyrd.foo, changed by the template. Made by the wyrd.foo");
    const result = apply(address, dir, answersFile(address, {}), "--update");
    assert.equal(result.status, "applied", JSON.stringify(result));
    assert.deepEqual(result.merge?.conflicted, []);
    assert.doesNotMatch(readFileSync(file, "utf8"), /silent: true/);
  });

  it("refuses to update from a folder path, which has no revision, and names --baseline", () => {
    const dir = toolRepo("folder-repo");
    apply(TEMPLATE, dir, answersFile(TEMPLATE, CLI_ANSWERS));
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "docs: onboard to wyrd.foo");
    const result = run(TOHA, ["apply", TEMPLATE, dir, "--update", "--answers", answersFile(TEMPLATE, {})], scratch);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /no reproducible revision.*--baseline/);
  });
});
