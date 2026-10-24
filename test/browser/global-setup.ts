import { chromium } from "@playwright/test";

export const INSTALL_STEP = "pnpm exec playwright install chromium";

/**
 * Fail the run, naming the install step, when the browser is not installed.
 * A run that cannot start the browser must not pass by running nothing.
 */
export default async function globalSetup() {
  try {
    const browser = await chromium.launch();
    await browser.close();
  } catch (error) {
    if (error instanceof Error && /Executable doesn't exist/.test(error.message)) {
      throw new Error(`Chromium is not installed for the browser tests. Run: ${INSTALL_STEP}`, {
        cause: error,
      });
    }
    throw error;
  }
}
