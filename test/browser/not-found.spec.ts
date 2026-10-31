/*
 * The 404 page in a browser, on the site build: a URL with no page answers
 * 404 with the 404 page, and the page's links and search work.
 */
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { assertSiteShell } from "./support";

const MISSING = "/definitely-not-a-page/";

/** Open a URL that has no page; fail unless it answers 404 with the 404 page. */
async function openMissing(page: Page) {
  const response = await page.goto(MISSING, { waitUntil: "domcontentloaded" });
  if (!response) throw new Error(`no response for ${MISSING}`);
  expect(response.status(), "an unknown URL answers 404").toBe(404);
  expect(new URL(response.url()).pathname, "and is not redirected").toBe(MISSING);
  await assertSiteShell(page, MISSING);
  await expect(page).toHaveTitle("Page not found — Wyrd Tools");
  await expect(page.locator("main h1")).toHaveText("Page not found");
}

test("an unknown URL answers 404 with the 404 page", async ({ page }) => {
  await openMissing(page);
});

test("the 404 page links home and to the catalog", async ({ page }) => {
  await openMissing(page);
  await page.locator("main").getByRole("link", { name: "Browse the catalog" }).click();
  await expect(page).toHaveURL(/\/#catalog$/);
  await expect(page.locator("#catalog")).toBeVisible();

  await openMissing(page);
  await page.locator("main").getByRole("link", { name: "Go home" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("the 404 page's Search button opens the search dialog", async ({ page }) => {
  await openMissing(page);
  const dialog = page.locator("dialog.wsearch");
  await expect(dialog).not.toBeVisible();
  await page.locator("main").getByRole("button", { name: "Search" }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".wsearch-input")).toBeFocused();
});

test("the 404 page shows the requested path, decoded", async ({ page }) => {
  await openMissing(page);
  await expect(page.locator("[data-not-found-path] code")).toHaveText(MISSING);

  const response = await page.goto("/caf%C3%A9/", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(404);
  await expect(page.locator("[data-not-found-path] code")).toHaveText("/café/");
});

test("a path with a malformed escape shows as it was sent", async ({ page }) => {
  // astro preview answers such a path with 500; Cloudflare Pages serves the
  // 404 page. Serve dist/404.html for it, as Pages does.
  const body = readFileSync("dist/404.html", "utf8");
  await page.route("**/%E0%A4%A/", (route) => route.fulfill({ status: 404, contentType: "text/html", body }));
  await page.goto("/%E0%A4%A/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-not-found-path] code")).toHaveText("/%E0%A4%A/");
});

test("search does not find the 404 page", async ({ page }) => {
  await openMissing(page);
  const urls = await page.evaluate(async () => {
    const url = "/pagefind/pagefind.js";
    const pagefind = await import(/* @vite-ignore */ url);
    const found = await pagefind.search("page not found");
    const data = await Promise.all(found.results.map((r: { data: () => Promise<{ url: string }> }) => r.data()));
    return data.map((d) => d.url);
  });
  expect(urls.filter((u: string) => /404/.test(u))).toEqual([]);
});

// relationships: { implements: site }
test("the issue draft names the missing page without its query or fragment", async ({ page }) => {
  await openMissing(page);
  await page.goto(`${MISSING}?private=value#details`);
  const report = page.getByRole("link", { name: "Report a site problem" });
  await expect(report).toHaveAttribute("href", /definitely-not-a-page/);
  const url = new URL((await report.getAttribute("href"))!);
  expect(url.pathname).toBe("/wyrd-company/wyrd.foo/issues/new");
  expect(url.searchParams.get("body")).toContain(`Page: https://wyrd.foo${MISSING}\n`);
  expect(url.searchParams.get("body")).not.toContain("private=value");
  expect(url.searchParams.get("body")).not.toContain("#details");
});
