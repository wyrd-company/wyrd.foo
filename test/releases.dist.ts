/*
 * Checks of the releases pages built from the fixture content root
 * test/fixtures/product-content (`pnpm build:product-fixture`, into
 * dist-fixtures/products/): /releases, each product's /tools/<key>/releases,
 * and the links to them from the header, the home page and the product page.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse, type HTMLElement } from "node-html-parser";
import { describe, expect, it } from "vitest";

const DIST = "dist-fixtures/products";
const PRODUCTS = ["widget", "gadget", "sprocket", "gizmo", "harbor", "lantern", "beacon"];

function built(path: string): HTMLElement {
  const file = join(DIST, path, "index.html");
  expect(existsSync(file), `${file}: run \`pnpm build:product-fixture\` first`).toBe(true);
  return parse(readFileSync(file, "utf8"));
}

const text = (el: HTMLElement | null | undefined) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
const texts = (root: HTMLElement, selector: string) => root.querySelectorAll(selector).map((el) => text(el));
const headerReleases = (root: HTMLElement) => root.querySelectorAll(".site-nav a").find((a) => text(a) === "Releases");
const repeatedIds = (root: HTMLElement) => {
  const ids = root.querySelectorAll("[id]").map((el) => el.id);
  return ids.filter((id, i) => ids.indexOf(id) !== i);
};

describe("/releases", () => {
  const root = () => built("releases");
  const entry = (key: string) => root().querySelector(`[data-release-entry="${key}"]`)!;

  it("lists each product with a release and a changelog, newest release first", () => {
    // gizmo and harbor have a release and no changelog; sprocket and beacon have neither.
    expect(root().querySelectorAll("[data-release-entry]").map((el) => el.getAttribute("data-release-entry"))).toEqual([
      "gadget",
      "lantern",
      "widget",
    ]);
  });

  it("shows each product's mark, name, version and date", () => {
    const widget = entry("widget");
    expect(widget.querySelectorAll(".product-mark img").map((img) => img.getAttribute("src"))).toEqual([
      "/assets/widget/assets/logo.svg",
      "/assets/widget/assets/logo-dark.svg",
    ]);
    expect(text(entry("gadget").querySelector(".monogram"))).toBe("G");
    expect(text(widget.querySelector(".release-entry-name"))).toBe("widget");
    expect(text(widget.querySelector(".release-entry-meta"))).toBe("CLI · 1.4.0 · 30 Sep 2026");
    expect(widget.querySelector(".release-entry-meta time")?.getAttribute("datetime")).toBe("2026-09-30");
    expect(text(entry("lantern").querySelector(".release-entry-meta"))).toBe("Dev container feature · 1.2.0 · 5 Oct 2026");
  });

  it("shows only the latest changelog entry of each product, rendered", () => {
    const widget = entry("widget");
    expect(texts(widget, ".product-prose :is(h3, h4, h5, h6)")).toEqual(["Features"]);
    expect(widget.querySelector(".product-prose code")?.textContent).toBe("--json");
    expect(text(widget.querySelector(".product-prose"))).not.toContain("Keep the input order");
    const gadget = text(entry("gadget").querySelector(".product-prose"));
    expect(gadget).toContain("Keep the console open when a queue empties.");
    expect(gadget).not.toContain("Start the console with one command.");
    expect(gadget).not.toContain("Earlier releases");
    expect(gadget).not.toContain("Each released version");
  });

  it("links each entry to its product's releases page", () => {
    for (const key of ["gadget", "lantern", "widget"]) {
      const links = entry(key).querySelectorAll("a").map((a) => a.getAttribute("href"));
      expect(links, key).toContain(`/tools/${key}/releases`);
    }
  });

  it("has one h1, entry headings below it, and no repeated id", () => {
    expect(texts(root(), "h1")).toEqual(["Releases"]);
    expect(texts(root(), "[data-release-entry] h2")).toEqual(["gadget", "Lantern", "widget"]);
    expect(repeatedIds(root())).toEqual([]);
  });

  it("marks Releases current in the header", () => {
    expect(headerReleases(root())?.getAttribute("aria-current")).toBe("page");
  });

  it("is indexed for search", () => {
    expect(root().querySelectorAll("[data-pagefind-body]")).toHaveLength(1);
  });
});

describe("/tools/<key>/releases", () => {
  const page = (key: string) => built(`tools/${key}/releases`);

  it("is built for every product", () => {
    for (const key of PRODUCTS) expect(page(key).querySelector(`[data-product-releases="${key}"]`), key).not.toBeNull();
  });

  it("shows the product's full changelog after its latest release", () => {
    const root = page("widget");
    expect(text(root.querySelector("[data-release-latest] .release-version"))).toBe("1.4.0");
    expect(texts(root, ".release-log h4")).toEqual(["1.4.0 - 2026-09-30", "1.3.1 - 2026-08-12"]);
    const gadget = text(page("gadget").querySelector(".release-log"));
    expect(gadget).toContain("Start the console with one command.");
    expect(gadget).toContain("Earlier releases: see git tags.");
  });

  it("shows the latest release, or none, for a product with no changelog", () => {
    expect(text(page("gizmo").querySelector("[data-release-latest] .release-version"))).toBe("2.1.0");
    expect(page("gizmo").querySelector(".release-log")).toBeNull();
    expect(text(page("sprocket").querySelector(".release-none"))).toBe("No releases yet.");
  });

  it("has the product's breadcrumb: Catalog / category / product / Releases", () => {
    const crumbs = page("widget").querySelector('nav[aria-label="Breadcrumb"]')!;
    expect(texts(crumbs, "a, span:not([aria-hidden])")).toEqual(["Catalog", "Templates & Scaffolding", "widget", "Releases"]);
    expect(crumbs.querySelectorAll("a").map((a) => a.getAttribute("href"))).toEqual(["/#catalog", "/tools/widget"]);
    expect(crumbs.querySelector('[aria-current="page"]')?.textContent).toBe("Releases");
  });

  it("has the product page's favicon and social image", () => {
    for (const key of PRODUCTS) {
      const product = built(`tools/${key}`);
      const releases = page(key);
      for (const selector of ['link[rel="icon"]', 'meta[property="og:image"]', 'meta[name="twitter:image"]']) {
        const attr = selector.startsWith("link") ? "href" : "content";
        expect(releases.querySelector(selector)?.getAttribute(attr), `${key} ${selector}`).toBe(
          product.querySelector(selector)?.getAttribute(attr),
        );
      }
    }
  });

  it("marks Releases current in the header", () => {
    expect(headerReleases(page("widget"))?.getAttribute("aria-current")).toBe("page");
  });

  it("is indexed for search with its product", () => {
    const body = page("widget").querySelectorAll("[data-pagefind-body]");
    expect(body).toHaveLength(1);
    expect(texts(body[0], '[data-pagefind-filter="product"]')).toEqual(["widget"]);
    expect(texts(body[0], '[data-pagefind-meta="productName"]')).toEqual(["widget"]);
  });

  it("repeats no id", () => {
    for (const key of PRODUCTS) expect(repeatedIds(page(key)), key).toEqual([]);
  });
});

describe("links to the releases pages", () => {
  it("sends the header's Releases to /releases on every page", () => {
    const paths = ["", "releases", "docs", ...PRODUCTS.flatMap((key) => [`tools/${key}`, `tools/${key}/releases`])];
    for (const path of paths) {
      expect(headerReleases(built(path))?.getAttribute("href"), path || "/").toBe("/releases");
    }
    // A docs page has the docs header, with its own Releases link.
    expect(built("docs/widget/getting-started").querySelector(".docs-releases")?.getAttribute("href")).toBe("/releases");
  });

  it("does not mark Releases current on the home page or a product page", () => {
    for (const path of ["", "tools/widget"]) expect(headerReleases(built(path))?.hasAttribute("aria-current"), path || "/").toBe(false);
  });

  it("links each Recent releases entry to its product's releases page, then all releases", () => {
    const box = built("").querySelector("#releases")!;
    const entries = box.querySelectorAll("[data-release-key]");
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.getAttribute("href")).toBe(`/tools/${entry.getAttribute("data-release-key")}/releases`);
    }
    const all = box.querySelectorAll("a").find((a) => text(a) === "All releases →");
    expect(all?.getAttribute("href")).toBe("/releases");
  });

  it("links the product page's latest version to its own Releases section", () => {
    for (const key of PRODUCTS) {
      const latest = built(`tools/${key}`).querySelector('[data-fact="latest"] a');
      expect(latest?.getAttribute("href"), key).toBe("#releases");
    }
  });

  it("ends the product page's Releases section with All releases, when the product has a changelog", () => {
    for (const key of ["widget", "gadget", "lantern"]) {
      const all = built(`tools/${key}`).querySelectorAll("#releases a").find((a) => text(a) === "All releases →");
      expect(all?.getAttribute("href"), key).toBe(`/tools/${key}/releases`);
    }
    for (const key of ["gizmo", "sprocket"]) {
      expect(texts(built(`tools/${key}`), "#releases a"), key).not.toContain("All releases →");
    }
  });

  it("links the docs footer's product version to the product's releases page", () => {
    const footer = built("docs/widget/getting-started").querySelector(".docs-version")!;
    const product = footer.querySelectorAll("a").find((a) => text(a) === "for widget 1.4.0");
    expect(product?.getAttribute("href")).toBe("/tools/widget/releases");
    // widget publishes no docs changelog, so "Docs 1.4.2" stays text.
    expect(footer.querySelectorAll("a")).toHaveLength(1);
  });
});
