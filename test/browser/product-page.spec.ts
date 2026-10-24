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

/*
 * What each kind of product shows, and what it does not: the sections of the
 * page, the install blocks in view, and the hero's docs button, from the
 * fixture products. A full product has "What it does" and its media; a
 * feature entry has neither and shows its README.
 */
const SECTIONS = [
  {
    key: "widget",
    why: "a CLI with docs pages",
    sections: ["highlights", "install", "docs", "releases"],
    blocks: ["platforms"],
    docs: true,
    media: true,
    tour: false,
  },
  {
    key: "gadget",
    why: "an app with a console tour and no docs pages",
    sections: ["highlights", "install", "releases"],
    blocks: ["platforms"],
    docs: false,
    media: true,
    tour: true,
  },
  {
    key: "sprocket",
    why: "an MCP server",
    sections: ["highlights", "install", "docs", "releases"],
    blocks: ["mcp-server"],
    docs: true,
    media: true,
    tour: false,
  },
  {
    key: "harbor",
    why: "a dev container image",
    sections: ["highlights", "install", "docs", "releases"],
    blocks: ["devcontainer-image"],
    docs: true,
    media: true,
    tour: false,
  },
  {
    key: "gizmo",
    why: "an app that is also a dev container feature, with a video in its tour: only the first kind's block is in view",
    sections: ["highlights", "install", "docs", "releases"],
    blocks: ["platforms"],
    docs: true,
    media: true,
    tour: true,
  },
  {
    key: "lantern",
    why: "a feature entry",
    sections: ["install", "readme", "releases"],
    blocks: ["devcontainer-feature"],
    docs: false,
    media: false,
    tour: false,
  },
  {
    key: "beacon",
    why: "a feature entry with no release data",
    sections: ["install", "readme", "releases"],
    blocks: ["devcontainer-feature"],
    docs: false,
    media: false,
    tour: false,
  },
];

test.describe("sections for each kind", () => {
  for (const expected of SECTIONS) {
    test(`${expected.key}: ${expected.why}`, async ({ page, baseURL }) => {
      await openProduct(page, baseURL, expected.key);
      const sections = await page.locator("article.product > section[id]").evaluateAll((els) => els.map((e) => e.id));
      expect(sections, "the page's sections, in order").toEqual(expected.sections);
      for (const id of expected.sections) await expect(page.locator(`#${id}`)).toBeVisible();

      const blocks = await page
        .locator("#install [data-install-block]:visible")
        .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.installBlock));
      expect(blocks, "the install blocks in view").toEqual(expected.blocks);

      await expect(page.locator(".hero-actions a.button-primary")).toHaveCount(expected.docs ? 1 : 0);
      await expect(page.locator(".media-main")).toHaveCount(expected.media ? 1 : 0);
      await expect(page.locator(".media-tour")).toHaveCount(expected.tour ? 1 : 0);
    });
  }

  test("a product with one kind has no kind tabs; one with two kinds has a tab for each", async ({ page, baseURL }) => {
    await openProduct(page, baseURL, "harbor");
    await expect(page.locator('#install [role="tablist"][aria-label="Kind"]')).toHaveCount(0);
    await openProduct(page, baseURL, "gizmo");
    await expect(page.locator('#install [role="tablist"][aria-label="Kind"] > [role="tab"]')).toHaveText(["Install", "Dev container"]);
    await expect(page.locator('[data-install-block="devcontainer-feature"]')).toBeHidden();
  });

  test("the tables show only on the kinds that have them", async ({ page, baseURL }) => {
    await openProduct(page, baseURL, "sprocket");
    await expect(page.locator("#install table")).toBeVisible();
    await expect(page.locator("#install tbody tr")).toHaveCount(3);
    await expect(page.locator("#install tbody tr").last()).toContainText("update_record");
    await openProduct(page, baseURL, "harbor");
    await expect(page.locator("#install table")).toBeVisible();
    await expect(page.locator("#install tbody tr")).toHaveCount(3);
    await expect(page.locator("#install tbody tr").first()).toContainText("debian-bookworm");
    for (const key of ["widget", "gadget", "gizmo", "lantern", "beacon"]) {
      await openProduct(page, baseURL, key);
      await expect(page.locator("#install table"), key).toHaveCount(0);
    }
  });

  test("a feature entry shows its README and the link to the install block says what it adds", async ({ page, baseURL }) => {
    await openProduct(page, baseURL, "lantern");
    await expect(page.locator("#readme h2")).toHaveText(["README"]);
    await expect(page.locator("#readme .product-prose :is(h3, h4)")).toHaveText(["Lantern", "Example usage", "Options", "Releases", "Notes"]);
    await expect(page.locator(".hero-more")).toContainText("Add to devcontainer.json");
    await expect(page.locator(".hero-install")).toHaveCount(0);
    await openProduct(page, baseURL, "widget");
    await expect(page.locator("#readme")).toHaveCount(0);
    await expect(page.locator(".hero-more")).toContainText("Other install methods");
  });
});

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

/*
 * The video of gizmo's tour (a six second WebM, so WCAG 2.2.2 applies): it
 * plays on load unless the visitor prefers reduced motion, and a button
 * pauses and resumes it either way.
 */
const VIDEO = ".media-tour video";
const TOGGLE = ".media-tour [data-media-toggle]";

for (const [preference, playsOnLoad] of [
  ["no-preference", true],
  ["reduce", false],
] as const) {
  test.describe(`video with reducedMotion "${preference}"`, () => {
    test.use({ reducedMotion: preference });

    test(`${playsOnLoad ? "plays" : "does not play"} on load, muted and looped, and the button pauses and resumes it`, async ({ page, baseURL }) => {
      await openProduct(page, baseURL, "gizmo");
      const video = page.locator(VIDEO);
      const toggle = page.locator(TOGGLE);
      // The button is shown by the script that decided whether to play.
      await expect(toggle).toBeVisible();
      if (!playsOnLoad) {
        // An `autoplay` attribute starts the video only when it is in view and the browser has
        // buffered it, so read `paused` after both: until then it is true whatever the markup says.
        await video.scrollIntoViewIfNeeded();
        await video.evaluate((el: HTMLVideoElement) => {
          el.preload = "auto";
        });
        await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.readyState)).toBe(4);
        // The browser starts an in-view autoplay video after the frame that shows it.
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      }
      await expect(video).toHaveJSProperty("paused", !playsOnLoad);
      await expect(video).toHaveJSProperty("muted", true);
      await expect(video).toHaveJSProperty("loop", true);
      await expect(video).toHaveJSProperty("controls", false);
      await expect(toggle).toHaveAccessibleName(playsOnLoad ? /^Pause video:/ : /^Play video:/);
      await expect(toggle).toContainText(playsOnLoad ? "Pause" : "Play");
      await toggle.click();
      await expect(video).toHaveJSProperty("paused", playsOnLoad);
      await expect(toggle).toHaveAccessibleName(playsOnLoad ? /^Play video:/ : /^Pause video:/);
      await toggle.click();
      await expect(video).toHaveJSProperty("paused", !playsOnLoad);
    });

    test("the button is reached and pressed with the keyboard", async ({ page, baseURL }) => {
      await openProduct(page, baseURL, "gizmo");
      const toggle = page.locator(TOGGLE);
      await expect(toggle).toBeVisible();
      await toggle.focus();
      await expect(toggle).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page.locator(VIDEO)).toHaveJSProperty("paused", playsOnLoad);
      await page.keyboard.press("Space");
      await expect(page.locator(VIDEO)).toHaveJSProperty("paused", !playsOnLoad);
    });
  });
}

test.describe("video without script", () => {
  test.use({ javaScriptEnabled: false });

  test("does not play, and keeps its native controls and no button", async ({ page, baseURL }) => {
    await openProduct(page, baseURL, "gizmo");
    const video = page.locator(VIDEO);
    await expect(video).toHaveJSProperty("controls", true);
    await expect(video).toHaveJSProperty("paused", true);
    await expect(page.locator(TOGGLE)).toBeHidden();
  });
});

test.describe("page", () => {
  test("the header's Releases link goes to the page's Releases section", async ({ page, baseURL }) => {
    await openProduct(page, baseURL, "widget");
    await page.locator(".site-nav a", { hasText: "Releases" }).click();
    await page.waitForURL(/\/tools\/widget\/?#releases$/);
    await expect(page.locator("#releases")).toBeInViewport();
  });

  test("the header's Releases link goes to the Releases section, not to a README heading of that name", async ({ page, baseURL }) => {
    await openProduct(page, baseURL, "lantern");
    await expect(page.locator("#readme .product-prose h4", { hasText: "Releases" })).toHaveCount(1);
    await page.locator(".site-nav a", { hasText: "Releases" }).click();
    await page.waitForURL(/\/tools\/lantern\/?#releases$/);
    await expect(page.locator(":target")).toHaveJSProperty("tagName", "SECTION");
    await expect(page.locator("section#releases")).toBeInViewport();
  });

  test("a link in a README to one of its headings goes to that heading", async ({ page, baseURL }) => {
    await openProduct(page, baseURL, "lantern");
    await page.locator("#readme .product-prose a", { hasText: "Options" }).click();
    await page.waitForURL(/#readme--options$/);
    await expect(page.locator("#readme--options")).toBeInViewport();
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
