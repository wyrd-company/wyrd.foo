/*
 * The browser-test harness: Playwright Test against the built site. It starts
 * `astro preview` on a free port, serves dist/, and stops the server when the
 * run ends. The home page specs (home.spec.ts) run against a second server on
 * the home fixture build (dist-fixtures/home, `pnpm build:home-fixture`). The
 * harness tests (harness/) build variants of this config.
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
  /** The port of the home fixture server; without it there is no home project. */
  homePort?: number;
  /** The command that serves the home fixture on `homePort`. */
  homeCommand?: string;
  testDir?: string;
  testMatch?: string;
}

const HOME_SPEC = "**/home.spec.ts";

export function harnessConfig(options: HarnessOptions): PlaywrightTestConfig {
  const { port, homePort, testDir = ".", testMatch = "**/*.spec.ts" } = options;
  const origin = `http://127.0.0.1:${port}`;
  const homeOrigin = `http://127.0.0.1:${homePort}`;
  const server = (command: string, url: string) => ({
    command,
    cwd: ROOT,
    url,
    // A server already on the port is not ours, so it is not the built site.
    reuseExistingServer: false,
  });
  return defineConfig({
    testDir,
    testMatch,
    outputDir: `${ROOT}test-results`,
    forbidOnly: true,
    reporter: "list",
    globalSetup: fileURLToPath(new URL("./global-setup.ts", import.meta.url)),
    use: { baseURL: origin },
    projects: [
      { name: "site", testIgnore: HOME_SPEC, use: { browserName: "chromium" } },
      ...(homePort
        ? [
            {
              name: "home",
              testMatch: HOME_SPEC,
              use: { browserName: "chromium" as const, baseURL: homeOrigin },
            },
          ]
        : []),
    ],
    webServer: [
      server(options.command ?? `pnpm exec astro preview --host 127.0.0.1 --port ${port}`, origin),
      ...(homePort
        ? [
            server(
              options.homeCommand ??
                `pnpm exec astro preview --outDir dist-fixtures/home --host 127.0.0.1 --port ${homePort}`,
              homeOrigin,
            ),
          ]
        : []),
    ],
  });
}

/**
 * The run's ports. The main process picks them and the workers inherit them
 * through the environment, so every process of one run uses the same ports.
 */
export async function runPorts(): Promise<{ port: number; homePort: number }> {
  process.env.WYRD_BROWSER_PORT ??= String(await freePort());
  process.env.WYRD_BROWSER_HOME_PORT ??= String(await freePort());
  return {
    port: Number(process.env.WYRD_BROWSER_PORT),
    homePort: Number(process.env.WYRD_BROWSER_HOME_PORT),
  };
}
