import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { crossCheck, isPageFile } from "../../src/schema/index.ts";
import { loadTree } from "./load-tree.ts";

// A docs unit changelog is data, not a page: CHANGELOG.md at the docs/user
// root, or at docs/user/<key>/ for a declared product key.

describe("page files", () => {
  const keys = ["gadget", "gizmo"];

  it("a .md file at any depth is a page", () => {
    assert.ok(isPageFile("getting-started.md", keys));
    assert.ok(isPageFile("guides/deep/authoring.md", keys));
  });

  it("a file that is not .md is not a page", () => {
    assert.ok(!isPageFile("assets/logo.svg", keys));
  });

  it("CHANGELOG.md at the docs/user root is not a page", () => {
    assert.ok(!isPageFile("CHANGELOG.md", keys));
    assert.ok(!isPageFile("CHANGELOG.md", []));
  });

  it("CHANGELOG.md in a product key folder is not a page", () => {
    assert.ok(!isPageFile("gadget/CHANGELOG.md", keys));
  });

  it("CHANGELOG.md in a folder that is not a product key is a page", () => {
    assert.ok(isPageFile("guides/CHANGELOG.md", keys));
    assert.ok(isPageFile("gadget/notes/CHANGELOG.md", keys));
  });

  it("a root changelog with no front matter leaves the tree valid", () => {
    const { tree, issues } = loadTree("cli");
    assert.deepEqual(issues, []);
    assert.ok(tree!.files.has("CHANGELOG.md"), "the fixture holds a root changelog");
    assert.ok(!tree!.pages.some((page) => page.path.endsWith("CHANGELOG.md")));
    assert.deepEqual(crossCheck(tree!), []);
  });

  it("a product folder changelog with no front matter leaves the tree valid", () => {
    const { tree, issues } = loadTree("app");
    assert.deepEqual(issues, []);
    assert.ok(tree!.files.has("gadget/CHANGELOG.md"), "the fixture holds a product changelog");
    assert.ok(!tree!.pages.some((page) => page.path.endsWith("CHANGELOG.md")));
    assert.deepEqual(crossCheck(tree!), []);
  });
});
