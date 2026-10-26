/*
 * The 404 page in a browser, on the site build: a URL with no page answers
 * 404 with the 404 page, and the page's links and search work.
 */
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
