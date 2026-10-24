/*
 * A page that is not the page asked for fails the run: a wrong URL, a
 * redirect, or a fallback page that answers 200 without the site in it.
 */
import { expect, test } from "@playwright/test";
import { openPage } from "./support";

test("the control: the home page loads", async ({ page, baseURL }) => {
  const response = await openPage(page, baseURL, "/");
  expect(response.status()).toBe(200);
});

test("a wrong URL fails the run", async ({ page, baseURL }) => {
  await expect(openPage(page, baseURL, "/no-such-page/")).rejects.toThrow(/answered 404, not 200/);
});

test("a redirect fails the run", async ({ page, baseURL }) => {
  await page.route("**/moved/", (route) =>
    route.fulfill({ status: 302, headers: { location: "/" } }),
  );
  await expect(openPage(page, baseURL, "/moved/")).rejects.toThrow(/a redirect/);
});

test("a page without the site in it fails the run", async ({ page, baseURL }) => {
  await page.route("**/fallback/", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<title>Not found</title>" }),
  );
  await expect(openPage(page, baseURL, "/fallback/")).rejects.toThrow(/not a page of the site/);
});
