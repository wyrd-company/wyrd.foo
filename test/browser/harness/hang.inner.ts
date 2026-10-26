import { test } from "@playwright/test";

// Keeps the run (and its server) alive until the outer test interrupts it.
test("waits", async ({ page, baseURL }) => {
  await page.goto(baseURL!);
  await new Promise(() => {});
});
