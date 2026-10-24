import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { parse } from "yaml";
import { docsFileSchema, formatIssue, parseWith } from "../../src/schema/index.ts";

// The docs.yml examples in the publishing design must pass the schema, so the
// design and the schema state one contract.

const design = readFileSync(new URL("../../PUBLISHING-PROPOSAL.md", import.meta.url), "utf8");
const yamlBlocks = [...design.matchAll(/```yaml\n([\s\S]*?)```/g)].map((match) => parse(match[1]));

function assertValid(input: unknown) {
  const result = parseWith(docsFileSchema, input, "PUBLISHING-PROPOSAL.md");
  assert.ok(result.ok, result.ok ? "" : result.issues.map(formatIssue).join(" | "));
}

describe("publishing design examples", () => {
  it("the full docs.yml example passes the schema", () => {
    const examples = yamlBlocks.filter((block) => block?.schemaVersion !== undefined);
    assert.equal(examples.length, 1);
    assertValid(examples[0]);
  });

  it("the feature entries example passes the schema", () => {
    const examples = yamlBlocks.filter(
      (block) => block?.products !== undefined && block.schemaVersion === undefined,
    );
    assert.equal(examples.length, 1);
    const logos = Object.values(examples[0].products as Record<string, { logo?: string }>).flatMap((entry) =>
      entry.logo ? [entry.logo] : [],
    );
    assertValid({ schemaVersion: 1, assets: logos, products: examples[0].products });
  });
});
