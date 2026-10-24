import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { crossCheck, docsPathOf, formatIssue, productDocsFolder, type ContractIssue, type DocsTree } from "../../src/schema/index.ts";
import { FIXTURES, loadTree, readRawDocs, type Raw } from "./load-tree.ts";

// Each case starts from a valid fixture, breaks one rule, and expects exactly
// one issue that names the file and the field.

function treeFrom(name: string, edit: (raw: Raw) => void = () => {}): DocsTree {
  const raw = readRawDocs(name);
  edit(raw);
  const { tree, issues } = loadTree(name, raw);
  assert.deepEqual(issues, [], "the changed fixture still passes the schema");
  return tree!;
}

function assertOneIssue(issues: ContractIssue[], expected: { file: string; field: string; message: RegExp }) {
  assert.equal(issues.length, 1, `one issue, got: ${issues.map(formatIssue).join(" | ")}`);
  const [issue] = issues;
  assert.equal(issue.file, expected.file);
  assert.equal(issue.field, expected.field);
  assert.match(issue.message, expected.message);
  const text = formatIssue(issue);
  assert.ok(text.includes(expected.file) && text.includes(expected.field), text);
}

const asset = (path: string) => readFileSync(join(FIXTURES, "assets", path));

describe("cross-check: pages", () => {
  it("a page whose product is not in docs.yml fails", () => {
    const tree = treeFrom("cli");
    const page = tree.pages.find((p) => p.path.endsWith("extra.md"))!;
    page.data.product = "unknown-product";
    assertOneIssue(crossCheck(tree), { file: "cli/guides/extra.md", field: "product", message: /unknown-product.*does not list/ });
  });

  it("a page whose product is an inherited object member, not a declared key, fails", () => {
    const tree = treeFrom("cli");
    tree.pages.find((p) => p.path.endsWith("extra.md"))!.data.product = "constructor";
    assertOneIssue(crossCheck(tree), { file: "cli/guides/extra.md", field: "product", message: /constructor.*does not list/ });
  });

  it("a page whose product is a declared constructor key passes", () => {
    const tree = treeFrom("cli", (raw) => {
      raw.products.constructor = structuredClone(raw.products.widget);
      delete raw.products.constructor.nav;
    });
    tree.pages.find((p) => p.path.endsWith("extra.md"))!.data.product = "constructor";
    assert.ok(Object.hasOwn(tree.docs.products, "constructor"));
    assert.deepEqual(crossCheck(tree), []);
  });

  it("a page whose product is a feature entry fails", () => {
    const tree = treeFrom("cli", (raw) => {
      raw.products["sample-feature"] = { kinds: [{ kind: "devcontainer-feature" }], source: "src/features/sample-feature" };
    });
    tree.pages.find((p) => p.path.endsWith("extra.md"))!.data.product = "sample-feature";
    assertOneIssue(crossCheck(tree), { file: "cli/guides/extra.md", field: "product", message: /feature entry sample-feature/ });
  });

  it("two pages with one slug in one product fail", () => {
    const tree = treeFrom("cli");
    const original = tree.pages.find((p) => p.path === "cli/getting-started.md")!;
    (tree.pages as DocsTree["pages"][number][]).push({ path: "cli/guides/getting-started.md", data: { ...original.data } });
    assertOneIssue(crossCheck(tree), {
      file: "cli/guides/getting-started.md",
      field: "slug",
      message: /getting-started is also the slug of cli\/getting-started\.md in product widget/,
    });
  });

  it("one slug in two products passes", () => {
    const tree = treeFrom("app");
    const slugs = tree.pages.map((p) => p.path.split("/").pop());
    assert.deepEqual(slugs, ["getting-started.md", "getting-started.md"]);
    assert.deepEqual(crossCheck(tree), []);
  });
});

describe("cross-check: nav", () => {
  it("a nav page that the product does not have fails", () => {
    const tree = treeFrom("cli", (raw) => raw.products.widget.nav[0].groups[0].pages.push("missing-page"));
    assertOneIssue(crossCheck(tree), {
      file: "cli/docs.yml",
      field: "products.widget.nav[0].groups[0].pages[2]",
      message: /missing-page.*widget does not have/,
    });
  });

  it("a nav page of another product fails", () => {
    const tree = treeFrom("app", (raw) => {
      raw.products.gadget.nav = [{ section: "Docs", groups: [{ group: "All", pages: ["getting-started"] }] }];
    });
    tree.pages.find((p) => p.data.product === "gadget")!.data.product = "gizmo";
    const issues = crossCheck(tree).filter((issue) => issue.field.includes("nav"));
    assertOneIssue(issues, { file: "app/docs.yml", field: "products.gadget.nav[0].groups[0].pages[0]", message: /gadget does not have/ });
  });
});

describe("cross-check: assets listed", () => {
  const cases: { field: string; edit: (raw: Raw) => void }[] = [
    { field: "products.widget.media[0].src", edit: (raw) => (raw.products.widget.media[0].src = "assets/social-small.png") },
    { field: "products.widget.logo", edit: (raw) => (raw.products.widget.logo = "assets/unlisted.svg") },
    { field: "products.widget.logo-dark", edit: (raw) => (raw.products.widget["logo-dark"] = "assets/unlisted.svg") },
    { field: "products.widget.favicon", edit: (raw) => (raw.products.widget.favicon = "assets/unlisted.png") },
    { field: "products.widget.social-image", edit: (raw) => (raw.products.widget["social-image"] = "assets/unlisted.png") },
  ];
  for (const { field, edit } of cases) {
    it(`${field} that assets does not list fails`, () => {
      assertOneIssue(crossCheck(treeFrom("cli", edit)), { file: "cli/docs.yml", field, message: /is not listed in assets/ });
    });
  }

  it("a feature entry logo that assets does not list fails", () => {
    const tree = treeFrom("devcontainer-feature", (raw) => (raw.assets = []));
    assertOneIssue(crossCheck(tree), {
      file: "devcontainer-feature/docs.yml",
      field: "products.other-feature.logo",
      message: /assets\/logo\.svg is not listed in assets/,
    });
  });

  it("a listed asset that does not exist fails", () => {
    const tree = treeFrom("cli", (raw) => raw.assets.push("assets/missing.png"));
    assertOneIssue(crossCheck(tree), { file: "cli/docs.yml", field: "assets[4]", message: /assets\/missing\.png does not exist under docs\/user\// });
  });
});

describe("cross-check: asset types and size", () => {
  const listAll = (raw: Raw) => {
    raw.assets = ["assets/demo.gif", "assets/logo.svg", "assets/favicon.png", "assets/social.png", "assets/social.jpg", "assets/social-small.png"];
  };

  it("a logo that is not SVG fails", () => {
    const tree = treeFrom("cli", (raw) => {
      listAll(raw);
      raw.products.widget.logo = "assets/favicon.png";
    });
    assertOneIssue(crossCheck(tree), { file: "cli/docs.yml", field: "products.widget.logo", message: /must be SVG; its file extension is \.png/ });
  });

  it("a logo-dark named .svg whose content is not SVG fails", () => {
    const tree = treeFrom("cli", (raw) => {
      raw.assets.push("assets/dark.svg");
      raw.products.widget["logo-dark"] = "assets/dark.svg";
    });
    const files = new Map(tree.files);
    files.set("assets/dark.svg", asset("favicon.png"));
    assertOneIssue(crossCheck({ ...tree, files }), {
      file: "cli/docs.yml",
      field: "products.widget.logo-dark",
      message: /must be SVG; its content is not SVG/,
    });
  });

  it("a favicon that is not SVG or PNG fails, and an SVG favicon passes", () => {
    const jpeg = treeFrom("cli", (raw) => {
      listAll(raw);
      raw.products.widget.favicon = "assets/social.jpg";
    });
    assertOneIssue(crossCheck(jpeg), { file: "cli/docs.yml", field: "products.widget.favicon", message: /must be SVG or PNG/ });
    const svg = treeFrom("cli", (raw) => (raw.products.widget.favicon = "assets/logo.svg"));
    assert.deepEqual(crossCheck(svg), []);
  });

  it("a social image that is not 1200x630 fails", () => {
    const tree = treeFrom("cli", (raw) => {
      listAll(raw);
      raw.products.widget["social-image"] = "assets/social-small.png";
    });
    assertOneIssue(crossCheck(tree), {
      file: "cli/docs.yml",
      field: "products.widget.social-image",
      message: /must be 1200x630; it is 1200x600/,
    });
  });

  it("a social image that is not PNG or JPEG fails", () => {
    const tree = treeFrom("cli", (raw) => (raw.products.widget["social-image"] = "assets/demo.gif"));
    assertOneIssue(crossCheck(tree), {
      file: "cli/docs.yml",
      field: "products.widget.social-image",
      message: /must be PNG or JPEG; its file extension is \.gif/,
    });
  });

  it("a .jpg social image whose content is PNG fails", () => {
    const tree = treeFrom("app");
    const files = new Map(tree.files);
    files.set("gadget/assets/social.jpg", asset("social.png"));
    assertOneIssue(crossCheck({ ...tree, files }), {
      file: "app/docs.yml",
      field: "products.gadget.social-image",
      message: /its content is not JPEG/,
    });
  });
});

describe("cross-check: a product's docs folder", () => {
  it("is docs/user/<key>/ when that folder holds a file, else docs/user/", () => {
    assert.equal(productDocsFolder("gadget", ["gadget/getting-started.md", "assets/x.svg"]), "gadget/");
    assert.equal(productDocsFolder("gadget", ["getting-started.md", "gadget-notes/x.md"]), "");
    assert.equal(productDocsFolder("gadget", []), "");
  });

  it("is written to tool.yaml as the repo path docs/user or docs/user/<key>", () => {
    assert.equal(docsPathOf(""), "docs/user");
    assert.equal(docsPathOf("gadget/"), "docs/user/gadget");
  });

  it("resolves a per-key product's asset fields under its folder", () => {
    const tree = treeFrom("app");
    assert.equal((tree.docs.products.gadget as { media: { src: string }[] }).media[0].src, "assets/demo.gif");
    assert.ok(tree.docs.assets.includes("gadget/assets/demo.gif"));
    assert.deepEqual(crossCheck(tree), []);
  });

  it("fails a per-key product whose asset field repeats the folder name", () => {
    const tree = treeFrom("app", (raw) => {
      raw.products.gizmo.media[0].src = "gizmo/assets/demo.gif";
    });
    assertOneIssue(crossCheck(tree), {
      file: "app/docs.yml",
      field: "products.gizmo.media[0].src",
      message: /gizmo\/assets\/demo\.gif is docs\/user\/gizmo\/gizmo\/assets\/demo\.gif, which is not listed in assets/,
    });
  });
});
