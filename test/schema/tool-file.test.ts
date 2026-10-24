import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatIssue, parseWith, toolFileSchema, type ContractIssue } from "../../src/schema/index.ts";
import { readRawDocs, type Raw } from "./load-tree.ts";

// content/<key>/tool.yaml: a docs.yml entry with its defaults resolved, plus
// the fields only the publisher writes.

const ingestedProduct = (): Raw => ({
  ...readRawDocs("cli").products.widget,
  "release-unit": "widget",
  owner: "example-org/widget",
  release: { version: "1.4.0", date: "2026-01-02", url: "https://example.com/releases/1.4.0", notes: "Notes." },
  featured: { from: "2026-01-02", until: "2026-01-16", reason: "New release", version: "1.4.0" },
});

const ingestedFeature = (): Raw => ({
  kinds: [{ kind: "devcontainer-feature", ref: "ghcr.io/example-org/features/sample-feature:1" }],
  source: "src/features/sample-feature",
  category: "Dev Containers",
  "release-unit": "sample-feature",
  owner: "example-org/features",
  name: "Sample feature",
  description: "Installs a sample tool.",
  version: "1.0.1",
  release: { version: "1.0.1", date: "2026-01-02", notes: "From the annotated tag." },
});

function issues(input: Raw): ContractIssue[] {
  const result = parseWith(toolFileSchema, input, "tool.yaml");
  return result.ok ? [] : result.issues;
}

function assertIssue(found: ContractIssue[], field: string, message: RegExp) {
  const text = found.map(formatIssue).join(" | ");
  assert.equal(found.length, 1, `one issue, got: ${text}`);
  assert.equal(found[0].field, field, text);
  assert.match(found[0].message, message, text);
}

describe("tool.yaml schema", () => {
  it("accepts an ingested product and reads its dates", () => {
    const result = parseWith(toolFileSchema, ingestedProduct(), "tool.yaml");
    assert.ok(result.ok, result.ok ? "" : result.issues.map(formatIssue).join(" | "));
    assert.ok("featured" in result.data && result.data.featured?.from instanceof Date);
  });

  it("accepts an ingested feature entry", () => {
    assert.deepEqual(issues(ingestedFeature()), []);
  });

  it("requires owner and the resolved release unit", () => {
    const noOwner = ingestedProduct();
    delete noOwner.owner;
    assertIssue(issues(noOwner), "owner", /expected string/);
    const noUnit = ingestedProduct();
    delete noUnit["release-unit"];
    assertIssue(issues(noUnit), "release-unit", /expected string/);
  });

  it("names the owner owner, not source, on a product", () => {
    const product = ingestedProduct();
    product.source = product.owner;
    assertIssue(issues(product), "source", /not an allowed field/);
  });

  it("requires a feature entry's resolved ref, and never features it", () => {
    const noRef = ingestedFeature();
    delete noRef.kinds[0].ref;
    assertIssue(issues(noRef), "kinds[0].ref", /expected string/);
    const featured = ingestedFeature();
    featured.featured = ingestedProduct().featured;
    assertIssue(issues(featured), "featured", /not an allowed field/);
  });

  it("requires featured.from before featured.until", () => {
    const product = ingestedProduct();
    product.featured.until = product.featured.from;
    assertIssue(issues(product), "featured.until", /before until/);
  });
});
