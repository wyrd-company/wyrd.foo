import { describe, expect, it } from "vitest";
import { indexedKinds, KIND_LABELS } from "../src/lib/kinds";
import { KINDS } from "../src/schema/index.ts";

describe("search kinds", () => {
  it("lists the kinds a search index holds, in vocabulary order", () => {
    expect(indexedKinds({ app: 2, cli: 1, other: 4, "mcp-server": 0 })).toEqual(["cli", "app"]);
    expect(indexedKinds(undefined)).toEqual([]);
  });

  it("names every kind", () => {
    expect(Object.keys(KIND_LABELS).sort()).toEqual([...KINDS].sort());
  });
});
