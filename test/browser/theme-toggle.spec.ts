/*
 * The theme toggle in a browser: the stored choice, the system preference
 * before and after a choice, and a storage that refuses writes.
 */
import { expect, test } from "@playwright/test";
import {
  failStorageWrites,
  openPage,
  other,
  PAGES,
  readyToggle,
  recordTheme,
  reloadPage,
  setSystemTheme,
  store,
  stored,
  theme,
  type Theme,
} from "./support";

const SYSTEMS: Theme[] = ["dark", "light"];
const PAGE = PAGES[0];

for (const system of SYSTEMS) {
  test.describe(`system ${system}`, () => {
    test.use({ colorScheme: system });

    test("the toggle stores the choice and a reload keeps it", async ({
      context,
      page,
      baseURL,
    }) => {
      await context.addInitScript(recordTheme);
      await openPage(page, baseURL, PAGE.path);
      expect(await stored(page), "nothing is stored before a choice").toBeNull();

      const toggle = await readyToggle(page);
      await toggle.click();
      expect(await theme(page)).toBe(other(system));
      expect(await stored(page), "the choice is stored").toBe(other(system));

      await reloadPage(page);
      expect(await theme(page), "the reload keeps the choice").toBe(other(system));

      await (await readyToggle(page)).click();
      expect(await stored(page), "the second choice is stored").toBe(system);
      await reloadPage(page);
      expect(await theme(page), "the reload keeps the second choice").toBe(system);
    });

    test("with no choice the page follows the system", async ({ context, page, baseURL }) => {
      await context.addInitScript(recordTheme);
      await openPage(page, baseURL, PAGE.path);
      await readyToggle(page);
      expect(await theme(page)).toBe(system);

      await setSystemTheme(page, other(system));
      expect(await theme(page), "follows the change").toBe(other(system));
      await setSystemTheme(page, system);
      expect(await theme(page), "follows the change back").toBe(system);
    });

    test("after a choice the page ignores system changes", async ({ context, page, baseURL }) => {
      await context.addInitScript(recordTheme);
      await openPage(page, baseURL, PAGE.path);
      await (await readyToggle(page)).click();
      const choice = other(system);
      expect(await theme(page)).toBe(choice);

      // The first change leaves the system at the choice; the second moves it
      // away, where a page that followed the system would change its theme.
      await setSystemTheme(page, choice);
      expect(await theme(page)).toBe(choice);
      await setSystemTheme(page, system);
      expect(await theme(page), "ignores the change away from the choice").toBe(choice);
    });

    test("a choice stored before the page loaded ignores system changes", async ({
      context,
      page,
      baseURL,
    }) => {
      await context.addInitScript(recordTheme);
      await openPage(page, baseURL, PAGE.path);
      const choice = other(system);
      await store(page, choice);
      await reloadPage(page);
      await readyToggle(page);
      expect(await theme(page)).toBe(choice);

      await setSystemTheme(page, choice);
      expect(await theme(page)).toBe(choice);
      await setSystemTheme(page, system);
      expect(await theme(page), "ignores the change away from the choice").toBe(choice);
    });

    test("when storage writes fail the choice holds for the page's life", async ({
      context,
      page,
      baseURL,
    }) => {
      await context.addInitScript(recordTheme);
      await context.addInitScript(failStorageWrites);
      await openPage(page, baseURL, PAGE.path);
      const refused = await page.evaluate(() => {
        try {
          localStorage.setItem("probe", "1");
          return false;
        } catch {
          return true;
        }
      });
      expect(refused, "the storage refuses writes").toBe(true);

      await (await readyToggle(page)).click();
      const choice = other(system);
      expect(await theme(page)).toBe(choice);
      expect(await stored(page), "nothing was stored").toBeNull();

      await setSystemTheme(page, choice);
      expect(await theme(page)).toBe(choice);
      await setSystemTheme(page, system);
      expect(await theme(page), "ignores the change away from the choice").toBe(choice);
      await setSystemTheme(page, choice);
      expect(await theme(page), "and the change back").toBe(choice);
    });
  });
}
