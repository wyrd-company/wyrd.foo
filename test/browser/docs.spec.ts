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

test.describe("sticky header", () => {
  const headerTop = (page: Page) =>
    page.evaluate(() => document.querySelector(".docs-header")!.getBoundingClientRect().top);

  test("stays at the top of the viewport while the page scrolls", async ({ page, baseURL }) => {
    await openDocs(page, baseURL, "/docs/gadget/getting-started");
    const header = page.locator("header.docs-header");
    const room = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    expect(room, "the page is long enough to scroll well past the header").toBeGreaterThan(400);
    await expect(header).toBeInViewport({ ratio: 1 });
    expect(await headerTop(page)).toBe(0);

    for (const to of [200, Math.floor(room / 2), room]) {
      await page.evaluate((y) => window.scrollTo(0, y), to);
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
      expect(await page.evaluate(() => scrollY), `scrolled to ${to}`).toBeGreaterThan(to - 2);
      expect(await headerTop(page), `header top at scroll ${to}`).toBe(0);
      await expect(header).toBeInViewport({ ratio: 1 });
      await expect(page.locator(".docs-switcher-button")).toBeInViewport();
    }
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
    // The click moves to the section: its heading is in view, just under the header.
    const position = () =>
      page.evaluate(() => ({
        heading: document.getElementById("start-the-service")!.getBoundingClientRect().top,
        header: document.querySelector(".docs-header")!.getBoundingClientRect().bottom,
      }));
    await expect.poll(async () => {
      const { heading, header } = await position();
      return heading >= header && heading < header + 40;
    }).toBe(true);
  });
});

test.describe("search", () => {
  async function search(page: Page, query: string) {
    await page.locator("[data-wsearch-open]").first().click();
    await page.locator(".wsearch-input").fill(query);
  }

  // Docs page results only: product pages (/tools/<key>/) are in the index too.
  const docsItems = (page: Page) => page.locator('.wsearch-item:has(a.wsearch-link[href^="/docs/"])');
  const titles = (page: Page) => docsItems(page).locator(".wsearch-title");

  test("ranks the page's product first and narrows by kind chip", async ({ page, baseURL }) => {
    await openDocs(page, baseURL, "/docs/gizmo/usage");
    await search(page, "getting started");
    await expect(titles(page)).toHaveText(["Getting started with gizmo", "Getting started"]);
    await expect(page.locator(".wsearch-item").first().locator(".wsearch-where"), "the first result of all").toHaveClass(/is-local/);

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

  // The two tests below pick queries where the page's product is NOT first on Pagefind's own score, so only the boost
  // (PRODUCT_BOOST in src/components/Search.astro) puts it first. The first-result checks of the test above hold
  // without the boost.
  const hrefs = (page: Page) => page.locator(".wsearch-link").evaluateAll((links) => links.map((a) => a.getAttribute("href")));

  test("ranks the page's own product page above another product's stronger docs page", async ({ page, baseURL }) => {
    // Unboosted: gadget's Install page (6.9) beats gizmo's product page (2.6).
    await openDocs(page, baseURL, "/docs/gizmo/usage");
    await search(page, "install");
    const first = page.locator(".wsearch-item").first();
    await expect(first.locator("a.wsearch-link")).toHaveAttribute("href", "/tools/gizmo/");
    await expect(first.locator(".wsearch-where")).toHaveClass(/is-local/);
    expect(await hrefs(page)).toContain("/docs/gadget/install/");
  });

  test("ranks the page's own docs above another product's stronger docs of the same title", async ({ page, baseURL }) => {
    // Unboosted: gizmo's Getting started (15.6) beats gadget's (14.7).
    await openDocs(page, baseURL, "/docs/gadget/install");
    await search(page, "getting started");
    await expect(page.locator(".wsearch-link").first()).toHaveAttribute("href", "/docs/gadget/getting-started/");
    expect((await hrefs(page)).slice(0, 2)).toEqual(["/docs/gadget/getting-started/", "/docs/gizmo/getting-started/"]);
  });
});

test.describe("Copy as Markdown", () => {
  const PAGE = "/docs/gadget/getting-started";
  const MARKDOWN = "**/docs/gadget/getting-started.md";
  const gadgetStart = (text: string) => text.startsWith("# Getting started\n\ngadget runs a sample service");

  /** Count the page's calls to the clipboard's write(), the call that takes a promise of the text. */
  const countClipboardWrites = (page: Page) =>
    page.addInitScript(() => {
      const write = Clipboard.prototype.write;
      (window as unknown as { clipboardWrites: number }).clipboardWrites = 0;
      Clipboard.prototype.write = function (...args) {
        (window as unknown as { clipboardWrites: number }).clipboardWrites++;
        return write.apply(this, args);
      };
    });

  test("puts the title and the page body on the clipboard", async ({ context, page, baseURL }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openDocs(page, baseURL, PAGE);
    const button = page.locator("[data-copy-markdown]");
    await button.click();
    await expect(button).toHaveText("Copied");
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(gadgetStart(text)).toBe(true);
    expect(text).toContain("## Start the service");
  });

  test("starts the clipboard write inside the click, before the Markdown has arrived", async ({ context, page, baseURL }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await countClipboardWrites(page);
    await openDocs(page, baseURL, PAGE);
    // The Markdown answer is held; a write that waits for it cannot have started.
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(MARKDOWN, async (route) => {
      await held;
      await route.continue();
    });
    try {
      const button = page.locator("[data-copy-markdown]");
      await button.click();
      await page.waitForFunction(() => (window as unknown as { clipboardWrites: number }).clipboardWrites === 1);
      await expect(button, "the label waits for the write to resolve").not.toHaveText("Copied");
    } finally {
      release();
    }
    await expect(page.locator("[data-copy-markdown]")).toHaveText("Copied");
    expect(gadgetStart(await page.evaluate(() => navigator.clipboard.readText()))).toBe(true);
  });

  // The two ways a browser can lack a clipboard item with a promise for its text.
  const WITHOUT_PROMISE_ITEMS = {
    "has no ClipboardItem": () => {
      Object.defineProperty(window, "ClipboardItem", { value: undefined, configurable: true });
    },
    "makes a ClipboardItem only from a Blob": () => {
      Object.defineProperty(window, "ClipboardItem", {
        configurable: true,
        value: class {
          constructor(items: Record<string, unknown>) {
            for (const value of Object.values(items)) {
              if (!(value instanceof Blob)) throw new TypeError("The provided value is not of type 'Blob'.");
            }
          }
        },
      });
    },
  };
  for (const [name, stub] of Object.entries(WITHOUT_PROMISE_ITEMS)) {
    test(`falls back to writing the fetched text when the browser ${name}`, async ({ context, page, baseURL }) => {
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
      await countClipboardWrites(page);
      await page.addInitScript(stub);
      await openDocs(page, baseURL, PAGE);
      const button = page.locator("[data-copy-markdown]");
      await button.click();
      await expect(button).toHaveText("Copied");
      expect(await page.evaluate(() => (window as unknown as { clipboardWrites: number }).clipboardWrites), "write() was not used").toBe(0);
      expect(gadgetStart(await page.evaluate(() => navigator.clipboard.readText()))).toBe(true);
    });
  }

  test("says Copy failed, and stays on the page, when the Markdown is not served", async ({ context, page, baseURL }) => {
    // The clipboard accepts the write, so the status is the only thing that can fail the copy.
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openDocs(page, baseURL, PAGE);
    // A body that would copy fine: only the status says it is not the page.
    await page.route(MARKDOWN, (route) => route.fulfill({ status: 500, contentType: "text/markdown", body: "# Server error\n" }));
    const button = page.locator("[data-copy-markdown]");
    await button.click();
    await expect(button).toHaveText("Copy failed");
    expect(new URL(page.url()).pathname).toBe(PAGE);
  });

  test("says Copy failed when the clipboard refuses the write", async ({ page, baseURL }) => {
    await page.addInitScript(() => {
      Clipboard.prototype.write = () => Promise.reject(new DOMException("refused", "NotAllowedError"));
    });
    await openDocs(page, baseURL, PAGE);
    const button = page.locator("[data-copy-markdown]");
    await button.click();
    await expect(button).toHaveText("Copy failed");
  });
});
