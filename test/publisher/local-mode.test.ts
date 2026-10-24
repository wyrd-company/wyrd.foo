import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { stringify } from "yaml";
import { runLocal, type LocalConfig, type RepoReport } from "../../publisher/index.ts";
import { toolFileSchema } from "../../src/schema/index.ts";
import { fakeReleases, git, OWNER, WIDE_SVG, Workspace } from "./fixture-repo.ts";
import { ALPHA_CLI_RELEASE, ALPHA_TAGS, alphaFiles, BETA_TAGS, betaFiles, brokenFiles, gammaFiles } from "./fixtures.ts";

// Local mode over fixture clones: each case asserts the content folder it
// writes and the findings it reports.

const config = (...names: string[]): LocalConfig => ({ branch: "wyrd-foo-v2", repos: names.map((name) => ({ name })) });

function reportOf(reports: RepoReport[], name: string): RepoReport {
  const report = reports.find((candidate) => candidate.name === name);
  assert.ok(report, `a report for ${name}`);
  return report;
}

const messages = (report: RepoReport, severity: "warning" | "error") =>
  report.findings.filter((finding) => finding.severity === severity).map((finding) => `${finding.key ?? ""}: ${finding.message}`);

describe("local mode", () => {
  const ws = new Workspace();
  const releases = fakeReleases({ [`${OWNER}/alpha@alpha-cli@1.2.0`]: ALPHA_CLI_RELEASE, [`${OWNER}/beta@sample-image@2.0.0`]: ALPHA_CLI_RELEASE });
  let reports: RepoReport[];
  let alphaDir: string;
  let alphaBefore: { head: string; branch: string; refs: string; index: Buffer };

  before(async () => {
    ws.repo("broken", brokenFiles());
    alphaDir = ws.repo("alpha", alphaFiles(), { tags: ALPHA_TAGS });
    git(alphaDir, "gc", "-q"); // packed objects and packed refs
    ws.repo("beta", betaFiles(), { tags: BETA_TAGS });
    ws.repo("gamma", gammaFiles());
    ws.repo("nobranch", gammaFiles(), { branch: null });
    alphaBefore = {
      head: git(alphaDir, "rev-parse", "HEAD"),
      branch: git(alphaDir, "rev-parse", "--abbrev-ref", "HEAD"),
      refs: git(alphaDir, "for-each-ref"),
      index: readFileSync(join(alphaDir, ".git", "index")),
    };
    reports = await runLocal({
      config: config("broken", "alpha", "beta", "gamma", "nobranch", "noclone"),
      toolsDir: ws.toolsDir,
      contentDir: ws.contentDir,
      releases,
    });
  });
  after(() => ws.remove());

  it("writes a multi-product map: each product's docs folder mirrored to docs/, with used assets and both changelogs", () => {
    assert.equal(reportOf(reports, "alpha").outcome, "published");
    assert.deepEqual(ws.files("alpha-cli"), [
      "CHANGELOG.md",
      "docs/CHANGELOG.md",
      "docs/assets/demo.svg",
      "docs/assets/diagram.svg",
      "docs/assets/logo.svg",
      "docs/getting-started.md",
      "docs/guides/deep.md",
      "tool.yaml",
    ]);
    assert.deepEqual(ws.files("alpha-app"), ["CHANGELOG.md", "docs/assets/demo.svg", "docs/getting-started.md", "tool.yaml"]);
    assert.match(ws.text("alpha-cli", "CHANGELOG.md"), /## 1\.2\.0/, "the code unit changelog");
    assert.match(ws.text("alpha-cli", "docs/CHANGELOG.md"), /## 1\.0\.0/, "the docs unit changelog");
    assert.equal(ws.text("alpha-cli", "docs/getting-started.md"), alphaFiles()["docs/user/alpha-cli/getting-started.md"]);
  });

  it("keeps a per-key product's asset fields relative to its docs folder, so they resolve under docs/", () => {
    const tool = ws.tool("alpha-cli");
    assert.equal(tool.logo, "assets/logo.svg");
    assert.deepEqual(tool.media, [{ src: "assets/demo.svg", caption: "A sample screen." }]);
    for (const path of [tool.logo, tool.media[0].src]) assert.ok(ws.files("alpha-cli").includes(`docs/${path}`), path);
  });

  it("writes tool.yaml with owner, release unit and the GitHub Release", () => {
    const tool = ws.tool("alpha-cli");
    assert.equal(tool.owner, `${OWNER}/alpha`);
    assert.equal(tool["release-unit"], "alpha-cli");
    assert.deepEqual(tool.release, {
      version: "1.2.0",
      date: "2026-01-05T00:00:00.000Z",
      url: ALPHA_CLI_RELEASE.url,
      notes: ALPHA_CLI_RELEASE.notes,
    });
    assert.ok(toolFileSchema.safeParse(tool).success);
  });

  it("writes every kind of a product with two kinds", () => {
    assert.deepEqual(
      ws.tool("alpha-app").kinds.map((block: { kind: string }) => block.kind),
      ["app", "devcontainer-feature"],
    );
  });

  it("reads a tag with no GitHub Release from the local tag and the unit changelog, with a warning", () => {
    assert.deepEqual(ws.tool("alpha-app").release, {
      version: "0.3.0",
      date: "2026-02-03T04:05:06.000Z",
      notes: "### Features\n\n- Add the sample service.",
    });
    const warning = reportOf(reports, "alpha").findings.find((finding) => finding.key === "alpha-app" && finding.requirement === "GitHub Release");
    assert.equal(warning?.severity, "warning");
    assert.match(warning!.message, /alpha-app@0\.3\.0: not-found/);
  });

  it("writes a feature entry from its devcontainer-feature.json, README and annotated tag", () => {
    assert.deepEqual(ws.files("sample-feature"), ["CHANGELOG.md", "README.md", "devcontainer-feature.json", "docs/assets/feature.svg", "tool.yaml"]);
    const tool = ws.tool("sample-feature");
    assert.deepEqual(tool.kinds, [{ kind: "devcontainer-feature", ref: "ghcr.io/sample-org/beta/sample-feature:1" }]);
    assert.equal(tool.name, "Sample feature");
    assert.equal(tool.description, "Installs a sample.");
    assert.equal(tool.version, "1.4.2");
    assert.equal(tool.category, "Dev Containers");
    assert.deepEqual(tool.release, { version: "1.4.2", date: "2026-03-04T05:06:07.000Z", notes: "### Features\n\n- Add a sample option." });
    assert.equal(tool.featured, undefined);
    assert.ok(!releases.calls.some((call) => call.includes("sample-feature")), "a feature entry never asks for a GitHub Release");
  });

  it("warns when the README option names differ from devcontainer-feature.json", () => {
    const beta = reportOf(reports, "beta");
    assert.deepEqual(messages(beta, "warning"), [
      "sample-feature: option names differ from devcontainer-feature.json (README only: shape; devcontainer-feature.json only: size)",
    ]);
  });

  it("writes an image with its manifest.json and the tags it names", () => {
    assert.deepEqual(ws.files("sample-image"), ["CHANGELOG.md", "docs/CHANGELOG.md", "docs/assets/demo.svg", "docs/overview.md", "manifest.json", "tool.yaml"]);
    assert.match(ws.text("sample-image", "docs/CHANGELOG.md"), /Write the image overview/, "the root docs changelog of a repo with one docs unit");
    assert.deepEqual(ws.tool("sample-image").kinds[0].tags, [
      { tag: "first", architectures: ["linux/amd64"] },
      { tag: "second", architectures: ["linux/amd64"] },
    ]);
  });

  it("publishes a repo without intentional, with a warning and no release", () => {
    const gamma = reportOf(reports, "gamma");
    assert.equal(gamma.outcome, "published");
    assert.deepEqual(
      gamma.findings.map((finding) => [finding.severity, finding.requirement]),
      [["warning", "intentional"]],
    );
    assert.equal(ws.tool("gamma-tool").release, undefined);
    assert.equal(ws.tool("gamma-tool")["release-unit"], "gamma-tool");
  });

  it("fails a repo whose docs.yml fails the schema, writes nothing for it, and goes on", () => {
    const broken = reportOf(reports, "broken");
    assert.equal(broken.outcome, "failed");
    assert.match(messages(broken, "error").join("\n"), /schemaVersion/);
    assert.throws(() => ws.files("broken-tool"));
    assert.equal(reportOf(reports, "alpha").outcome, "published", "the next repo still runs");
  });

  it("skips a clone with no wyrd-foo-v2 branch and a missing clone, with warnings", () => {
    const nobranch = reportOf(reports, "nobranch");
    assert.equal(nobranch.outcome, "skipped");
    assert.equal(nobranch.findings[0].requirement, "wyrd-foo-v2 branch");
    assert.equal(reportOf(reports, "noclone").outcome, "skipped");
    assert.match(reportOf(reports, "noclone").findings[0].message, /no local clone/);
  });

  it("leaves the clone as it was: same HEAD, branch, refs and index, and a clean working tree", () => {
    assert.equal(git(alphaDir, "rev-parse", "HEAD"), alphaBefore.head);
    assert.equal(git(alphaDir, "rev-parse", "--abbrev-ref", "HEAD"), alphaBefore.branch);
    assert.equal(git(alphaDir, "for-each-ref"), alphaBefore.refs);
    assert.deepEqual(readFileSync(join(alphaDir, ".git", "index")), alphaBefore.index);
    assert.equal(git(alphaDir, "status", "--porcelain"), "");
  });
});

describe("local mode: key ownership", () => {
  const ws = new Workspace();
  after(() => ws.remove());

  it("rejects a key another repo owns and leaves that repo's folder as it was", async () => {
    ws.repo("alpha", alphaFiles(), { tags: ALPHA_TAGS });
    ws.repo("gamma", gammaFiles());
    ws.repo("delta", renamed("alpha-cli"));
    await runLocal({ config: config("alpha"), toolsDir: ws.toolsDir, contentDir: ws.contentDir });
    const before = readFileSync(join(ws.contentDir, "alpha-cli", "tool.yaml"), "utf8");
    const reports = await runLocal({ config: config("delta"), toolsDir: ws.toolsDir, contentDir: ws.contentDir });
    const delta = reportOf(reports, "delta");
    assert.equal(delta.outcome, "failed");
    assert.deepEqual(messages(delta, "error"), [`alpha-cli: key alpha-cli is owned by ${OWNER}/alpha; ${OWNER}/delta cannot publish it`]);
    assert.equal(readFileSync(join(ws.contentDir, "alpha-cli", "tool.yaml"), "utf8"), before);
    assert.equal(ws.tool("alpha-cli").owner, `${OWNER}/alpha`);
  });

  it("refuses a key whose folder names no owner", async () => {
    mkdirSync(join(ws.contentDir, "gamma-tool"), { recursive: true });
    writeFileSync(join(ws.contentDir, "gamma-tool", "tool.yaml"), "name: gamma-tool\n");
    const reports = await runLocal({ config: config("gamma"), toolsDir: ws.toolsDir, contentDir: ws.contentDir });
    assert.equal(reportOf(reports, "gamma").outcome, "failed");
    assert.deepEqual(messages(reportOf(reports, "gamma"), "error"), ["gamma-tool: content/gamma-tool/ has an unknown owner (tool.yaml names no owner); it is not replaced"]);
    assert.equal(readFileSync(join(ws.contentDir, "gamma-tool", "tool.yaml"), "utf8"), "name: gamma-tool\n");
    rmSync(join(ws.contentDir, "gamma-tool"), { recursive: true });
  });

  it("writes no product of a repo when one product fails a check", async () => {
    const files = alphaFiles();
    files["docs/user/alpha-cli/assets/logo.svg"] = WIDE_SVG;
    ws.repo("zeta", renamedAlpha(files));
    const reports = await runLocal({ config: config("zeta"), toolsDir: ws.toolsDir, contentDir: ws.contentDir });
    assert.equal(reportOf(reports, "zeta").outcome, "failed");
    assert.throws(() => ws.files("zeta-app"), "the product that passes is not written either");
  });

  it("deletes the folder of a product the owner removed, and keeps other repos' folders", async () => {
    const alphaDir = join(ws.toolsDir, "alpha");
    await runLocal({ config: config("gamma"), toolsDir: ws.toolsDir, contentDir: ws.contentDir });
    ws.update(alphaDir, alphaFiles({ withApp: false }));
    const reports = await runLocal({ config: config("alpha"), toolsDir: ws.toolsDir, contentDir: ws.contentDir });
    assert.deepEqual(reportOf(reports, "alpha").deleted, ["alpha-app"]);
    assert.throws(() => ws.files("alpha-app"));
    assert.ok(ws.files("alpha-cli").includes("tool.yaml"));
    assert.ok(ws.files("gamma-tool").includes("tool.yaml"), "a folder of another repo stays");
  });

  it("carries featured forward, and drops a featured block that is not valid", async () => {
    const file = join(ws.contentDir, "alpha-cli", "tool.yaml");
    const featured = { from: "2026-01-05T00:00:00.000Z", until: "2026-01-19T00:00:00.000Z", reason: "New release", version: "1.2.0" };
    writeFileSync(file, stringify({ ...ws.tool("alpha-cli"), featured }));
    let reports = await runLocal({ config: config("alpha"), toolsDir: ws.toolsDir, contentDir: ws.contentDir });
    assert.equal(reportOf(reports, "alpha").outcome, "published");
    assert.deepEqual(ws.tool("alpha-cli").featured, featured);

    writeFileSync(file, stringify({ ...ws.tool("alpha-cli"), featured: { ...featured, until: featured.from } }));
    reports = await runLocal({ config: config("alpha"), toolsDir: ws.toolsDir, contentDir: ws.contentDir });
    assert.equal(reportOf(reports, "alpha").outcome, "published");
    assert.equal(ws.tool("alpha-cli").featured, undefined);
    assert.match(messages(reportOf(reports, "alpha"), "warning").join("\n"), /featured is not valid; it is dropped/);
  });

  it("reads the branch of the origin remote when the clone has no local branch", async () => {
    const dir = ws.repo("epsilon", renamed("epsilon-tool"));
    const oid = git(dir, "rev-parse", "wyrd-foo-v2").trim();
    git(dir, "update-ref", "refs/remotes/origin/wyrd-foo-v2", oid);
    git(dir, "branch", "-q", "-D", "wyrd-foo-v2");
    const reports = await runLocal({ config: config("epsilon"), toolsDir: ws.toolsDir, contentDir: ws.contentDir });
    const epsilon = reportOf(reports, "epsilon");
    assert.equal(epsilon.outcome, "published");
    assert.equal(epsilon.ref, "refs/remotes/origin/wyrd-foo-v2");
    assert.equal(epsilon.oid, oid);
  });
});

describe("local mode: fetch from origin", () => {
  const ws = new Workspace();
  after(() => ws.remove());
  const repos = (name: string): LocalConfig => ({ branch: "wyrd-foo-v2", repos: [{ name, owner: `${OWNER}/${name}` }] });

  /** A bare origin, and a second clone that pushes `files` to its wyrd-foo-v2 branch. */
  function pushFromElsewhere(origin: string, files: Record<string, string | Uint8Array>) {
    const other = join(ws.root, `push-${Math.random().toString(36).slice(2)}`);
    git(ws.root, "clone", "-q", origin, other);
    git(other, "checkout", "-q", "wyrd-foo-v2");
    for (const [path, content] of Object.entries(files)) writeFileSync(join(other, path), content);
    git(other, "commit", "-q", "-am", "pushed change");
    git(other, "push", "-q", "origin", "wyrd-foo-v2");
    return git(other, "rev-parse", "HEAD").trim();
  }

  it("fetches the branch, reads origin/wyrd-foo-v2, and changes only that ref", async () => {
    const origin = join(ws.root, "kappa.git");
    git(ws.root, "init", "-q", "--bare", "-b", "main", origin);
    const dir = ws.repo("kappa", renamed("kappa-tool"), { origin });
    git(dir, "push", "-q", "origin", "main", "wyrd-foo-v2");
    const docs = renamed("kappa-tool")["docs/user/docs.yml"].toString().replace("The kappa-tool sample.", "The pushed sample.");
    const pushed = pushFromElsewhere(origin, { "docs/user/docs.yml": docs });
    const before = {
      head: git(dir, "rev-parse", "HEAD"),
      local: git(dir, "rev-parse", "refs/heads/wyrd-foo-v2"),
      index: readFileSync(join(dir, ".git", "index")),
    };

    const reports = await runLocal({ config: repos("kappa"), toolsDir: ws.toolsDir, contentDir: ws.contentDir, fetch: true });
    const kappa = reportOf(reports, "kappa");
    assert.equal(kappa.outcome, "published");
    assert.equal(kappa.ref, "refs/remotes/origin/wyrd-foo-v2");
    assert.equal(kappa.oid, pushed);
    assert.equal(ws.tool("kappa-tool").tagline, "The pushed sample.");
    assert.equal(git(dir, "rev-parse", "HEAD"), before.head);
    assert.equal(git(dir, "rev-parse", "refs/heads/wyrd-foo-v2"), before.local, "the local branch is not moved");
    assert.deepEqual(readFileSync(join(dir, ".git", "index")), before.index);
    assert.equal(git(dir, "status", "--porcelain"), "");
    assert.ok(!existsSync(join(dir, ".git", "FETCH_HEAD")), "no FETCH_HEAD is written");
  });

  it("without fetch (offline), reads the origin ref the clone already has", async () => {
    const origin = join(ws.root, "kappa.git");
    const dir = join(ws.toolsDir, "kappa");
    const known = git(dir, "rev-parse", "refs/remotes/origin/wyrd-foo-v2").trim();
    const docs = renamed("kappa-tool")["docs/user/docs.yml"].toString().replace("The kappa-tool sample.", "A later sample.");
    pushFromElsewhere(origin, { "docs/user/docs.yml": docs });
    const reports = await runLocal({ config: repos("kappa"), toolsDir: ws.toolsDir, contentDir: ws.contentDir });
    assert.equal(reportOf(reports, "kappa").oid, known);
    assert.equal(ws.tool("kappa-tool").tagline, "The pushed sample.");
  });

  it("falls back to the local branch, with a warning, when origin has no such branch", async () => {
    const origin = join(ws.root, "lambda.git");
    git(ws.root, "init", "-q", "--bare", "-b", "main", origin);
    const dir = ws.repo("lambda", renamed("lambda-tool"), { origin });
    const reports = await runLocal({ config: repos("lambda"), toolsDir: ws.toolsDir, contentDir: ws.contentDir, fetch: true });
    const lambda = reportOf(reports, "lambda");
    assert.equal(lambda.outcome, "published");
    assert.equal(lambda.ref, "refs/heads/wyrd-foo-v2");
    assert.equal(lambda.oid, git(dir, "rev-parse", "refs/heads/wyrd-foo-v2").trim());
    const fetchWarnings = messages(lambda, "warning").filter((message) => message.includes("could not fetch"));
    assert.equal(fetchWarnings.length, 1);
    assert.match(fetchWarnings[0], /^: could not fetch wyrd-foo-v2 from origin: .*wyrd-foo-v2/);
  });
});

describe("local mode: a damaged clone", () => {
  const ws = new Workspace();
  after(() => ws.remove());

  it("fails the repo with the read error, not as a missing file, and goes on", async () => {
    const dir = ws.repo("gamma", gammaFiles());
    ws.repo("alpha", alphaFiles(), { tags: ALPHA_TAGS });
    const blob = git(dir, "rev-parse", "wyrd-foo-v2:docs/user/getting-started.md").trim();
    rmSync(join(dir, ".git", "objects", blob.slice(0, 2), blob.slice(2)));
    const reports = await runLocal({ config: config("gamma", "alpha"), toolsDir: ws.toolsDir, contentDir: ws.contentDir });
    const gamma = reportOf(reports, "gamma");
    assert.equal(gamma.outcome, "failed");
    assert.deepEqual(gamma.findings.map((finding) => finding.severity), ["error"]);
    assert.match(gamma.findings[0].message, /^failed: /);
    assert.doesNotMatch(gamma.findings[0].message, /does not exist/);
    assert.throws(() => ws.files("gamma-tool"));
    assert.equal(reportOf(reports, "alpha").outcome, "published");
  });
});

/** alpha's files with its product keys renamed to zeta-cli and zeta-app. */
function renamedAlpha(files: ReturnType<typeof alphaFiles>) {
  const out: typeof files = {};
  for (const [path, content] of Object.entries(files)) {
    out[path.replaceAll("alpha-", "zeta-")] = typeof content === "string" ? content.replaceAll("alpha-", "zeta-") : content;
  }
  return out;
}

/** gamma's files with its product key renamed. */
function renamed(key: string) {
  const files = gammaFiles();
  files["docs/user/docs.yml"] = files["docs/user/docs.yml"].toString().replaceAll("gamma-tool", key);
  files["docs/user/getting-started.md"] = files["docs/user/getting-started.md"].toString().replace("gamma-tool", key);
  return files;
}
