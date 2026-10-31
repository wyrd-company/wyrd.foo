/*
 * relationships:
 *   verifies: ../../DESIGN.md
 *
 * The page-title weight stays regular on the releases, docs index and 404
 * pages. Docs articles and the catalog have their own bold heading treatment.
 */
import { expect, test } from "@playwright/test";
import { assertSiteShell, openPage } from "./support";

for (const { path, title, status } of [
  { path: "/releases", title: "Releases", status: 200 },
  { path: "/docs/", title: "Docs", status: 200 },
  { path: "/missing-title-page/", title: "Page not found", status: 404 },
]) {
  test(`${path} has a regular page title`, async ({ page, baseURL }) => {
    if (status === 404) {
      const response = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(response?.status()).toBe(404);
      expect(response?.url()).toBe(new URL(path, baseURL).href);
      await assertSiteShell(page, path);
    } else {
      await openPage(page, baseURL, path);
    }
    const heading = page.locator("main h1");
    await expect(heading).toHaveText(title);
    await expect(heading).toHaveCSS("font-weight", "400");
  });
}
