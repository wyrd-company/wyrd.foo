/*
 * Checks of the site built from the docs fixture content
 * (test/fixtures/docs-content) into dist-fixtures/docs/. Run after
 * `pnpm build:docs-fixture` (`pnpm test:dist`).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "node-html-parser";
import { describe, expect, it } from "vitest";
import { monogramDataUri } from "../src/lib/head";

const DIST = "dist-fixtures/docs";
const file = (path: string) => readFileSync(join(DIST, path), "utf8");
const page = (path: string) => parse(file(join(path, "index.html")));
const text = (s: string | undefined) => s?.replace(/\s+/g, " ").trim();

function htmlFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === "pagefind" ? [] : htmlFiles(p);
    return e.name.endsWith(".html") ? [p] : [];
  });
}

describe("docs built from the fixture content", () => {
  it("has a build to check", () => {
    expect(existsSync(join(DIST, "docs/gadget/getting-started/index.html")), "run `pnpm build:docs-fixture` first").toBe(true);
  });

  it("routes two products of one repo that both have getting-started.md to their own pages", () => {
    const gadget = page("docs/gadget/getting-started");
    const gizmo = page("docs/gizmo/getting-started");
    expect(gadget.querySelector("h1")?.text).toBe("Getting started");
    expect(gizmo.querySelector("h1")?.text).toBe("Getting started with gizmo");
    expect(gadget.querySelector(".docs-switcher-name")?.text).toBe("gadget");
    expect(gizmo.querySelector(".docs-switcher-name")?.text).toBe("gizmo");
  });

  it("routes a nested page by its file name and edits it at its path in the repo", () => {
    const root = page("docs/gadget/configuration");
    expect(root.querySelector("h1")?.text).toBe("Configuration");
    const edit = root.querySelectorAll(".docs-toc-actions a").at(-1)?.getAttribute("href");
    expect(edit).toBe("https://github.com/example-org/gadgets/edit/HEAD/docs/user/gadget/guides/configuration.md");
    expect(existsSync(join(DIST, "docs/gadget/guides"))).toBe(false);
  });

  it("edits a page of a repo with one docs unit under docs/user", () => {
    const edit = page("docs/sprocket/tools").querySelectorAll(".docs-toc-actions a").at(-1)?.getAttribute("href");
    expect(edit).toBe("https://github.com/example-org/sprocket/edit/HEAD/docs/user/tools.md");
  });

  it("sets the theme before any stylesheet on every docs page, the redirects too", () => {
    const files = htmlFiles(join(DIST, "docs"));
    expect(files).toContain(join(DIST, "docs/gadget/index.html"));
    for (const path of files) {
      const html = parse(readFileSync(path, "utf8")).querySelector("head")!.innerHTML;
      const script = html.indexOf("wyrd-theme");
      const stylesheet = html.search(/<link[^>]+rel="stylesheet"/);
      expect(script, path).toBeGreaterThan(-1);
      expect(stylesheet === -1 || script < stylesheet, path).toBe(true);
    }
  });

  it("redirects /docs/<key>/ to the first page in reading order", () => {
    const root = page("docs/gadget");
    expect(root.querySelector('meta[http-equiv="refresh"]')?.getAttribute("content")).toBe("0; url=/docs/gadget/getting-started");
    expect(page("docs/gizmo").querySelector('meta[http-equiv="refresh"]')?.getAttribute("content")).toBe("0; url=/docs/gizmo/getting-started");
  });

  it("writes the version footer and links the docs changelog when there is one", () => {
    const gadget = page("docs/gadget/install").querySelector(".docs-version");
    expect(text(gadget?.text)).toBe("Docs 0.2.3 · for gadget 0.2.0");
    expect(gadget?.querySelector("a")?.getAttribute("href")).toBe("/docs/gadget/changelog");
    expect(text(page("docs/gizmo/usage").querySelector(".docs-version")?.text)).toBe("Docs 0.1.0 · for gizmo 0.1.0");
    expect(page("docs/gizmo/usage").querySelector(".docs-version a")).toBeNull();
  });

  it("renders the docs changelog, and none for a product without one", () => {
    expect(page("docs/gadget/changelog").querySelector(".docs-prose")?.text).toContain("Add the troubleshooting guide.");
    expect(existsSync(join(DIST, "docs/gizmo/changelog"))).toBe(false);
  });

  it("serves each page as Markdown for Copy as Markdown", () => {
    const md = file("docs/gadget/getting-started.md");
    expect(md.startsWith("# Getting started\n\ngadget runs a sample service")).toBe(true);
    expect(md).not.toContain("product: gadget");
  });

  it("shows only the current section in the sidebar, with More for pages nav does not list", () => {
    const root = page("docs/gadget/troubleshooting");
    expect(root.querySelectorAll(".docs-sidebar-heading").map((p) => p.text)).toEqual(["Configure", "More"]);
    expect(root.querySelectorAll(".docs-sidebar li").map((li) => li.getAttribute("data-progress"))).toEqual(["done", "current"]);
    expect(root.querySelector('.docs-tabs a[aria-current="page"]')?.text.trim()).toBe("Guides");
  });

  it("renders the install block on a page that asks for it", () => {
    const root = page("docs/gadget/install");
    // node-html-parser keeps <pre> as raw text, so read the command from Copy.
    expect(root.querySelector(".docs-install [data-copy-text]")?.getAttribute("data-copy-text")).toBe(
      "docker run --rm -it ghcr.io/example-org/gadget",
    );
    expect(root.querySelector(".docs-install pre")?.text).toContain("docker run --rm -it ghcr.io/example-org/gadget");
    expect(page("docs/gadget/getting-started").querySelector(".docs-install")).toBeNull();
  });

  it("indexes each docs page once, with its product and kinds", () => {
    const root = page("docs/gadget/getting-started");
    expect(root.querySelectorAll("[data-pagefind-body]")).toHaveLength(1);
    expect(root.querySelectorAll('[data-pagefind-filter="kind"]').map((e) => e.text)).toEqual(["app", "devcontainer-feature"]);
    expect(page("docs/gadget").querySelector("[data-pagefind-body]")).toBeNull();
  });

  it("indexes the docs pages and the docs changelog, not the redirects", () => {
    const entry = JSON.parse(file("pagefind/pagefind-entry.json")) as { languages: Record<string, { page_count: number }> };
    // 7 fixture pages and gadget's docs changelog.
    expect(Object.values(entry.languages).map((l) => l.page_count)).toEqual([8]);
  });

  it("gives a docs page of a product with no favicon or logo its monogram favicon and the site image", () => {
    const root = page("docs/gizmo/usage");
    expect(root.querySelector('link[rel="icon"]')?.getAttribute("href")).toBe(monogramDataUri("gizmo"));
    expect(root.querySelector('meta[name="twitter:image"]')?.getAttribute("content")).toBe("https://wyrd.foo/social.png");
  });

  it("lists every product with docs on /docs/", () => {
    expect(page("docs").querySelectorAll(".docs-index a").map((a) => a.getAttribute("href"))).toEqual([
      "/docs/gadget",
      "/docs/gizmo",
      "/docs/sprocket",
    ]);
  });
});
