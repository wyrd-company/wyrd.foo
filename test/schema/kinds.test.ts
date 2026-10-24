import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { crossCheck, isFeatureEntry, releaseUnitOf, type ProductEntry } from "../../src/schema/index.ts";
import { KIND_FIXTURES, loadTree } from "./load-tree.ts";

describe("a valid fixture per kind", () => {
  for (const name of KIND_FIXTURES) {
    it(`${name} passes the schema and every cross-check`, () => {
      const { tree, issues } = loadTree(name);
      assert.deepEqual(issues, []);
      assert.ok(tree);
      assert.deepEqual(crossCheck(tree), []);
      const kinds = Object.values(tree.docs.products).flatMap((entry) => entry.kinds.map((block) => block.kind));
      assert.ok(kinds.includes(name), `${name} fixture has a ${name} kind`);
    });
  }
});

describe("entry defaults", () => {
  it("a feature entry without category is in Dev Containers, and its unit is its key", () => {
    const { tree } = loadTree("devcontainer-feature");
    const entry = tree!.docs.products["sample-feature"];
    assert.ok(isFeatureEntry(entry));
    assert.equal(entry.category, "Dev Containers");
    assert.equal(releaseUnitOf("sample-feature", entry), "sample-feature");
    assert.equal(releaseUnitOf("other-feature", tree!.docs.products["other-feature"]), "other-feature-unit");
  });

  it("a product's release unit is release-unit, else its key", () => {
    const { tree } = loadTree("app");
    const gadget = tree!.docs.products.gadget as ProductEntry;
    assert.equal(isFeatureEntry(gadget), false);
    assert.equal(releaseUnitOf("gadget", gadget), "gadget-service");
    assert.equal(releaseUnitOf("gizmo", tree!.docs.products.gizmo), "gizmo");
  });

  it("a page without install has install false", () => {
    const { tree } = loadTree("cli");
    const extra = tree!.pages.find((page) => page.path.endsWith("extra.md"));
    assert.equal(extra?.data.install, false);
  });
});
