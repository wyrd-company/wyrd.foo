// relationships: { implements: site }
import { readFileSync } from "node:fs";
import { parse } from "node-html-parser";
import { describe, expect, it } from "vitest";

function reports(build: string, path: string) {
  const root = parse(readFileSync(`dist-fixtures/${build}/${path}`, "utf8"));
  return root.querySelectorAll('.site-footer a[href*="/issues/new"]').map((a) => new URL(a.getAttribute("href")!));
}

describe("built page issue context", () => {
  it.each(["index.html", "releases/index.html", "docs/index.html", "404.html"])("offers a site report on %s", (path) => {
    const links = reports("docs", path);
    expect(links).toHaveLength(1);
    expect(links[0].pathname).toBe("/wyrd-company/wyrd.foo/issues/new");
  });

  it.each([
    ["docs", "docs/gadget/configuration/index.html", "example-org/gadgets", "docs/user/gadget/guides/configuration.md"],
    ["docs", "docs/sprocket/tools/index.html", "example-org/sprocket", "docs/user/tools.md"],
    ["docs", "docs/gadget/changelog/index.html", "example-org/gadgets", "docs/user/gadget/CHANGELOG.md"],
    ["products", "tools/lantern/index.html", "example-org/features", "src/features/lantern/README.md"],
    ["products", "tools/widget/index.html", "example-org/widget", "docs/user/docs.yml"],
  ])("routes %s/%s to its repo and original file", (build, path, owner, source) => {
    const links = reports(build, path);
    expect(links).toHaveLength(2);
    expect(links[0].pathname).toBe(`/${owner}/issues/new`);
    expect(links[0].searchParams.get("body")).toContain(`Source: https://github.com/${owner}/blob/HEAD/${source}`);
    expect(links[0].searchParams.get("body")).toContain(`Page: https://wyrd.foo/${path.replace("index.html", "")}\n`);
    expect(links[1].pathname).toBe("/wyrd-company/wyrd.foo/issues/new");
  });

  it("keeps product ownership on releases pages", () => {
    const [product, site] = reports("products", "tools/widget/releases/index.html");
    expect(product.pathname).toBe("/example-org/widget/issues/new");
    expect(product.searchParams.get("body")).toContain("Version: 1.4.0\nDocs version: 1.4.2\n");
    expect(site.pathname).toBe("/wyrd-company/wyrd.foo/issues/new");
  });

  it("omits docs version for feature releases", () => {
    const [feature] = reports("products", "tools/lantern/releases/index.html");
    expect(feature.pathname).toBe("/example-org/features/issues/new");
    expect(feature.searchParams.get("body")).toContain("Version:");
    expect(feature.searchParams.get("body")).not.toContain("Docs version:");
  });
});
