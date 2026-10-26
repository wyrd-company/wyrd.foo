import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { stringify } from "yaml";
import { FETCH_KILL_GRACE_MS, fetchBranch, runLocal, type LocalConfig, type RepoReport } from "../../publisher/index.ts";
import { toolFileSchema } from "../../src/schema/index.ts";
import { fakeReleases, git, OWNER, SQUARE_SVG, WIDE_SVG, Workspace } from "./fixture-repo.ts";
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
    assert.deepEqual(ws.files("sample-feature"), ["CHANGELOG.md", "README.md", "devcontainer-feature.json", "docs/feature.svg", "tool.yaml"]);
    const tool = ws.tool("sample-feature");
    assert.equal(tool.logo, "feature.svg", "the logo is read from the source folder and delivered at docs/<logo>");
    assert.equal(ws.text("sample-feature", "docs/feature.svg"), SQUARE_SVG);
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
  function pushFromElsewhere(origin: string, files: Record<string, string | Uint8Array>, tag?: string) {
    const other = join(ws.root, `push-${Math.random().toString(36).slice(2)}`);
    git(ws.root, "clone", "-q", origin, other);
    git(other, "checkout", "-q", "wyrd-foo-v2");
    for (const [path, content] of Object.entries(files)) writeFileSync(join(other, path), content);
    git(other, "commit", "-q", "-am", "pushed change");
    git(other, "push", "-q", "origin", "wyrd-foo-v2");
    if (tag !== undefined) {
      git(other, "tag", "-a", tag, "-m", "pushed tag");
      git(other, "push", "-q", "origin", tag);
    }
    return git(other, "rev-parse", "HEAD").trim();
  }

  /** A clone of a bare origin that holds `wyrd-foo-v2`. */
  function cloneWithOrigin(name: string) {
    const origin = join(ws.root, `${name}.git`);
    git(ws.root, "init", "-q", "--bare", "-b", "main", origin);
    const dir = ws.repo(name, renamed(`${name}-tool`), { origin });
    git(dir, "push", "-q", "origin", "main", "wyrd-foo-v2");
    return { origin, dir };
  }

  const docsOf = (name: string, tagline: string) => ({
    "docs/user/docs.yml": renamed(`${name}-tool`)["docs/user/docs.yml"].toString().replace(`The ${name}-tool sample.`, tagline),
  });

  /** Run `body` with `ssh` on PATH replaced by a stub; it logs its arguments and environment, then runs `then`. */
  async function withStubSsh(then: string, body: (stub: { log: string; dir: string }) => Promise<void>) {
    const dir = mkdtempSync(join(ws.root, "stub-"));
    const log = join(dir, "ssh.log");
    writeFileSync(join(dir, "ssh"), `#!/bin/sh\n{ echo "ARGS $*"; echo "PROMPT=\${GIT_TERMINAL_PROMPT-unset}"; } >> '${log}'\n${then}\n`);
    chmodSync(join(dir, "ssh"), 0o755);
    const saved = { PATH: process.env.PATH, GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND, GIT_TERMINAL_PROMPT: process.env.GIT_TERMINAL_PROMPT };
    // A hostile parent environment must not reach git: the fetch sets its own GIT_* values.
    process.env.PATH = `${dir}:${saved.PATH}`;
    process.env.GIT_SSH_COMMAND = "ssh -o BatchMode=no";
    process.env.GIT_TERMINAL_PROMPT = "1";
    try {
      await body({ log, dir });
    } finally {
      for (const [name, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
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

  it("fetches only the origin ref when the clone's refspec maps the branch to a local branch", async () => {
    const { origin, dir } = cloneWithOrigin("mu");
    git(dir, "config", "remote.origin.fetch", "+refs/heads/wyrd-foo-v2:refs/heads/wyrd-foo-v2");
    const local = git(dir, "rev-parse", "refs/heads/wyrd-foo-v2").trim();
    const pushed = pushFromElsewhere(origin, docsOf("mu", "The pushed sample."));
    assert.notEqual(pushed, local);

    const reports = await runLocal({ config: repos("mu"), toolsDir: ws.toolsDir, contentDir: ws.contentDir, fetch: true });
    assert.equal(reportOf(reports, "mu").oid, pushed);
    assert.equal(git(dir, "rev-parse", "refs/remotes/origin/wyrd-foo-v2").trim(), pushed);
    assert.equal(git(dir, "rev-parse", "refs/heads/wyrd-foo-v2").trim(), local, "the local branch is not moved");
  });

  it("does not fetch tags, even one that points at a fetched commit", async () => {
    const { origin, dir } = cloneWithOrigin("nu");
    const tagsBefore = git(dir, "for-each-ref", "refs/tags");
    const pushed = pushFromElsewhere(origin, docsOf("nu", "The pushed sample."), "v9.9.9");
    assert.match(git(ws.root, "--git-dir", origin, "for-each-ref", "refs/tags"), /refs\/tags\/v9\.9\.9/, "the origin has the tag");

    assert.deepEqual(await fetchBranch(dir, "wyrd-foo-v2"), { ok: true });
    assert.equal(git(dir, "rev-parse", "refs/remotes/origin/wyrd-foo-v2").trim(), pushed);
    assert.equal(git(dir, "for-each-ref", "refs/tags"), tagsBefore, "the clone's tags are unchanged");
  });

  it("runs ssh with BatchMode=yes, whatever GIT_SSH_COMMAND the parent has", async () => {
    const { origin, dir } = cloneWithOrigin("xi");
    git(dir, "remote", "set-url", "origin", "ssh://stub-host/xi");
    const pushed = pushFromElsewhere(origin, docsOf("xi", "The pushed sample."));
    await withStubSsh(`exec git upload-pack '${origin}'`, async ({ log }) => {
      assert.deepEqual(await fetchBranch(dir, "wyrd-foo-v2"), { ok: true });
      const calls = readFileSync(log, "utf8");
      assert.match(calls, /^ARGS .*-o BatchMode=yes .*stub-host/m, "the stub ssh was reached with BatchMode=yes");
      assert.doesNotMatch(calls, /BatchMode=no/);
    });
    assert.equal(git(dir, "rev-parse", "refs/remotes/origin/wyrd-foo-v2").trim(), pushed);
  });

  it("runs git with GIT_TERMINAL_PROMPT=0, whatever the parent has", async () => {
    const { origin, dir } = cloneWithOrigin("omicron");
    git(dir, "remote", "set-url", "origin", "ssh://stub-host/omicron");
    await withStubSsh(`exec git upload-pack '${origin}'`, async ({ log }) => {
      assert.deepEqual(await fetchBranch(dir, "wyrd-foo-v2"), { ok: true });
      assert.deepEqual(readFileSync(log, "utf8").split("\n").filter((line) => line.startsWith("PROMPT=")), ["PROMPT=0"]);
    });
  });

  it("stops git and every process it started when the bound passes, and says so", async () => {
    const { dir } = cloneWithOrigin("pi");
    git(dir, "remote", "set-url", "origin", "ssh://stub-host/pi");
    let pids: number[] = [];
    // The remote never answers: the stub records its own PID and its child's, then waits.
    await withStubSsh(`echo $$ > "$0.pids"\nsleep 20 &\necho $! >> "$0.pids"\nwait`, async ({ dir: stubDir }) => {
      const pidFile = join(stubDir, "ssh.pids");
      try {
        const started = Date.now();
        const reports = await runLocal({ config: repos("pi"), toolsDir: ws.toolsDir, contentDir: ws.contentDir, fetch: true, fetchTimeoutMs: 300 });
        // The stub's child sleeps 20 s: a call that returns before then did not wait for it to finish by itself.
        assert.ok(Date.now() - started < 10_000, "the call returned soon after the bound");
        assert.ok(existsSync(pidFile), "the fetch reached the stub ssh");
        pids = readFileSync(pidFile, "utf8").split("\n").filter(Boolean).map(Number);
        assert.equal(pids.length, 2, "the stub recorded ssh and its child");
        const warnings = messages(reportOf(reports, "pi"), "warning").filter((message) => message.includes("could not fetch"));
        assert.equal(warnings.length, 1);
        assert.match(warnings[0], /could not fetch wyrd-foo-v2 from origin: timed out after 0\.3 s$/);
        for (const pid of pids) assert.ok(!isAlive(pid), `process ${pid} started by the fetch is gone`);
      } finally {
        for (const pid of pids) if (isAlive(pid)) process.kill(pid, "SIGKILL");
      }
    });
  });
});

describe("fetchBranch: stopping a fetch that passed its bound", () => {
  const ws = new Workspace();
  after(() => ws.remove());

  /** A clone whose origin is a stub ssh running `script`; its PIDs are written to `<stub>.pids`. */
  async function withHangingRemote(name: string, script: string, body: (dir: string, stub: string) => Promise<void>) {
    const dir = join(ws.root, name);
    git(ws.root, "init", "-q", "-b", "main", dir);
    git(dir, "remote", "add", "origin", `ssh://stub-host/${name}`);
    const stubDir = mkdtempSync(join(ws.root, "stub-"));
    const stub = join(stubDir, "ssh");
    writeFileSync(stub, `#!/bin/sh\n${script}\n`);
    chmodSync(stub, 0o755);
    const saved = process.env.PATH;
    process.env.PATH = `${stubDir}:${saved}`;
    try {
      await body(dir, stub);
    } finally {
      process.env.PATH = saved;
      for (const pid of pidsOf(stub)) if (isAlive(pid)) process.kill(pid, "SIGKILL");
    }
  }
  const pidsOf = (stub: string) => (existsSync(`${stub}.pids`) ? readFileSync(`${stub}.pids`, "utf8").split("\n").filter(Boolean).map(Number) : []);

  it("uses a 5 s grace from SIGTERM to SIGKILL by default", () => {
    assert.equal(FETCH_KILL_GRACE_MS, 5_000);
  });

  it("sends SIGTERM first, and returns without the grace when the group exits on it", async () => {
    // The stub records the signal it gets, then exits; its child exits on SIGTERM too.
    const script = `echo $$ > "$0.pids"\ntrap 'echo TERM >> "$0.signals"; exit 0' TERM\nsleep 20 &\necho $! >> "$0.pids"\nwait`;
    await withHangingRemote("term", script, async (dir, stub) => {
      const started = Date.now();
      const result = await fetchBranch(dir, "wyrd-foo-v2", { timeoutMs: 300, graceMs: 8_000 });
      const elapsed = Date.now() - started;
      assert.deepEqual(result, { ok: false, message: "timed out after 0.3 s" });
      assert.equal(pidsOf(stub).length, 2, "the fetch reached the stub ssh");
      assert.equal(existsSync(`${stub}.signals`) ? readFileSync(`${stub}.signals`, "utf8") : "", "TERM\n", "the stub got SIGTERM");
      assert.ok(elapsed < 5_000, `returned in ${elapsed} ms, before the 8 s grace`);
      for (const pid of pidsOf(stub)) assert.ok(!isAlive(pid), `process ${pid} started by the fetch is gone`);
    });
  });

  it("sends SIGKILL after the grace to a group that ignores SIGTERM", async () => {
    // The stub and its child ignore SIGTERM (an ignored signal is inherited).
    const script = `trap '' TERM\necho $$ > "$0.pids"\nsleep 20 &\necho $! >> "$0.pids"\nwait`;
    await withHangingRemote("kill", script, async (dir, stub) => {
      const started = Date.now();
      const result = await fetchBranch(dir, "wyrd-foo-v2", { timeoutMs: 300, graceMs: 700 });
      const elapsed = Date.now() - started;
      assert.deepEqual(result, { ok: false, message: "timed out after 0.3 s" });
      assert.equal(pidsOf(stub).length, 2, "the fetch reached the stub ssh");
      // The sleeping child would end by itself after 20 s.
      assert.ok(elapsed >= 1_000 && elapsed < 10_000, `returned in ${elapsed} ms: after the grace, before the stub ends by itself`);
      for (const pid of pidsOf(stub)) assert.ok(!isAlive(pid), `process ${pid} started by the fetch is gone`);
    });
  });

  it("waits for the grace when git exits but a process it started, no longer on its stderr, ignores SIGTERM", async () => {
    // Without git's stderr, the stub no longer holds the pipe that ends the run.
    const script = `exec 2>/dev/null\ntrap '' TERM\necho $$ > "$0.pids"\nsleep 20 &\necho $! >> "$0.pids"\nwait`;
    await withHangingRemote("detached", script, async (dir, stub) => {
      const started = Date.now();
      const result = await fetchBranch(dir, "wyrd-foo-v2", { timeoutMs: 300, graceMs: 700 });
      const elapsed = Date.now() - started;
      assert.deepEqual(result, { ok: false, message: "timed out after 0.3 s" });
      assert.equal(pidsOf(stub).length, 2, "the fetch reached the stub ssh");
      assert.ok(elapsed >= 1_000, `returned in ${elapsed} ms, after the grace`);
      // SIGKILL was sent to the group; no pipe close waits for it to land.
      for (const pid of pidsOf(stub)) assert.ok(await goneWithin(pid, 2_000), `process ${pid} started by the fetch is gone`);
    });
  });
});

/** True once `pid` is gone, polled every 20 ms up to `ms`. */
async function goneWithin(pid: number, ms: number): Promise<boolean> {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((done) => setTimeout(done, 20))) {
    if (!isAlive(pid)) return true;
  }
  return !isAlive(pid);
}

/** True while the process runs; a zombie is gone. Reads /proc, so it does not guess from a name. */
function isAlive(pid: number): boolean {
  try {
    return !/^\d+ \(.*\) Z/.test(readFileSync(`/proc/${pid}/stat`, "utf8"));
  } catch {
    return false;
  }
}

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
