/*
 * Checks of the sitemap and robots.txt in the real build (dist/) and in the
 * docs, product and home fixture builds. Run after `pnpm build` and
 * `pnpm build:fixtures` (`pnpm test:dist`).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "node-html-parser";
import { describe, expect, it } from "vitest";

const SITE = "https://wyrd.foo";
const BUILDS = ["dist", "dist-fixtures/docs", "dist-fixtures/products", "dist-fixtures/home"];

const read = (dist: string, path: string) => readFileSync(join(dist, path), "utf8");
const locs = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

/** The URL of every built HTML page, as a sitemap lists it. */
function pageUrls(dist: string): string[] {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = join(dir, e.name);
      if (e.isDirectory()) return e.name === "pagefind" ? [] : walk(p);
      return e.name === "index.html" ? [p] : [];
    });
  return walk(dist).map((f) => `${SITE}/${f.slice(dist.length + 1, -"index.html".length)}`);
}

function isRedirect(dist: string, url: string): boolean {
  const file = join(dist, new URL(url).pathname, "index.html");
  return parse(readFileSync(file, "utf8")).querySelector('meta[http-equiv="refresh"]') !== null;
}

describe.each(BUILDS)("sitemap of %s", (dist) => {
  it("has a build to check", () => {
    expect(existsSync(join(dist, "index.html")), `build ${dist} first`).toBe(true);
  });

  it("has an index that points to the sitemap", () => {
    const index = read(dist, "sitemap-index.xml");
    expect(locs(index)).toEqual([`${SITE}/sitemap-0.xml`]);
    expect(existsSync(join(dist, "sitemap-0.xml"))).toBe(true);
  });

  it("lists the home page and every product and docs page with an absolute URL", () => {
    const listed = locs(read(dist, "sitemap-0.xml"));
    expect(listed).toContain(`${SITE}/`);
    const expected = pageUrls(dist).filter((u) => !isRedirect(dist, u));
    expect(expected.length).toBeGreaterThan(0);
    expect(listed.sort()).toEqual(expected.sort());
  });

  it("lists no redirect page and no Markdown URL", () => {
    const listed = locs(read(dist, "sitemap-0.xml"));
    for (const url of listed) {
      expect(url, url).not.toMatch(/\.md$/);
      expect(isRedirect(dist, url), url).toBe(false);
    }
  });

  it("leaves out lastmod", () => {
    expect(read(dist, "sitemap-0.xml")).not.toContain("<lastmod>");
  });

  it("serves a robots.txt that names the sitemap", () => {
    const robots = read(dist, "robots.txt");
    expect(robots).toContain("User-agent: *");
    expect(robots).toContain("Allow: /");
    expect(robots).toContain(`Sitemap: ${SITE}/sitemap-index.xml`);
  });

  it("links the sitemap from the head of the home page", () => {
    const link = parse(read(dist, "index.html")).querySelector('link[rel="sitemap"]');
    expect(link?.getAttribute("href")).toBe("/sitemap-index.xml");
  });
});

describe("sitemap of the real build", () => {
  it("lists a product page, a docs page and the docs index", () => {
    const listed = locs(read("dist", "sitemap-0.xml"));
    expect(listed.some((u) => /^https:\/\/wyrd\.foo\/tools\/[^/]+\/$/.test(u))).toBe(true);
    expect(listed.some((u) => /^https:\/\/wyrd\.foo\/docs\/[^/]+\/[^/]+\/$/.test(u))).toBe(true);
    expect(listed).toContain(`${SITE}/docs/`);
  });
});
