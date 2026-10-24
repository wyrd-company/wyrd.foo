import type { BrowserContext, Page, Response } from "@playwright/test";
import { docsOrigin, productsOrigin } from "./config";

export const THEME_KEY = "wyrd-theme";

export type Theme = "light" | "dark";

/**
 * The home page, one docs page and one product page cover the layouts. The
 * docs and product pages are on their fixture servers: the site build has no
 * v2 content of its own.
 */
export const HOME_PAGE = { name: "home page", path: "/" } as const;

export function pages() {
  return [
    HOME_PAGE,
    { name: "docs page", path: `${docsOrigin()}/docs/gadget/getting-started` },
    { name: "product page", path: `${productsOrigin()}/tools/widget/` },
  ] as const;
}

export const other = (theme: Theme): Theme => (theme === "light" ? "dark" : "light");

/**
 * Load a page of the site, failing unless it is the page asked for: a 200
 * response from the URL asked for, with the site's shell in it. A 404, a
 * redirect or a fallback page must not pass as the page.
 */
export async function openPage(
  page: Page,
  baseURL: string | undefined,
  path: string,
): Promise<Response> {
  const expected = new URL(path, baseURL).href;
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  return assertShellPage(page, response, expected);
}

export async function reloadPage(page: Page): Promise<Response> {
  const expected = page.url();
  const response = await page.reload({ waitUntil: "domcontentloaded" });
  return assertShellPage(page, response, expected);
}

async function assertShellPage(page: Page, response: Response | null, expected: string) {
  if (!response) throw new Error(`no response for ${expected}`);
  if (response.url() !== expected) {
    throw new Error(`asked for ${expected} and got ${response.url()} (a redirect)`);
  }
  if (response.status() !== 200) {
    throw new Error(`${expected} answered ${response.status()}, not 200`);
  }
  const marker = page.locator('meta[property="og:site_name"][content="Wyrd Tools"]');
  const toggles = page.locator("[data-theme-toggle]");
  if ((await marker.count()) === 0 || (await toggles.count()) === 0) {
    throw new Error(`${expected} is not a page of the site (no site shell in it)`);
  }
  return response;
}

/** Turn the HTTP cache off, so a reload fetches every response in full. */
export async function disableHttpCache(context: BrowserContext, page: Page) {
  const session = await context.newCDPSession(page);
  await session.send("Network.enable");
  await session.send("Network.setCacheDisabled", { cacheDisabled: true });
}

export interface ThemeWrite {
  theme: string | null;
  bodyExists: boolean;
}

declare global {
  interface Window {
    __themeWrites: ThemeWrite[];
    __systemEvents: number;
  }
}

/**
 * An init script, run before any script of the page: records every write of
 * `data-theme` and whether `<body>` existed when it was written, and counts
 * the change events of the `(prefers-color-scheme: light)` query.
 */
export function recordTheme() {
  window.__themeWrites = [];
  window.__systemEvents = 0;
  // A mutation observer reports at the end of the script that wrote, before
  // the parser goes on, so `body` is as it was when the script ran.
  new MutationObserver((records) => {
    for (const record of records) {
      window.__themeWrites.push({
        theme: (record.target as Element).getAttribute("data-theme"),
        bodyExists: document.body !== null,
      });
    }
  }).observe(document, { subtree: true, attributes: true, attributeFilter: ["data-theme"] });
  matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
    window.__systemEvents++;
  });
}

/** An init script that makes every storage write throw. */
export function failStorageWrites() {
  Storage.prototype.setItem = () => {
    throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
  };
}

export const theme = (page: Page) =>
  page.evaluate(() => document.documentElement.dataset.theme ?? null);

export const stored = (page: Page) => page.evaluate((key) => localStorage.getItem(key), THEME_KEY);

export const store = (page: Page, value: Theme) =>
  page.evaluate(([key, v]) => localStorage.setItem(key, v), [THEME_KEY, value]);

export const systemEvents = (page: Page) => page.evaluate(() => window.__systemEvents);

/** Change the system preference; the page's query reports one change event. */
export async function setSystemTheme(page: Page, scheme: Theme) {
  const before = await systemEvents(page);
  await page.emulateMedia({ colorScheme: scheme });
  // The browser reports media query changes when it renders the next frame,
  // before the animation frame callbacks run; two frames make sure it has.
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );
  const after = await systemEvents(page);
  if (after !== before + 1) {
    throw new Error(`the system change to ${scheme} gave ${after - before} change events, not 1`);
  }
}

/** The theme toggle, once the page's script has set it up. */
export async function readyToggle(page: Page) {
  const toggle = page.locator("[data-theme-toggle]:visible").first();
  // The script labels the button as its last step.
  await toggle.and(page.locator('[aria-label^="Switch to "]')).waitFor();
  return toggle;
}
