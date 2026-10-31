// relationships: implements site
import { expect, test } from "@playwright/test";
import { productsOrigin } from "./config";
import { openPage } from "./support";

test("plugin tabs support keyboard selection and copy complete marketplace setup", async ({ page, context }) => {
  const origin = productsOrigin();
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin,
  });
  await openPage(page, origin, `${origin}/tools/compass/`);
  const block = page.locator('[data-install-block="coding-harness-plugin"]');
  await expect(block.getByRole("tab", { selected: true })).toHaveText("Another harness");
  await block.getByRole("tab", { name: "Another harness" }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(block.getByRole("tab", { selected: true })).toHaveText("Example harness");
  const panel = block.getByRole("tabpanel");
  await panel.getByRole("button", { name: /copy/i }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("/plugin marketplace add example-org/plugins\n/plugin install sample@examples");
});
