import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { parse } from "yaml";
import { pageSchema, parseWith, toolFileSchema } from "../../src/schema/index.ts";
import { migrate, MigrationError } from "../../scripts/migrate-content-v2.ts";

// The migration script converts v1 `content/<key>/` folders to the v2 ingested
// format. These tests run it on the real `content/` folders and on small
// generic v1 fixtures.

const REPO = new URL("../../", import.meta.url).pathname;
const SCRIPT = join(REPO, "scripts/migrate-content-v2.ts");
const scratch = mkdtempSync(join(tmpdir(), "migrate-content-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

let counter = 0;
const fresh = (name: string) => join(scratch, `${name}-${++counter}`);

const TOOL = {
  name: "widget",
  tagline: "Does a thing.",
  blurb: "A longer account of the thing.",
  category: "Agent Tooling",
  language: "Go",
  status: "stable",
  repo: "https://github.com/example-org/widget",
  order: 1,
  install: [{ label: "Homebrew", command: "brew install example-org/tools/widget" }],
};

/** A v1 folder `<root>/<key>/` with one page; `overview` is the page source. */
function v1(root: string, key: string, tool: Record<string, unknown> = TOOL, overview = "---\ntitle: Overview\norder: 1\n---\n\nBody.\n") {
  mkdirSync(join(root, key, "docs"), { recursive: true });
  writeFileSync(join(root, key, "tool.yaml"), JSON.stringify(tool));
  writeFileSync(join(root, key, "docs", "overview.md"), overview);
}

function failure(run: () => unknown): MigrationError {
  try {
    run();
  } catch (error) {
    assert.ok(error instanceof MigrationError, `a MigrationError, got ${String(error)}`);
    return error;
  }
  assert.fail("expected the migration to fail");
}

const files = (dir: string) =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(dir.length + 1))
    .sort();

describe("migrating the content folders", () => {
  const out = fresh("real");
  const result = migrate(join(REPO, "content"), out);

  it("writes every folder of content/", () => {
    const expected = readdirSync(join(REPO, "content")).sort();
    assert.equal(expected.length, 12);
    assert.deepEqual(result.keys, expected);
    assert.deepEqual(readdirSync(out).sort(), expected);
  });

  it("writes a tool.yaml that the shared schema accepts, owned by the v1 repo", () => {
    for (const key of result.keys) {
      const tool = parse(readFileSync(join(out, key, "tool.yaml"), "utf8"));
      const parsed = parseWith(toolFileSchema, tool, `${key}/tool.yaml`);
      assert.ok(parsed.ok, `${key}: ${JSON.stringify(!parsed.ok && parsed.issues)}`);
      const old = parse(readFileSync(join(REPO, "content", key, "tool.yaml"), "utf8"));
      assert.equal(`https://github.com/${tool.owner}`, old.repo, key);
      assert.equal(tool.order, old.order, key);
      assert.equal(tool.language, undefined, key);
      assert.equal(tool.repo, undefined, key);
    }
  });

  it("names the product on every page and leaves the body as it was", () => {
    for (const key of result.keys) {
      for (const name of readdirSync(join(REPO, "content", key, "docs")).filter((f) => f.endsWith(".md"))) {
        const before = readFileSync(join(REPO, "content", key, "docs", name), "utf8");
        const after = readFileSync(join(out, key, "docs", name), "utf8");
        const front = /^---\n([\s\S]*?)\n---\n/;
        const data = parse(front.exec(after)![1]);
        assert.equal(data.product, key, `${key}/${name}`);
        assert.ok(parseWith(pageSchema, data, `${key}/${name}`).ok, `${key}/${name}`);
        assert.equal(after.replace(front, ""), before.replace(front, ""), `${key}/${name} body`);
      }
    }
  });

  it("copies every asset byte for byte and every media file exists", () => {
    for (const key of result.keys) {
      const source = join(REPO, "content", key, "docs");
      for (const path of files(source).filter((f) => !f.endsWith(".md"))) {
        assert.ok(readFileSync(join(source, path)).equals(readFileSync(join(out, key, "docs", path))), `${key}/${path}`);
      }
      const tool = parse(readFileSync(join(out, key, "tool.yaml"), "utf8"));
      for (const item of tool.media) assert.ok(existsSync(join(out, key, "docs", item.src)), `${key}: ${item.src}`);
    }
  });

  it("lists each field the v1 format could not supply", () => {
    for (const key of result.keys) {
      for (const field of ["kinds", "highlights", "version, docs-version"]) {
        assert.ok(result.fills.some((fill) => fill.startsWith(`${key}: ${field}:`)), `${key}: ${field}`);
      }
    }
    assert.ok(result.fills.includes("toha: category: Developer Tools -> Templates & Scaffolding (closed list)"));
  });

  it("makes the trowel, wyrwood and xolotl apps and the rest CLIs", () => {
    const kinds = Object.fromEntries(
      result.keys.map((key) => [key, parse(readFileSync(join(out, key, "tool.yaml"), "utf8")).kinds[0].kind]),
    );
    for (const key of result.keys) assert.equal(kinds[key], ["trowel", "wyrwood", "xolotl"].includes(key) ? "app" : "cli", key);
  });

  it("picks the first image of the first page as media and fills a placeholder when there is none", () => {
    const media = (key: string) => parse(readFileSync(join(out, key, "tool.yaml"), "utf8")).media;
    assert.deepEqual(media("tagver"), [{ src: "demo.gif", caption: "tagver command-line demo" }]);
    assert.equal(media("beholder")[0].src, "assets/placeholder.svg");
    assert.ok(existsSync(join(out, "beholder/docs/assets/placeholder.svg")));
    assert.ok(!existsSync(join(out, "gitpr/docs/assets/placeholder.svg")));
  });
});

describe("choosing media", () => {
  it("skips an image whose file is not in docs/ and one without alt text", () => {
    const from = fresh("from");
    v1(from, "widget", TOOL, "---\ntitle: Overview\norder: 1\n---\n![](assets/blank.gif)\n![Missing](assets/missing.gif)\n");
    mkdirSync(join(from, "widget/docs/assets"));
    writeFileSync(join(from, "widget/docs/assets/blank.gif"), "gif");
    const to = fresh("to");
    const result = migrate(from, to);
    const tool = parse(readFileSync(join(to, "widget/tool.yaml"), "utf8"));
    assert.equal(tool.media[0].src, "assets/placeholder.svg");
    assert.ok(result.fills.some((fill) => fill.startsWith("widget: media: placeholder")));
  });

  it("takes the image of the page with the lowest order, not the first file name", () => {
    const from = fresh("from");
    v1(from, "widget", TOOL, "---\ntitle: Second\norder: 2\n---\n![Later](assets/b.gif)\n");
    writeFileSync(join(from, "widget/docs/zzz.md"), "---\ntitle: First\norder: 1\n---\n![Earlier](assets/a.gif)\n");
    mkdirSync(join(from, "widget/docs/assets"));
    for (const name of ["a.gif", "b.gif"]) writeFileSync(join(from, "widget/docs/assets", name), "gif");
    const to = fresh("to");
    migrate(from, to);
    assert.deepEqual(parse(readFileSync(join(to, "widget/tool.yaml"), "utf8")).media, [{ src: "assets/a.gif", caption: "Earlier" }]);
  });
});

describe("migrating a folder that cannot be converted", () => {
  it("writes nothing for any folder when one folder fails (all or nothing)", () => {
    const from = fresh("from");
    v1(from, "good");
    v1(from, "bad", { ...TOOL, category: "Not A Category" });
    const to = fresh("to");
    const error = failure(() => migrate(from, to));
    assert.match(error.issues.join("\n"), /bad\/tool\.yaml: category/);
    assert.equal(existsSync(to), false);
  });

  it("refuses an install label it does not know", () => {
    const from = fresh("from");
    v1(from, "widget", { ...TOOL, install: [{ label: "Snap", command: "snap install widget" }] });
    assert.match(failure(() => migrate(from, fresh("to"))).message, /install\[0\]: unknown label Snap/);
  });

  it("refuses a page without front matter", () => {
    const from = fresh("from");
    v1(from, "widget", TOOL, "Body only.\n");
    assert.match(failure(() => migrate(from, fresh("to"))).message, /widget\/docs\/overview\.md: has no front matter/);
  });

  it("refuses a page that already names a product", () => {
    const from = fresh("from");
    v1(from, "widget", TOOL, "---\ntitle: Overview\nproduct: widget\n---\n");
    assert.match(failure(() => migrate(from, fresh("to"))).message, /already names a product/);
  });

  it("refuses front matter the page schema rejects", () => {
    const from = fresh("from");
    v1(from, "widget", TOOL, "---\ntitle: Overview\ndocs: true\n---\n");
    assert.match(failure(() => migrate(from, fresh("to"))).message, /overview\.md: docs: is not an allowed field/);
  });

  it("refuses a folder that is not a v1 tool.yaml, such as migrated output", () => {
    const first = fresh("first");
    migrate(join(REPO, "content"), first);
    assert.match(failure(() => migrate(first, fresh("again"))).message, /is not a v1 tool\.yaml/);
  });

  it("refuses an empty source", () => {
    const from = fresh("empty");
    mkdirSync(from);
    assert.match(failure(() => migrate(from, fresh("to"))).message, /holds no product folders/);
  });
});

describe("migrating in place", () => {
  it("converts a folder when --to is the --from folder", () => {
    const dir = fresh("inplace");
    cpSync(join(REPO, "content"), dir, { recursive: true });
    const result = migrate(dir, dir);
    assert.equal(result.keys.length, 12);
    const tool = parse(readFileSync(join(dir, "gitpr/tool.yaml"), "utf8"));
    assert.ok(parseWith(toolFileSchema, tool, "gitpr/tool.yaml").ok);
    assert.ok(existsSync(join(dir, "gitpr/docs/assets/demo.gif")));
  });
});

describe("the command line", () => {
  const run = (...args: string[]) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd: scratch, encoding: "utf8" });

  it("migrates and exits 0, printing the fills", () => {
    const to = fresh("cli");
    const result = run("--from", join(REPO, "content"), "--to", to);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /migrated 12 products/);
    assert.match(result.stdout, /fill: beholder: media: placeholder/);
    assert.equal(readdirSync(to).length, 12);
  });

  it("exits 1 and names the issue when a folder cannot be converted", () => {
    const from = fresh("from");
    v1(from, "bad", { ...TOOL, install: [{ label: "Snap", command: "x" }] });
    const to = fresh("to");
    const result = run("--from", from, "--to", to);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /unknown label Snap/);
    assert.equal(existsSync(to), false);
  });
});
