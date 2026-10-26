import { describe, expect, it } from "vitest";
import { isRedirectPage } from "../src/lib/sitemap";

describe("isRedirectPage", () => {
  it("is true for a product's docs landing page", () => {
    expect(isRedirectPage("https://wyrd.foo/docs/example/")).toBe(true);
    expect(isRedirectPage("https://wyrd.foo/docs/another-example/")).toBe(true);
  });

  it("is false for the docs index, a docs page and its changelog", () => {
    expect(isRedirectPage("https://wyrd.foo/docs/")).toBe(false);
    expect(isRedirectPage("https://wyrd.foo/docs/example/getting-started/")).toBe(false);
    expect(isRedirectPage("https://wyrd.foo/docs/example/changelog/")).toBe(false);
  });

  it("is false for the home page and a product page", () => {
    expect(isRedirectPage("https://wyrd.foo/")).toBe(false);
    expect(isRedirectPage("https://wyrd.foo/tools/example/")).toBe(false);
  });
});
