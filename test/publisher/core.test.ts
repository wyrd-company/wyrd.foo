import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeRepo,
  gitHubReleases,
  linksOutside,
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
    const result = await computeRepo(input(alphaFiles(), { releases, strict: true }));
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
