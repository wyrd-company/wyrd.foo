/*
 * The product pages in a browser, built from the fixture content in
 * test/fixtures/product-content (`pnpm build:product-fixture`): platform tabs,
 * method pills and kind tabs, the arrow keys, Copy, the header's Releases
 * link, the theme's logo, and no sideways scroll on a phone.
 */
import { expect, test, type Page } from "@playwright/test";
import { openPage, store } from "./support";

test.use({ viewport: { width: 1440, height: 900 } });

const PRODUCTS = ["widget", "gadget", "sprocket", "gizmo", "harbor", "lantern", "beacon"];

/** Open a product page of the fixture; a 200 page that is not that product's page is not it. */
async function openProduct(page: Page, baseURL: string | undefined, key: string) {
  await openPage(page, baseURL, `/tools/${key}/`);
  if ((await page.locator(`article.product[data-product="${key}"]`).count()) !== 1) {
    throw new Error(`/tools/${key}/ is not the product page of ${key}`);
  }
}

const visible = (page: Page, selector: string) => page.locator(`${selector}:not([hidden])`);

test.describe("install tabs", () => {
  test("a platform tab shows its methods, and a method pill shows its command", async ({ page, baseURL }) => {
    await openProduct(page, baseURL, "widget");
    await expect(page.locator("#install-cli-macos")).toBeVisible();
    await expect(page.locator("#install-cli-linux")).toBeHidden();

    await page.locator("#install-cli-linux-tab").click();
    await expect(page.locator("#install-cli-linux-tab")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#install-cli-macos-tab")).toHaveAttribute("aria-selected", "false");
    await expect(page.locator("#install-cli-macos")).toBeHidden();
    await expect(page.locator("#install-cli-linux")).toBeVisible();

    await page.locator("#install-cli-linux").getByRole("tab", { name: "APT" }).click();
    const apt = visible(page, "#install-cli-linux .install-method");
    await expect(apt).toHaveCount(1);
    await expect(apt.locator("pre")).toContainText("https://repo.wyrd.foo/apt stable main");
    await expect(apt.locator("pre")).toContainText("sudo apt install widget");
  });

  test("the arrow keys move between tabs, and Home and End go to the ends", async ({ page, baseURL }) => {
    await openProduct(page, baseURL, "widget");
    const tabs = page.locator('#install [role="tablist"][aria-label="Platform"] > [role="tab"]');
    await tabs.first().focus();
    await page.keyboard.press("ArrowRight");
    await expect(tabs.nth(1)).toBeFocused();
    await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#install-cli-linux")).toBeVisible();
    await page.keyboard.press("End");
    await expect(tabs.last()).toBeFocused();
    await expect(page.locator("#install-cli-docker")).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(tabs.first()).toBeFocused();
    await expect(page.locator("#install-cli-macos")).toBeVisible();
  });

  test("a product with two kinds switches between its kind blocks", async ({ page, baseURL }) => {
    await openProduct(page, baseURL, "gizmo");
    await expect(page.locator("#install-kind-app")).toBeVisible();
    await expect(page.locator("#install-kind-devcontainer-feature")).toBeHidden();
    await page.locator("#install-kind-devcontainer-feature-tab").click();
    await expect(page.locator("#install-kind-app")).toBeHidden();
    await expect(page.locator("#install-kind-devcontainer-feature pre")).toHaveText(
      '"features": {\n  "ghcr.io/example-org/gizmo/gizmo:2": {}\n}',
    );
  });

  test("an MCP server's marketplace tab shows its command", async ({ page, baseURL }) => {
    await openProduct(page, baseURL, "sprocket");
    await page.locator('[data-install-block="mcp-server"]').getByRole("tab", { name: /Codex marketplace/ }).click();
    await expect(visible(page, '[data-install-block="mcp-server"] [role="tabpanel"]').locator("pre")).toHaveText(
      "codex plugin install example-org/sprocket",
    );
  });
});

test.describe("copy", () => {
  test("Copy puts the shown command on the clipboard, without the prompt", async ({ context, page, baseURL }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openProduct(page, baseURL, "widget");
    await page.locator("#install-cli-linux-tab").click();
    await page.locator("#install-cli-linux").getByRole("tab", { name: "RPM" }).click();
    const block = visible(page, "#install-cli-linux .install-method");
    await block.locator("[data-copy]").click();
    await expect(block.locator("[data-copy]")).toHaveText("Copied");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      "sudo curl -fsSL https://repo.wyrd.foo/wyrd.repo \\\n  -o /etc/yum.repos.d/wyrd.repo\nsudo dnf install widget",
    );

    // The label is the signal that the clipboard write finished.
    const hero = page.locator(".hero-install [data-copy]");
    await hero.click();
    await expect(hero).toHaveText("Copied");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("brew install example-org/tap/widget");
  });
});

test.describe("search", () => {
  test("finds the product pages, the page's own product first", async ({ page, baseURL }) => {
    await openProduct(page, baseURL, "gizmo");
    await page.locator("[data-wsearch-open]").first().click();
    await page.locator(".wsearch-input").fill("sample board");
    const first = page.locator(".wsearch-item").first();
    await expect(first.locator("a.wsearch-link")).toHaveAttribute("href", /^\/tools\/gizmo\/?$/);
    await expect(first.locator(".wsearch-title")).toHaveText("gizmo");
    await expect(first.locator(".wsearch-where")).toHaveClass(/is-local/);
  });
});

test.describe("page", () => {
  test("the header's Releases link goes to the page's Releases section", async ({ page, baseURL }) => {
    await openProduct(page, baseURL, "widget");
    await page.locator(".site-nav a", { hasText: "Releases" }).click();
    await page.waitForURL(/\/tools\/widget\/?#releases$/);
    await expect(page.locator("#releases")).toBeInViewport();
  });

  for (const [theme, shown, hidden] of [
    ["dark", "logo-dark.svg", "logo.svg"],
    ["light", "logo.svg", "logo-dark.svg"],
  ] as const) {
    test(`the ${theme} theme shows the ${theme} logo`, async ({ page, baseURL }) => {
      await openProduct(page, baseURL, "widget");
      await store(page, theme);
      await page.reload();
      await expect(page.locator(`.hero-title img[src$="/${shown}"]`)).toBeVisible();
      await expect(page.locator(`.hero-title img[src$="/${hidden}"]`)).toBeHidden();
    });
  }

  test("no product page scrolls sideways on a phone", async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const key of PRODUCTS) {
      await openProduct(page, baseURL, key);
      const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
      expect(width.scroll, key).toBe(width.client);
    }
  });
});
