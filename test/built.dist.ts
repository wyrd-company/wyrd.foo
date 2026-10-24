/*
 * Checks of the built site in dist/. Run after `pnpm build` (`pnpm check`).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "node-html-parser";
import { describe, expect, it } from "vitest";
import { monogramDataUri } from "../src/lib/head";

const DIST = "dist";

function htmlFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === "pagefind" ? [] : htmlFiles(p);
    return e.name.endsWith(".html") ? [p] : [];
  });
}

function page(path: string) {
  return parse(readFileSync(join(DIST, path), "utf8"));
}

describe("built site", () => {
  it("has a build to check", () => {
    expect(existsSync(join(DIST, "index.html")), "run `pnpm build` first").toBe(true);
  });

  const pages = existsSync(DIST) ? htmlFiles(DIST) : [];

  it("requests no third-party font or stylesheet", () => {
    expect(pages.length).toBeGreaterThan(1);
    for (const file of pages) {
      const root = parse(readFileSync(file, "utf8"));
      const external = root
        .querySelectorAll('link[rel="stylesheet"], link[rel="preconnect"], link[rel="preload"]')
        .map((l) => l.getAttribute("href") ?? "")
        .filter((href) => /^(https?:)?\/\//.test(href));
      expect(external, file).toEqual([]);
    }
  });

  it("self-hosts Geist and Geist Mono", () => {
    const css = readdirSync(join(DIST, "_astro"))
      .filter((f) => f.endsWith(".css"))
      .map((f) => readFileSync(join(DIST, "_astro", f), "utf8"))
      .join("\n");
    expect(css).toMatch(/font-family:\s*Geist Variable/);
    expect(css).toMatch(/font-family:\s*Geist Mono Variable/);
    expect(css).not.toMatch(/url\((["']?)https?:/);
    expect(css).not.toMatch(/\.blueprint/);
  });

  it("sets the theme before any stylesheet on every page", () => {
    for (const file of pages) {
      const head = parse(readFileSync(file, "utf8")).querySelector("head")!;
      const html = head.innerHTML;
      const script = html.indexOf("wyrd-theme");
      const stylesheet = html.search(/<link[^>]+rel="stylesheet"/);
      expect(script, file).toBeGreaterThan(-1);
      expect(stylesheet === -1 || script < stylesheet, file).toBe(true);
    }
  });

  it("gives the home page the site favicon and image", () => {
    const root = page("index.html");
    expect(root.querySelector('link[rel="icon"]')?.getAttribute("href")).toBe("/favicon.svg");
    expect(root.querySelector('meta[property="og:image"]')?.getAttribute("content")).toBe("https://wyrd.foo/social.png");
    for (const asset of ["favicon.svg", "favicon-32.png", "apple-touch-icon.png", "social.png"]) {
      expect(existsSync(join(DIST, asset)), asset).toBe(true);
    }
  });

  it("gives a docs page of a product with no favicon or logo its monogram favicon and the site image", () => {
    const docs = readdirSync(join(DIST, "docs"));
    expect(docs.length).toBeGreaterThan(0);
    const root = page(join("docs", docs[0], "index.html"));
    const name = root.querySelector("dialog.wsearch")?.getAttribute("data-product-name");
    expect(name).toBeTruthy();
    expect(root.querySelector('link[rel="icon"]')?.getAttribute("href")).toBe(monogramDataUri(name!));
    expect(root.querySelector('meta[name="twitter:image"]')?.getAttribute("content")).toBe("https://wyrd.foo/social.png");
  });
});
