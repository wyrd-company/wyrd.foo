/*
 * The browser-test harness: Playwright Test against the built site. It starts
 * `astro preview` on a free port, serves dist/, and stops the server when the
 * run ends. The harness tests (harness/) build variants of this config.
 */
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { defineConfig, type PlaywrightTestConfig } from "@playwright/test";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** A port nothing listens on now. */
export async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as { port: number };
  await new Promise((resolve) => server.close(resolve));
  return port;
}

export interface HarnessOptions {
  port: number;
  /** The command that serves the site on `port`. */
  command?: string;
  testDir?: string;
  testMatch?: string;
}

export function harnessConfig(options: HarnessOptions): PlaywrightTestConfig {
  const { port, testDir = ".", testMatch = "**/*.spec.ts" } = options;
  const origin = `http://127.0.0.1:${port}`;
  return defineConfig({
    testDir,
    testMatch,
    outputDir: `${ROOT}test-results`,
    forbidOnly: true,
    reporter: "list",
    globalSetup: fileURLToPath(new URL("./global-setup.ts", import.meta.url)),
    use: { baseURL: origin },
    projects: [{ name: "chromium", use: { browserName: "chromium" } }],
    webServer: {
      command: options.command ?? `pnpm exec astro preview --host 127.0.0.1 --port ${port}`,
      cwd: ROOT,
      url: origin,
      // A server already on the port is not ours, so it is not the built site.
      reuseExistingServer: false,
    },
  });
}

/**
 * The run's port. The main process picks it and the workers inherit it
 * through the environment, so every process of one run uses the same port.
 */
export async function runPort(): Promise<number> {
  process.env.WYRD_BROWSER_PORT ??= String(await freePort());
  return Number(process.env.WYRD_BROWSER_PORT);
}
