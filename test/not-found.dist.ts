/*
 * Checks of the 404 page in the real build (dist/404.html). Cloudflare Pages
 * serves that file, with status 404, for every URL that has no page. Run
 * after `pnpm build` (`pnpm test:dist`).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "node-html-parser";
import { describe, expect, it } from "vitest";

const DIST = "dist";
const FILE = join(DIST, "404.html");

describe("dist/404.html", () => {
  it("is built", () => {
    expect(existsSync(FILE), "run `pnpm build` first").toBe(true);
  });

  it("is the 404 page in the site's shell", () => {
    const root = parse(readFileSync(FILE, "utf8"));
    expect(root.querySelector("title")?.text).toBe("Page not found — Wyrd Tools");
    expect(root.querySelector('meta[property="og:site_name"]')?.getAttribute("content")).toBe("Wyrd Tools");
    expect(root.querySelectorAll("header.site-header [data-theme-toggle]").length).toBeGreaterThan(0);
    expect(root.querySelectorAll("dialog.wsearch")).toHaveLength(1);
    expect(root.querySelectorAll("footer.site-footer")).toHaveLength(1);
    expect(root.querySelector("main h1")?.text.trim()).toBe("Page not found");
  });

  it("is not in the sitemap", () => {
    const sitemap = readFileSync(join(DIST, "sitemap-0.xml"), "utf8");
    expect(sitemap).toContain("<loc>https://wyrd.foo/</loc>");
    expect(sitemap).not.toMatch(/404/);
  });

  it("is left out of the search index, which indexes only data-pagefind-body pages", () => {
    const releases = parse(readFileSync(join(DIST, "releases/index.html"), "utf8"));
    expect(releases.querySelectorAll("[data-pagefind-body]"), "another page opts in").toHaveLength(1);
    expect(parse(readFileSync(FILE, "utf8")).querySelectorAll("[data-pagefind-body]")).toHaveLength(0);
  });
});
