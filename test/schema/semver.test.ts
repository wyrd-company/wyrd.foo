import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import semverLib from "semver";
import { docsJsonSchema, docsFileSchema, formatIssue, parseWith, toolFileSchema } from "../../src/schema/index.ts";
import { readRawDocs } from "./load-tree.ts";

// Every version field (version, docs-version, release.version,
// featured.version) uses one SemVer 2.0.0 grammar.

const VALID = [
  "0.0.0",
  "1.2.3",
  "10.20.30",
  "1.2.3-0",
  "1.2.3-alpha",
  "1.2.3-alpha.1",
  "1.2.3-0a",
  "1.2.3-alpha-beta",
  "1.2.3-x.7.z.92",
  "1.2.3--",
  "1.2.3+build",
  "1.2.3+build.01",
  "1.2.3+001",
  "1.2.3-rc.1+build.5",
];

const INVALID = [
  "1.2",
  "1.2.3.4",
  "01.2.3",
  "1.02.3",
  "1.2.03",
  "v1.2.3",
  "1.2.3-",
  "1.2.3+",
  "1.2.3-01",
  "1.2.3-alpha.01",
  "1.2.3-alpha..1",
  "1.2.3-.alpha",
  "1.2.3-alpha.",
  "1.2.3+build..meta",
  "1.2.3+.build",
  "1.2.3-al_pha",
  "1.2.3+bu ild",
  " 1.2.3",
];

const accepts = (version: string) => {
  const raw = readRawDocs("cli");
  raw.products.widget.version = version;
  return parseWith(docsFileSchema, raw, "docs.yml").ok;
};

describe("SemVer versions", () => {
  it("accepts valid SemVer 2.0.0 versions with prerelease and build parts", () => {
    for (const version of VALID) assert.ok(accepts(version), version);
  });

  it("rejects malformed versions, including leading zeros and empty identifiers", () => {
    for (const version of INVALID) assert.equal(accepts(version), false, version);
  });

  it("agrees with the semver package in strict mode", () => {
    // semver also takes a leading v or = and surrounding spaces; the contract does not.
    for (const version of [...VALID, ...INVALID]) {
      const library = semverLib.valid(version, { loose: false }) !== null && version === version.trim() && !/^[v=]/.test(version);
      assert.equal(accepts(version), library, version);
    }
  });

  it("checks docs-version, release.version and featured.version with the same grammar", () => {
    const raw = readRawDocs("cli");
    raw.products.widget["docs-version"] = "1.2.3-01";
    const docs = parseWith(docsFileSchema, raw, "docs.yml");
    assert.ok(!docs.ok && docs.issues.some((issue) => issue.field === "products.widget.docs-version"));

    const tool = {
      ...readRawDocs("cli").products.widget,
      "release-unit": "widget",
      owner: "example-org/widget",
      release: { version: "1.2.3-alpha..1", date: "2026-01-02" },
      featured: { from: "2026-01-02", until: "2026-01-16", reason: "New release", version: "1.2.3+build..meta" },
    };
    const result = parseWith(toolFileSchema, tool, "tool.yaml");
    assert.ok(!result.ok);
    assert.deepEqual(
      result.issues.map((issue) => issue.field),
      ["release.version", "featured.version"],
      result.issues.map(formatIssue).join(" | "),
    );
  });

  it("the published JSON Schema rejects the same malformed versions", () => {
    const validate = new Ajv2020({ strict: false }).compile(docsJsonSchema());
    for (const version of INVALID) {
      const raw = readRawDocs("cli");
      raw.products.widget.version = version;
      assert.equal(validate(raw), false, version);
    }
    for (const version of VALID) {
      const raw = readRawDocs("cli");
      raw.products.widget.version = version;
      assert.ok(validate(raw), version);
    }
  });
});
