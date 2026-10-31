// ---
// relationships:
//   verifies: site
// ---
import { readFileSync } from "node:fs";
import { parse } from "node-html-parser";
import { describe, expect, it } from "vitest";

const dist = "dist-fixtures/products";
describe("built releases RSS", () => {
  it("builds an XML feed with the same latest releases and full notes as the releases page", () => {
    const xml = readFileSync(`${dist}/releases.xml`, "utf8");
    const page = parse(readFileSync(`${dist}/releases/index.html`, "utf8"));
    const keys = page.querySelectorAll("[data-release-entry]").map((e) => e.getAttribute("data-release-entry"));
    expect(keys).toEqual(["gadget", "lantern", "widget"]);
    expect(xml.match(/<item>/g)).toHaveLength(keys.length);
    for (const key of keys) expect(xml).toContain(`<link>https://wyrd.foo/tools/${key}/releases</link>`);
    expect(xml).toContain("last-lantern-option");
    expect(xml).toContain("--json");
    expect(xml).not.toContain("Keep the input order");
    expect(xml).not.toContain("Earlier releases");
    expect(page.querySelector('a[href="/releases.xml"]')?.textContent).toBe("Subscribe via RSS");
  });

  it("advertises the feed on site, product and docs pages", () => {
    for (const path of ["index.html", "releases/index.html", "tools/widget/index.html", "docs/widget/getting-started/index.html"]) {
      const page = parse(readFileSync(`${dist}/${path}`, "utf8"));
      const links = page.querySelectorAll('head link[rel="alternate"][type="application/rss+xml"]');
      expect(links, path).toHaveLength(1);
      expect(links[0].getAttribute("href")).toBe("https://wyrd.foo/releases.xml");
    }
  });
});
