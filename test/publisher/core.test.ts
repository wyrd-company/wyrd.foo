import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  applyRepo,
  computeRepo,
  featureRef,
  gitHubReleases,
  IntentionalConfigError,
  linksOutside,
  ownerRepoOf,
  parseIntentionalConfig,
  tagName,
  readmeOptionNames,
  ReleaseLookupError,
  squareProblem,
  type RepoFiles,
  type RepoInput,
  type RepoTags,
} from "../../publisher/index.ts";
import { fakeReleases, OWNER, WIDE_SVG, type Files } from "./fixture-repo.ts";
import { ALPHA_CLI_RELEASE, alphaFiles, betaFiles } from "./fixtures.ts";

// The core over in-memory files: the checks and failure behaviour that do not
// need a git clone.

function memoryFiles(files: Files): RepoFiles {
  const encoded = new Map(Object.entries(files).map(([path, content]) => [path, typeof content === "string" ? new TextEncoder().encode(content) : content]));
  return {
    async list(prefix) {
      return [...encoded.keys()].filter((path) => path.startsWith(prefix)).sort();
    },
    async read(path) {
      return encoded.get(path);
    },
  };
}

const TAGS: RepoTags = {
  async read(name) {
    return { name, annotated: true, date: new Date("2026-01-01T00:00:00Z"), message: "release record" };
  },
};

const input = (files: Files, extra: Partial<RepoInput> = {}): RepoInput => ({
  ownerRepo: `${OWNER}/alpha`,
  files: memoryFiles(files),
  tags: TAGS,
  strict: false,
  ...extra,
});

const errors = (findings: { severity: string; message: string }[]) => findings.filter((f) => f.severity === "error").map((f) => f.message);

describe("publisher core: release data", () => {
  it("in local mode, an unreachable GitHub falls back to the local tag with a warning naming the reason", async () => {
    const result = await computeRepo(input(alphaFiles(), { releases: fakeReleases({ [`${OWNER}/alpha@alpha-cli@1.2.0`]: "unreachable" }) }));
    assert.equal(result.failed, false);
    const cli = result.products.find((product) => product.key === "alpha-cli")!;
    assert.deepEqual(cli.tool.release, { version: "1.2.0", date: "2026-01-01T00:00:00.000Z", notes: "### Features\n\n- Add the sample command." });
    const warning = result.findings.find((finding) => finding.key === "alpha-cli" && finding.requirement === "GitHub Release")!;
    assert.equal(warning.severity, "warning");
    assert.match(warning.message, /unreachable/);
  });

  it("in publish mode, a tag with no GitHub Release fails the repo and writes nothing", async () => {
    const releases = fakeReleases({ [`${OWNER}/alpha@alpha-cli@1.2.0`]: ALPHA_CLI_RELEASE });
    const result = await computeRepo(input(alphaFiles(), { releases, strict: true, tags: { read: async () => undefined } }));
    assert.equal(result.failed, true);
    assert.deepEqual(result.products, []);
    assert.deepEqual(errors(result.findings), ["GitHub Release for tag alpha-app@0.3.0: not-found: from the fixture"]);
  });

  it("in local mode, a missing tag is a warning and the product has no release", async () => {
    const result = await computeRepo(input(alphaFiles(), { tags: { read: async () => undefined } }));
    assert.equal(result.failed, false);
    assert.equal(result.products.find((product) => product.key === "alpha-cli")!.tool.release, undefined);
    assert.ok(result.findings.some((finding) => finding.requirement === "release tag" && /alpha-cli@1\.2\.0/.test(finding.message)));
  });

  it("an I/O failure of the tags is thrown, not reported as a finding", async () => {
    const tags: RepoTags = { read: async () => Promise.reject(new Error("object store is unreadable")) };
    await assert.rejects(computeRepo(input(alphaFiles(), { tags })), /object store is unreadable/);
  });
});

describe("publisher core: checks", () => {
  it("a logo that is not square fails the repo", async () => {
    const files = { ...alphaFiles(), "docs/user/assets/logo.svg": WIDE_SVG };
    const result = await computeRepo(input(files));
    assert.equal(result.failed, true);
    assert.deepEqual(result.products, [], "no product of a failed repo is returned");
    assert.deepEqual(errors(result.findings), ["products.alpha-cli.logo: assets/logo.svg is not square: its viewBox is 64x32"]);
  });

  it("a feature entry whose source folder has no devcontainer-feature.json fails the repo", async () => {
    const files = betaFiles();
    delete files["src/features/sample-feature/devcontainer-feature.json"];
    const result = await computeRepo(input(files, { ownerRepo: `${OWNER}/beta` }));
    assert.equal(result.failed, true);
    assert.deepEqual(errors(result.findings), ["does not exist; feature entry sample-feature names source src/features/sample-feature"]);
    assert.equal(result.findings.find((finding) => finding.severity === "error")!.file, "src/features/sample-feature/devcontainer-feature.json");
  });

  it("a product with no docs unit is an unmet requirement", async () => {
    const files = alphaFiles();
    files[".intentional/config.yml"] = files[".intentional/config.yml"].toString().replace(/ {2}alpha-cli-docs:[\s\S]*?(?= {2}alpha-app:)/, "");
    assert.doesNotMatch(files[".intentional/config.yml"].toString(), /alpha-cli-docs/);
    const local = await computeRepo(input(files));
    assert.ok(local.findings.some((finding) => finding.severity === "warning" && finding.requirement === "docs unit" && finding.key === "alpha-cli"));
  });

  it("a page without front matter fails the repo; the docs changelog needs none", async () => {
    const files = { ...alphaFiles(), "docs/user/alpha-cli/notes.md": "# No front matter\n" };
    const result = await computeRepo(input(files));
    assert.deepEqual(errors(result.findings), ["has no front matter"]);
  });

  it("an intentional config that is not contract-1 fails the repo", async () => {
    const files = { ...alphaFiles(), ".intentional/config.yml": "contract: contract-0\nrelease-units: {}\n" };
    const result = await computeRepo(input(files));
    assert.equal(result.failed, true);
    assert.match(errors(result.findings).join("\n"), /contract/);
  });
});

describe("publisher core: requirements and generated data", () => {
  const warnings = (findings: { severity: string; requirement?: string; message: string }[]) =>
    findings.filter((f) => f.severity === "warning").map((f) => `${f.requirement ?? "-"}: ${f.message}`);

  it("a release unit that the config does not name is an unmet requirement", async () => {
    const files = alphaFiles();
    files["docs/user/docs.yml"] = files["docs/user/docs.yml"].toString().replace("name: alpha-app\n", "name: alpha-app\n    release-unit: other-unit\n");
    const result = await computeRepo(input(files));
    assert.deepEqual(warnings(result.findings), ["release unit: has no release unit other-unit"]);
    assert.equal(result.products.find((product) => product.key === "alpha-app")!.tool.release, undefined);
  });

  it("a unit with no changelog is an unmet requirement, and the release has no notes", async () => {
    const files = alphaFiles();
    delete files["app/CHANGELOG.md"];
    const result = await computeRepo(input(files));
    assert.deepEqual(warnings(result.findings), ["changelog: does not exist; release unit alpha-app has no changelog"]);
    const app = result.products.find((product) => product.key === "alpha-app")!;
    assert.deepEqual(app.tool.release, { version: "0.3.0", date: "2026-01-01T00:00:00.000Z" });
    assert.ok(!app.files.has("CHANGELOG.md"));
  });

  it("a lightweight tag gives its commit date, with a warning", async () => {
    const tags: RepoTags = { read: async (name) => ({ name, annotated: false, date: new Date("2026-04-01T00:00:00Z"), message: "" }) };
    const result = await computeRepo(input(betaFiles(), { ownerRepo: `${OWNER}/beta`, tags }));
    assert.deepEqual(warnings(result.findings).filter((w) => w.includes("annotated")), [
      "-: tag sample-feature@1.4.2 is not annotated; the release date is its commit date",
      "-: tag sample-image@2.0.0 is not annotated; the release date is its commit date",
    ]);
    assert.equal((result.products.find((product) => product.key === "sample-feature")!.tool.release as { date: string }).date, "2026-04-01T00:00:00.000Z");
  });

  it("warns when manifest.json names another version, and keeps tags written in the kind block", async () => {
    const files = betaFiles();
    files["src/images/sample-image/manifest.json"] = JSON.stringify({ version: "1.9.0", variants: ["first"] });
    files["docs/user/docs.yml"] = files["docs/user/docs.yml"].toString().replace("ref: ghcr.io/sample-org/beta/sample-image\n", "ref: ghcr.io/sample-org/beta/sample-image\n        tags: [{ tag: written }]\n");
    const result = await computeRepo(input(files, { ownerRepo: `${OWNER}/beta` }));
    assert.ok(warnings(result.findings).includes("-: has version 1.9.0; docs.yml has 2.0.0"));
    const image = result.products.find((product) => product.key === "sample-image")!;
    assert.deepEqual((image.tool.kinds as { tags?: unknown }[])[0].tags, [{ tag: "written" }]);
  });

  it("an image whose unit has no manifest.json projection is an unmet requirement", async () => {
    const files = betaFiles();
    files[".intentional/config.yml"] = files[".intentional/config.yml"].toString().replace("adapter: json", "adapter: toml");
    files["src/images/sample-image/manifest.json"] = "{}";
    const result = await computeRepo(input(files, { ownerRepo: `${OWNER}/beta` }));
    assert.deepEqual(warnings(result.findings).filter((w) => w.startsWith("generated data")), [
      "generated data: no manifest.json found through a json projection of release unit sample-image",
    ]);
  });

  it("a feature whose devcontainer-feature.json gives a name the site cannot show fails the repo", async () => {
    const files = betaFiles();
    const json = JSON.parse(files["src/features/sample-feature/devcontainer-feature.json"].toString());
    files["src/features/sample-feature/devcontainer-feature.json"] = JSON.stringify({ ...json, name: "Two\nlines" });
    const result = await computeRepo(input(files, { ownerRepo: `${OWNER}/beta` }));
    assert.equal(result.failed, true);
    assert.match(errors(result.findings).join("\n"), /content\/sample-feature\/tool\.yaml: name: must be one line/);
  });
});

describe("content writes", () => {
  it("applyRepo writes nothing for a failed result, even one that holds products", () => {
    const root = mkdtempSync(join(tmpdir(), "publisher-content-"));
    try {
      const product = { key: "sample", feature: false, tool: { owner: `${OWNER}/alpha` }, files: new Map<string, Uint8Array>() };
      const applied = applyRepo(root, { ownerRepo: `${OWNER}/alpha`, products: [product], findings: [], failed: true });
      assert.deepEqual([applied.failed, applied.written], [true, []]);
      assert.deepEqual(readdirSync(root), []);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("intentional config", () => {
  const config = (tags: string) => `contract: contract-1\nrelease-units:\n  a:\n    path: ./pkg/\n    projections: [{ adapter: json, file: ./x.json, pointer: /version }]\n    tags:\n${tags}`;

  it("reads each unit's path, primary tag template and projection files", () => {
    const units = parseIntentionalConfig(config("      primary: { role: primary, template: '{id}@{version}' }\n"));
    assert.deepEqual(units.get("a"), { id: "a", path: "pkg", primaryTag: "{id}@{version}", projections: [{ adapter: "json", file: "pkg/x.json", pointer: "/version" }] });
    assert.equal(tagName("{id}@{version}", "a", "1.0.0"), "a@1.0.0");
    assert.equal(tagName("{version}", "a", "1.0.0"), "1.0.0");
  });

  it("refuses a unit without exactly one primary tag", () => {
    assert.throws(() => parseIntentionalConfig(config("      p: { role: projection, template: 'x@{version}' }\n")), IntentionalConfigError);
    assert.throws(
      () => parseIntentionalConfig(config("      a: { role: primary, template: '{version}' }\n      b: { role: primary, template: 'b@{version}' }\n")),
      /has 2 primary tags/,
    );
  });
});

describe("owner and feature references", () => {
  it("reads owner/repo from GitHub remote URLs", () => {
    assert.equal(ownerRepoOf("git@github.com:sample-org/sample.git"), "sample-org/sample");
    assert.equal(ownerRepoOf("https://github.com/sample-org/sample.git"), "sample-org/sample");
    assert.equal(ownerRepoOf("https://github.com/sample-org/sample"), "sample-org/sample");
    assert.equal(ownerRepoOf("ssh://git@github.com/sample-org/sample.git"), "sample-org/sample");
    assert.equal(ownerRepoOf("https://example.com/sample-org/sample.git"), undefined);
  });

  it("derives the feature reference with a lower-case owner and repo and the major version", () => {
    const feature = { id: "sample", version: "3.2.1", name: "S", description: "D", options: {} };
    assert.equal(featureRef("Sample-Org/Sample", feature), "ghcr.io/sample-org/sample/sample:3");
  });
});

describe("logo squareness", () => {
  const svg = (attributes: string) => new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg" ${attributes}></svg>`);
  it("reads the viewBox, else width and height", () => {
    assert.equal(squareProblem(svg('viewBox="0 0 24 24"')), undefined);
    assert.equal(squareProblem(svg('viewBox="0,0,24,24" width="48" height="10"')), undefined);
    assert.match(squareProblem(svg('viewBox="0 0 24 12"'))!, /24x12/);
    assert.equal(squareProblem(svg('width="16px" height="16"')), undefined);
    assert.match(squareProblem(svg('width="16" height="8"'))!, /16x8/);
    assert.match(squareProblem(svg('width="100%" height="100%"'))!, /no viewBox/);
  });
});

describe("README option names", () => {
  it("reads the first column of the Options table, without backticks", () => {
    const readme = "# X\n\n## Options\n\n| Options Id | Description |\n|-----|-----|\n| `alpha` | A. |\n| beta | B. |\n\nAfter.\n\n## Other\n\n| x | y |\n";
    assert.deepEqual(readmeOptionNames(readme), ["alpha", "beta"]);
    assert.deepEqual(readmeOptionNames("# X\n\nNo options.\n"), []);
  });
});

describe("GitHub Releases", () => {
  const respond = (status: number, body: unknown) => async () =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  const release = { tag_name: "1.0.0", published_at: "2026-01-02T00:00:00Z", html_url: "https://example.com/r", body: "Notes." };
  const lookup = (fetch: () => Promise<Response>) => gitHubReleases({ fetch: fetch as typeof globalThis.fetch }).release(`${OWNER}/alpha`, "1.0.0");
  const reason = async (fetch: () => Promise<Response>) => {
    try {
      await lookup(fetch);
      return "resolved";
    } catch (error) {
      assert.ok(error instanceof ReleaseLookupError);
      return error.reason;
    }
  };

  it("reads date, URL and notes from the Release of the tag", async () => {
    assert.deepEqual(await lookup(respond(200, release)), { date: new Date("2026-01-02T00:00:00Z"), url: "https://example.com/r", notes: "Notes." });
  });

  it("sends the token, and asks for the tag's Release", async () => {
    let seen: { url: string; auth?: string } | undefined;
    const fetch = async (url: string, init: RequestInit) => {
      seen = { url, auth: (init.headers as Record<string, string>).Authorization };
      return new Response(JSON.stringify({ ...release, tag_name: "a@1.0.0" }), { status: 200 });
    };
    await gitHubReleases({ token: "sample-token", fetch: fetch as typeof globalThis.fetch }).release(`${OWNER}/alpha`, "a@1.0.0");
    assert.deepEqual(seen, { url: `https://api.github.com/repos/${OWNER}/alpha/releases/tags/a%401.0.0`, auth: "Bearer sample-token" });
  });

  it("maps each failure to its reason", async () => {
    assert.equal(await reason(respond(404, {})), "not-found");
    assert.equal(await reason(respond(200, { ...release, draft: true })), "not-found");
    assert.equal(await reason(respond(403, {})), "denied");
    assert.equal(await reason(respond(429, {})), "denied");
    assert.equal(await reason(respond(502, {})), "unreachable");
    assert.equal(await reason(async () => Promise.reject(new TypeError("fetch failed"))), "unreachable");
    assert.equal(await reason(respond(200, "not json")), "malformed");
    assert.equal(await reason(respond(200, { ...release, tag_name: "2.0.0" })), "malformed");
    assert.equal(await reason(respond(200, { ...release, published_at: "never" })), "malformed");
  });
});

describe("links outside docs/user/", () => {
  const root = "docs/user/";

  it("names each relative link that leaves docs/user/, with its line", () => {
    const page = [
      "---",
      "title: T",
      "---",
      "See [the design](../design/plan.md) and ![a shot](../../assets/shot.png).",
      '<img src="../../README.md" alt="x">',
      "[ref]: ../private/notes.md",
    ].join("\n");
    assert.deepEqual(linksOutside("docs/user/guide.md", page, root), [
      { line: 4, target: "../design/plan.md", resolved: "docs/design/plan.md" },
      { line: 4, target: "../../assets/shot.png", resolved: "assets/shot.png" },
      { line: 5, target: "../../README.md", resolved: "README.md" },
      { line: 6, target: "../private/notes.md", resolved: "docs/private/notes.md" },
    ]);
  });

  it("ignores links inside docs/user/, URLs, root paths, anchors and code", () => {
    const page = [
      "[a](guides/b.md#part) [c](../user/d.md) [e](https://example.com/x) [f](/tools/x) [g](#here)",
      "`[h](../../code.md)`",
      "```md",
      "[i](../../fenced.md)",
      "```",
    ].join("\n");
    assert.deepEqual(linksOutside("docs/user/guide.md", page, root), []);
    assert.deepEqual(linksOutside("docs/user/deep/page.md", "[up](../assets/a.svg)", root), []);
  });

  it("is a warning in the repo's findings, and the repo still publishes", async () => {
    const files = { ...alphaFiles() };
    files["docs/user/alpha-cli/guides/deep.md"] = files["docs/user/alpha-cli/guides/deep.md"].toString() + "\nSee [the source](../../../../cli/main.go).\n";
    const result = await computeRepo(input(files));
    assert.equal(result.failed, false);
    const warnings = result.findings.filter((finding) => finding.file === "docs/user/alpha-cli/guides/deep.md");
    assert.deepEqual(
      warnings.map((finding) => [finding.severity, finding.message]),
      [["warning", "line 8: link ../../../../cli/main.go resolves to cli/main.go, outside docs/user/; that file is not published"]],
    );
  });
});
