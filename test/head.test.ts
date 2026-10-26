import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import SiteLayout from "../src/layouts/SiteLayout.astro";
import { monogramDataUri, monogramSvg, resolveFavicon } from "../src/lib/head";
import { attr, render, SITE } from "./render";

const head = (product?: Record<string, unknown>, path = "/tools/example") =>
  render(SiteLayout, { title: "Example", description: "An example.", product }, path);

const icons = (root: Awaited<ReturnType<typeof head>>) =>
  root.querySelectorAll('link[rel="icon"]').map((l) => ({ href: l.getAttribute("href"), type: l.getAttribute("type") }));

const socialImages = (root: Awaited<ReturnType<typeof head>>) => ({
  og: attr(root, 'meta[property="og:image"]', "content"),
  twitter: attr(root, 'meta[name="twitter:image"]', "content"),
});

describe("shared head: product favicon and social image", () => {
  it("uses the product's own favicon and social image", async () => {
    const root = await head({
      key: "example",
      name: "Example",
      logo: "/assets/example/logo.svg",
      favicon: "/assets/example/favicon.png",
      socialImage: "/assets/example/social.jpg",
    });
    expect(icons(root)).toEqual([{ href: "/assets/example/favicon.png", type: "image/png" }]);
    expect(socialImages(root)).toEqual({
      og: `${SITE}/assets/example/social.jpg`,
      twitter: `${SITE}/assets/example/social.jpg`,
    });
  });

  it("falls back to the logo for the favicon and the site image for the social image", async () => {
    const root = await head({ key: "example", name: "Example", logo: "/assets/example/logo.svg" });
    expect(icons(root)).toEqual([{ href: "/assets/example/logo.svg", type: "image/svg+xml" }]);
    expect(socialImages(root)).toEqual({ og: `${SITE}/social.png`, twitter: `${SITE}/social.png` });
  });

  it("falls back to the monogram favicon when the product has no favicon and no logo", async () => {
    const root = await head({ key: "example", name: "example", socialImage: "/assets/example/social.png" });
    expect(icons(root)).toEqual([{ href: monogramDataUri("example"), type: "image/svg+xml" }]);
    expect(decodeURIComponent(icons(root)[0].href!)).toContain(">E</text>");
    expect(socialImages(root).og).toBe(`${SITE}/assets/example/social.png`);
  });

  it("uses the site favicon and image on a page with no product", async () => {
    const root = await head(undefined, "/");
    expect(icons(root)).toEqual([
      { href: "/favicon.svg", type: "image/svg+xml" },
      { href: "/favicon-32.png", type: "image/png" },
    ]);
    expect(attr(root, 'link[rel="apple-touch-icon"]', "href")).toBe("/apple-touch-icon.png");
    expect(socialImages(root)).toEqual({ og: `${SITE}/social.png`, twitter: `${SITE}/social.png` });
  });

  it("writes title, description, canonical, og:* and twitter:* for the page URL", async () => {
    const root = await head(undefined, "/docs/example/install");
    const canonical = `${SITE}/docs/example/install`;
    expect(root.querySelector("title")?.text).toBe("Example");
    expect(attr(root, 'meta[name="description"]', "content")).toBe("An example.");
    expect(attr(root, 'link[rel="canonical"]', "href")).toBe(canonical);
    expect(attr(root, 'meta[property="og:url"]', "content")).toBe(canonical);
    expect(attr(root, 'meta[property="og:title"]', "content")).toBe("Example");
    expect(attr(root, 'meta[property="og:description"]', "content")).toBe("An example.");
    expect(attr(root, 'meta[name="twitter:card"]', "content")).toBe("summary_large_image");
    expect(attr(root, 'meta[name="twitter:title"]', "content")).toBe("Example");
    expect(attr(root, 'meta[name="twitter:description"]', "content")).toBe("An example.");
  });

  it("rejects a favicon that is neither SVG nor PNG", () => {
    expect(() => resolveFavicon({ name: "Example", favicon: "/assets/example/favicon.ico" })).toThrow(/SVG or PNG/);
  });
});

describe("monogram favicon", () => {
  it("escapes the letter in the favicon SVG", () => {
    expect(monogramSvg("&")).toContain(">&#38;</text>");
  });

  it("is the site favicon for the name Wyrd", () => {
    expect(readFileSync("public/favicon.svg", "utf8").trim()).toBe(monogramSvg("Wyrd"));
  });
});
