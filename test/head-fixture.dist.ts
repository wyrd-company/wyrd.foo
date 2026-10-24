/*
 * Checks of the fixture site in test/fixtures/head-site, built by
 * `pnpm build:fixtures` through the real SiteLayout. Its pages give a product
 * its own favicon, logo and social image; a logo only; and nothing.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "node-html-parser";
import { describe, expect, it } from "vitest";
import { monogramDataUri } from "../src/lib/head";

const DIST = "test/fixtures/head-site/dist";
const SITE = "https://wyrd.foo";

function head(page: string) {
  const file = join(DIST, "tools", page, "index.html");
  expect(existsSync(file), `${file}: run \`pnpm build:fixtures\` first`).toBe(true);
  const root = parse(readFileSync(file, "utf8"));
  const icons = root
    .querySelectorAll('link[rel="icon"]')
    .map((l) => ({ href: l.getAttribute("href"), type: l.getAttribute("type") }));
  const og = root.querySelector('meta[property="og:image"]')?.getAttribute("content");
  const twitter = root.querySelector('meta[name="twitter:image"]')?.getAttribute("content");
  return { icons, og, twitter };
}

/** The built file a site-relative or absolute site URL points at. */
function built(url: string): string {
  return join(DIST, new URL(url, SITE).pathname);
}

describe("built head for a product page", () => {
  it("emits the product's own favicon and social image", () => {
    const { icons, og, twitter } = head("with-assets");
    expect(icons).toEqual([{ href: "/assets/example/favicon.png", type: "image/png" }]);
    expect(og).toBe(`${SITE}/assets/example/social.png`);
    expect(twitter).toBe(`${SITE}/assets/example/social.png`);
    for (const url of [icons[0].href!, og!]) expect(existsSync(built(url)), url).toBe(true);
  });

  it("emits the logo as the favicon and the site image when the product has neither", () => {
    const { icons, og, twitter } = head("logo-only");
    expect(icons).toEqual([{ href: "/assets/example/logo.svg", type: "image/svg+xml" }]);
    expect(og).toBe(`${SITE}/social.png`);
    expect(twitter).toBe(`${SITE}/social.png`);
    for (const url of [icons[0].href!, og!]) expect(existsSync(built(url)), url).toBe(true);
  });

  it("emits the monogram favicon and the site image when the product has no logo, favicon or social image", () => {
    const { icons, og, twitter } = head("no-assets");
    expect(icons).toEqual([{ href: monogramDataUri("example"), type: "image/svg+xml" }]);
    expect(og).toBe(`${SITE}/social.png`);
    expect(twitter).toBe(`${SITE}/social.png`);
  });
});
