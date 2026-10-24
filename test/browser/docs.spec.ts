/*
 * The docs pages in a browser, built from the fixture content in
 * test/fixtures/docs-content (`pnpm build:docs-fixture`): routing, the product
 * switcher, section tabs, "On this page", search with kind chips, and Copy as
 * Markdown.
 */
import { expect, test, type Page } from "@playwright/test";
import { openPage } from "./support";

test.use({ viewport: { width: 1440, height: 900 } });

/** Open a docs page of the fixture; a 200 page without the docs header is not it. */
async function openDocs(page: Page, baseURL: string | undefined, path: string) {
  await openPage(page, baseURL, path);
  if ((await page.locator("header.docs-header").count()) !== 1) {
    throw new Error(`${path} is not a docs page of the fixture (no docs header)`);
  }
}

const currentToc = (page: Page) =>
  page.locator('[data-toc-target][aria-current="location"]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.tocTarget));

const atEnd = (page: Page) =>
  page.evaluate(() => {
    const doc = document.documentElement;
    return Math.ceil(doc.scrollTop + doc.clientHeight) >= doc.scrollHeight - 2;
  });

/** Scroll so the top of a heading sits `offset` px below the bottom of the header. */
async function scrollHeadingTo(page: Page, id: string, offset: number) {
  await page.evaluate(
    ([id, offset]) => {
      const header = document.querySelector(".docs-header")!.getBoundingClientRect().bottom;
      const top = document.getElementById(id as string)!.getBoundingClientRect().top;
      window.scrollBy(0, top - header - (offset as number));
    },
    [id, offset],
  );
  // The highlight updates on the next animation frame after the scroll event.
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
}

test.describe("routing", () => {
  test("two products of one repo each open their own getting-started page", async ({ page, baseURL }) => {
    await openDocs(page, baseURL, "/docs/gadget/getting-started");
    await expect(page.locator("h1")).toHaveText("Getting started");
    await expect(page.locator(".docs-switcher-name")).toHaveText("gadget");

    await openDocs(page, baseURL, "/docs/gizmo/getting-started");
    await expect(page.locator("h1")).toHaveText("Getting started with gizmo");
    await expect(page.locator(".docs-switcher-name")).toHaveText("gizmo");
  });

  test("/docs/<key>/ goes to the first page in reading order", async ({ page }) => {
    await page.goto("/docs/gadget/");
    await page.waitForURL(/\/docs\/gadget\/getting-started\/?$/);
    await expect(page.locator("h1")).toHaveText("Getting started");
  });
});

test.describe("header", () => {
  test("the switcher lists every product with docs and opens another", async ({ page, baseURL }) => {
    await openDocs(page, baseURL, "/docs/gadget/configuration");
    const switcher = page.locator("#docs-switcher");
    await expect(switcher).toBeHidden();
    await page.locator(".docs-switcher-button").click();
    await expect(switcher).toBeVisible();
    await expect(switcher.locator("a")).toHaveText([/gadget/, /gizmo/, /sprocket/]);
    await expect(switcher.locator('a[aria-current="page"]')).toHaveText(/gadget/);

    await switcher.locator("a", { hasText: "sprocket" }).click();
    await page.waitForURL(/\/docs\/sprocket\/tools\/?$/);
    await expect(page.locator(".docs-switcher-name")).toHaveText("sprocket");
  });

  test("a product with sections has tabs, the current one marked; one without has none", async ({ page, baseURL }) => {
    await openDocs(page, baseURL, "/docs/gadget/troubleshooting");
    await expect(page.locator(".docs-tabs a")).toHaveText(["Get started", "Guides"]);
    await expect(page.locator('.docs-tabs a[aria-current="page"]')).toHaveText("Guides");
    await expect(page.locator(".docs-sidebar-heading")).toHaveText(["Configure", "More"]);

    await openDocs(page, baseURL, "/docs/gizmo/usage");
    await expect(page.locator(".docs-tabs")).toHaveCount(0);
    await expect(page.locator(".docs-sidebar-heading")).toHaveCount(0);
  });
});

test.describe("On this page", () => {
  test("marks the last heading that has scrolled under the header", async ({ page, baseURL }) => {
    await openDocs(page, baseURL, "/docs/gadget/getting-started");
    expect(await currentToc(page), "no heading has reached the header yet").toEqual([]);

    // Each step stays short of the end of the page, where another rule applies.
    const steps: [string, number, string[]][] = [
      ["before-you-start", 40, []],
      ["before-you-start", -4, ["before-you-start"]],
      ["start-the-service", 40, ["before-you-start"]],
      ["start-the-service", -4, ["start-the-service"]],
    ];
    for (const [id, offset, expected] of steps) {
      await scrollHeadingTo(page, id, offset);
      expect(await atEnd(page), `${id} ${offset}: not at the end of the page`).toBe(false);
      expect(await currentToc(page), `${id} ${offset}px from the header`).toEqual(expected);
    }
  });

  test("at the end of the page, marks the last heading in view", async ({ page, baseURL }) => {
    await openDocs(page, baseURL, "/docs/gadget/getting-started");
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    const atEnd = await page.evaluate(() => {
      const doc = document.documentElement;
      return {
        end: Math.ceil(doc.scrollTop + doc.clientHeight) >= doc.scrollHeight - 2,
        lastReachesHeader: document.getElementById("next-steps")!.getBoundingClientRect().top <= 117,
      };
    });
    expect(atEnd, "the page ends before its last heading reaches the header").toEqual({ end: true, lastReachesHeader: false });
    expect(await currentToc(page)).toEqual(["next-steps"]);
  });

  test("a link marks the heading it scrolls to", async ({ page, baseURL }) => {
    await openDocs(page, baseURL, "/docs/gadget/getting-started");
    await page.locator('[data-toc-target="start-the-service"]').click();
    await page.waitForURL(/#start-the-service$/);
    await expect.poll(() => currentToc(page)).toEqual(["start-the-service"]);
  });
});

test.describe("search", () => {
  async function search(page: Page, query: string) {
    await page.locator("[data-wsearch-open]").first().click();
    await page.locator(".wsearch-input").fill(query);
  }

  const titles = (page: Page) => page.locator(".wsearch-item .wsearch-title");

  test("ranks the page's product first and narrows by kind chip", async ({ page, baseURL }) => {
    await openDocs(page, baseURL, "/docs/gizmo/usage");
    await search(page, "getting started");
    await expect(titles(page)).toHaveText(["Getting started with gizmo", "Getting started"]);
    await expect(page.locator(".wsearch-item").first().locator(".wsearch-where")).toHaveClass(/is-local/);

    const chips = page.locator(".wsearch-kind");
    await expect(chips).toHaveText(["CLI", "MCP server", "App", "Dev container feature"]);

    await chips.filter({ hasText: "App" }).click();
    await expect(chips.filter({ hasText: "App" })).toHaveAttribute("aria-pressed", "true");
    await expect(titles(page)).toHaveText(["Getting started"]);

    await chips.filter({ hasText: "CLI" }).click();
    await expect(titles(page), "two chips keep results of either kind").toHaveText(["Getting started with gizmo", "Getting started"]);

    await chips.filter({ hasText: "App" }).click();
    await expect(titles(page)).toHaveText(["Getting started with gizmo"]);

    await chips.filter({ hasText: "CLI" }).click();
    await expect(titles(page), "with no chip, every result").toHaveText(["Getting started with gizmo", "Getting started"]);
  });
});

test.describe("Copy as Markdown", () => {
  test("puts the title and the page body on the clipboard", async ({ context, page, baseURL }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openDocs(page, baseURL, "/docs/gadget/getting-started");
    const button = page.locator("[data-copy-markdown]");
    await button.click();
    await expect(button).toHaveText("Copied");
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text.startsWith("# Getting started\n\ngadget runs a sample service")).toBe(true);
    expect(text).toContain("## Start the service");
  });
});
