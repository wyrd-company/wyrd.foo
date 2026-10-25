/*
 * The /llms.txt text (lib/llms-txt.ts) over catalog rows and docs given in the test.
 */
import { describe, expect, it } from "vitest";
import type { CatalogRow } from "../src/lib/home";
import { llmsTxt } from "../src/lib/llms-txt";

const row = (key: string, name: string, tagline: string): CatalogRow => ({
  key,
  name,
  tagline,
  category: "Sample",
  status: "stable",
  kinds: ["cli"],
  primaryKind: "cli",
  getIt: "",
  hasDocs: false,
  isFeature: false,
});

describe("llmsTxt", () => {
  it("builds absolute URLs from the site, not a fixed host", () => {
    const text = llmsTxt("https://example.test", [row("one", "One", "First.")], [
      { key: "one", name: "One", pages: [{ slug: "intro", title: "Intro" }] },
    ]);
    expect(text).toContain("- [One](https://example.test/tools/one): First.");
    expect(text).toContain("- [Intro](https://example.test/docs/one/intro.md)");
    expect(text).not.toContain("wyrd.foo");
  });

  it("puts docs sections in catalog order and skips products without pages", () => {
    const text = llmsTxt(
      "https://example.test",
      [row("b", "B", "x"), row("a", "A", "y"), row("c", "C", "z")],
      [
        { key: "a", name: "A", pages: [{ slug: "p", title: "P" }] },
        { key: "b", name: "B", pages: [{ slug: "q", title: "Q" }] },
        { key: "c", name: "C", pages: [] },
      ],
    );
    expect(text.split("\n").filter((l) => l.startsWith("## "))).toEqual(["## Tools", "## B docs", "## A docs"]);
  });

  it("keeps each entry on one line and escapes brackets in link text", () => {
    const text = llmsTxt("https://example.test", [row("k", "K [beta]", "Two\nlines.")], []);
    expect(text).toContain("- [K \\[beta\\]](https://example.test/tools/k): Two lines.");
  });

  it("ends with one newline", () => {
    expect(llmsTxt("https://example.test", [row("k", "K", "x")], []).endsWith("x\n")).toBe(true);
  });
});
