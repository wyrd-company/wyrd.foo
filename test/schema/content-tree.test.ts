import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";
import { parse } from "yaml";
import { DOCS_CHANGELOG, formatIssue, pageSchema, parseWith, toolFileSchema } from "../../src/schema/index.ts";
import { frontMatter } from "./load-tree.ts";

// content/ is the site's content root: every product folder holds the
// ingested layout the publisher writes, read straight from the checkout.

const CONTENT = new URL("../../content/", import.meta.url).pathname;
const KEYS = [
  "agent-svgtools",
  "beholder",
  "dcb",
  "gitpr",
  "intentional",
  "seek",
  "t3c",
  "tagver",
  "toha",
  "trowel",
  "wyrwood",
  "xolotl",
];

const keys = readdirSync(CONTENT, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

function pagesOf(key: string): string[] {
  const docs = join(CONTENT, key, "docs");
  return readdirSync(docs, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => relative(docs, join(entry.parentPath, entry.name)))
    .filter((path) => path !== DOCS_CHANGELOG)
    .sort();
}

describe("content/", () => {
  it("holds a folder for each product", () => {
    assert.deepEqual(keys, KEYS);
  });

  for (const key of KEYS) {
    it(`${key}: tool.yaml parses with the tool file schema`, () => {
      const file = `${key}/tool.yaml`;
      const result = parseWith(toolFileSchema, parse(readFileSync(join(CONTENT, file), "utf8")), file);
      assert.ok(result.ok, result.ok ? "" : result.issues.map(formatIssue).join("\n"));
    });

    it(`${key}: every page parses with the page schema and names its product`, () => {
      const pages = pagesOf(key);
      assert.ok(pages.length > 0, "at least one page");
      for (const page of pages) {
        const file = `${key}/docs/${page}`;
        const result = parseWith(pageSchema, frontMatter(readFileSync(join(CONTENT, file), "utf8")), file);
        assert.ok(result.ok, result.ok ? "" : result.issues.map(formatIssue).join("\n"));
        assert.equal(result.data.product, key, file);
      }
    });
  }
});
