/*
 * The home page in a browser, built from the fixture content in
 * test/fixtures/home-content (`pnpm build:home-fixture`): the kind tabs, the
 * filter, Copy, and the featured card on the browser's own clock.
 */
import { expect, test, type Page } from "@playwright/test";
import { assertSiteShell, openPage } from "./support";

test.use({ viewport: { width: 1440, height: 1200 } });

const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;

/** Open the fixture home page; a 200 page without the catalog is not it. */
async function openHome(page: Page, baseURL: string | undefined) {
  await openPage(page, baseURL, "/");
  if ((await page.locator("#catalog").count()) !== 1) {
    throw new Error("the page is not the fixture home page (no #catalog)");
  }
}

const rows = (page: Page) =>
  page
    .locator("[data-catalog-row]:visible")
    .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.catalogRow));

const featuredKeys = (page: Page) =>
  page
    .locator("[data-featured-slot] [data-featured-key]")
    .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.featuredKey));

/** Make the page's clock read `time`. */
const setClock = (page: Page, time: number) =>
  page.addInitScript(`{const t = ${time}; Date.now = () => t;}`);

test.describe("catalog", () => {
  test("shows every row, and a tab shows the rows of its kind", async ({ page, baseURL }) => {
    await openHome(page, baseURL);
    expect(await rows(page)).toEqual([
      "alpha-cli",
      "cinder-mcp",
      "beacon",
      "delta-image",
      "feature-one",
      "feature-three",
      "feature-two",
    ]);

    await page.locator('[data-catalog-tab="app"]').click();
    expect(await rows(page)).toEqual(["beacon"]);
    await expect(page.locator('[data-catalog-tab="app"]')).toHaveAttribute("aria-pressed", "true");

    await page.locator('[data-catalog-tab="devcontainer-feature"]').click();
    expect(await rows(page)).toEqual(["beacon", "feature-one", "feature-three", "feature-two"]);
    await expect(page.locator('[data-catalog-tab="app"]')).toHaveAttribute("aria-pressed", "false");
  });

  test("the filter narrows the rows of the tab, or of all", async ({ page, baseURL }) => {
    await openHome(page, baseURL);
    await page.locator('[data-catalog-tab="devcontainer-feature"]').click();
    await page.locator("[data-catalog-filter]").fill("three");
    expect(await rows(page), "within the tab").toEqual(["feature-three"]);
    await page.locator("[data-catalog-filter]").fill("feature three");
    expect(await rows(page), "every word must match").toEqual(["feature-three"]);

    await page.locator('[data-catalog-tab="all"]').click();
    await page.locator("[data-catalog-filter]").fill("Agent");
    expect(await rows(page), "by category, in any case").toEqual(["cinder-mcp", "beacon"]);

    await page.locator("[data-catalog-filter]").fill("zzzz");
    expect(await rows(page)).toEqual([]);
    await expect(page.locator("[data-catalog-empty]")).toBeVisible();

    await page.locator("[data-catalog-filter]").fill("");
    expect(await rows(page)).toHaveLength(7);
  });

  test("Copy writes the install command and stays on the page", async ({
    context,
    page,
    baseURL,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openHome(page, baseURL);
    const copy = page.locator('[data-catalog-row="alpha-cli"] [data-copy]');
    await copy.click();
    // The handler sets the label after the clipboard write finishes, so the
    // label comes first and the read after it.
    await expect(copy).toHaveText("Copied");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      "brew install example-org/tap/alpha-cli",
    );
    expect(page.url()).toBe(new URL("/", baseURL).href);
  });

  test("a click on a row elsewhere opens the product page", async ({ page, baseURL }) => {
    await openHome(page, baseURL);
    const loaded = page.waitForResponse(
      (response) => response.request().isNavigationRequest() && /\/tools\/beacon\/?$/.test(response.url()),
    );
    await page.locator('[data-catalog-row="beacon"] .home-row-tagline').click({ force: true });
    const response = await loaded;
    expect(response.status()).toBe(200);
    await page.waitForURL(response.url());
    // A 200 page is the product page only with the marker that page alone has.
    await assertSiteShell(page, response.url());
    await expect(page.locator('article.product[data-product="beacon"][data-page="product"]')).toHaveCount(1);
    await expect(page.locator("h1.hero-name")).toHaveText("beacon");
  });
});

test.describe("featured card", () => {
  test("the build's pick shows with the build's clock", async ({ page, baseURL }) => {
    await openHome(page, baseURL);
    expect(await featuredKeys(page)).toEqual(["cinder-mcp"]);
  });

  test("the build's pick shows without JavaScript, with every row", async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
    try {
      const page = await context.newPage();
      await openHome(page, baseURL);
      expect(await featuredKeys(page)).toEqual(["cinder-mcp"]);
      expect(await rows(page)).toHaveLength(7);
    } finally {
      await context.close();
    }
  });

  // After cinder-mcp's feature ends (2099-01-01) and with no release in the
  // last 14 days, the pick rotates by week through the stable products with
  // media, by key. The week is counted in whole weeks from Monday 1969-12-29.
  const ROTATION = ["alpha-cli", "cinder-mcp", "delta-image"];
  // The Sunday before 2099-06-01 is still the week before.
  for (const at of [
    "2099-05-31T23:59:59Z",
    "2099-06-01T00:00:00Z",
    "2099-06-08T00:00:00Z",
    "2099-06-15T00:00:00Z",
  ]) {
    test(`the browser's clock swaps the card: ${at}`, async ({ page, baseURL }) => {
      const now = Date.parse(at);
      const expected = ROTATION[Math.floor((now + 3 * DAY) / WEEK) % ROTATION.length];
      await setClock(page, now);
      await openHome(page, baseURL);
      expect(await featuredKeys(page)).toEqual([expected]);
    });
  }

  test("the three rotation weeks show three different cards", async ({ browser, baseURL }) => {
    const shown = new Set<string>();
    for (const day of ["2099-06-01", "2099-06-08", "2099-06-15"]) {
      const context = await browser.newContext({ baseURL });
      try {
        const page = await context.newPage();
        await setClock(page, Date.parse(`${day}T00:00:00Z`));
        await openHome(page, baseURL);
        for (const key of await featuredKeys(page)) shown.add(key!);
      } finally {
        await context.close();
      }
    }
    expect([...shown].sort()).toEqual(ROTATION);
  });

  // The build's card is the only candidate: a preview product with a feature
  // that ends at `until` and no release. The page's candidate list is
  // replaced with that one entry.
  const from = Date.parse("2026-10-01T00:00:00Z");
  const until = Date.parse("2026-10-15T00:00:00Z");
  const only = JSON.stringify([
    { key: "cinder-mcp", stable: false, hasMedia: true, featured: { from, until } },
  ]);
  const cases = [
    { label: "before the feature ends", now: until - 1, kept: true },
    { label: "when the feature ends", now: until, kept: false },
    { label: "after the feature ends", now: until + DAY, kept: false },
  ];
  for (const { label, now, kept } of cases) {
    test(`with no product to pick, the card ${kept ? "stays" : "is removed"} ${label}`, async ({
      page,
      baseURL,
    }) => {
      await setClock(page, now);
      let replaced = 0;
      await page.route(
        (url) => url.pathname === "/",
        async (route) => {
          const response = await route.fetch();
          const html = await response.text();
          const body = html.replace(
            /(<script type="application\/json" data-featured-candidates[^>]*>)[^<]*(<\/script>)/,
            `$1${only}$2`,
          );
          if (body !== html) replaced++;
          await route.fulfill({ response, body });
        },
      );
      await openHome(page, baseURL);
      expect(replaced, "the page's candidate list was replaced").toBe(1);

      const slot = page.locator("[data-home-featured]");
      if (kept) {
        expect(await featuredKeys(page)).toEqual(["cinder-mcp"]);
        await expect(slot).toBeVisible();
      } else {
        expect(await featuredKeys(page), "the card is removed").toEqual([]);
        await expect(slot, "the slot is hidden").toBeHidden();
        const width = await page
          .locator("#releases")
          .evaluate((e) => e.getBoundingClientRect().width);
        expect(width, "Recent releases takes the full width").toBeGreaterThan(1000);
      }
    });
  }
});
