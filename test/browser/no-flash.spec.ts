/*
 * The theme is set before the first paint: for every combination of system
 * preference and stored choice, `data-theme` is written once, while the
 * document has no <body>, to the stored choice or else the system preference.
 */
import { expect, test } from "@playwright/test";
import {
  disableHttpCache,
  openPage,
  PAGES,
  recordTheme,
  reloadPage,
  store,
  type Theme,
} from "./support";

const SYSTEMS: Theme[] = ["dark", "light"];
const CHOICES: (Theme | null)[] = [null, "dark", "light"];

for (const { name, path } of PAGES) {
  for (const system of SYSTEMS) {
    test.describe(`${name}, system ${system}`, () => {
      test.use({ colorScheme: system });

      for (const choice of CHOICES) {
        test(`${choice ? `stored ${choice}` : "no stored choice"}: the theme is set before <body>`, async ({
          context,
          page,
          baseURL,
        }) => {
          const expected = choice ?? system;
          await context.addInitScript(recordTheme);
          await disableHttpCache(context, page);
          await openPage(page, baseURL, path);
          if (choice) await store(page, choice);

          const statuses: [string, number][] = [];
          page.on("response", (r) => statuses.push([r.url(), r.status()]));
          await reloadPage(page);
          await page.waitForLoadState("load");

          const writes = await page.evaluate(() => window.__themeWrites);
          expect(writes, "one write of data-theme, before <body> exists").toEqual([
            { theme: expected, bodyExists: false },
          ]);
          expect(statuses.length, "the reload fetched the page and its files").toBeGreaterThan(1);
          expect(
            statuses.filter(([, status]) => status !== 200),
            "every response of the reload is a full 200 (no 304)",
          ).toEqual([]);
        });
      }
    });
  }
}
