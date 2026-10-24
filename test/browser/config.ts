/*
 * The browser-test harness: Playwright Test against the built site. It starts
 * `astro preview` on a free port, serves dist/, and stops the server when the
 * run ends. The home page specs (home.spec.ts), the docs specs
 * (docs.spec.ts) and the product page specs (product-page.spec.ts) each run
 * against a server of their own on a fixture build (dist-fixtures/home,
 * `pnpm build:home-fixture`; dist-fixtures/docs, `pnpm build:docs-fixture`;
 * dist-fixtures/products, `pnpm build:product-fixture`). The harness tests
 * (harness/) build variants of this config.
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
  /** The port of the docs fixture server; without it there is no docs project. */
  docsPort?: number;
  /** The command that serves the docs fixture on `docsPort`. */
  docsCommand?: string;
  /** The port of the product page fixture server; without it there is no products project. */
  productsPort?: number;
  /** The command that serves the product page fixture on `productsPort`. */
  productsCommand?: string;
  testDir?: string;
  testMatch?: string;
}

/** A fixture build with its own server and the specs that run against it. */
interface Fixture {
  name: string;
  spec: string;
  outDir: string;
  port?: number;
  command?: string;
}

export function harnessConfig(options: HarnessOptions): PlaywrightTestConfig {
  const { port, testDir = ".", testMatch = "**/*.spec.ts" } = options;
  const origin = `http://127.0.0.1:${port}`;
  const fixtures: Fixture[] = [
    { name: "home", spec: "**/home.spec.ts", outDir: "dist-fixtures/home", port: options.homePort, command: options.homeCommand },
    { name: "docs", spec: "**/docs.spec.ts", outDir: "dist-fixtures/docs", port: options.docsPort, command: options.docsCommand },
    {
      name: "products",
      spec: "**/product-page.spec.ts",
      outDir: "dist-fixtures/products",
      port: options.productsPort,
      command: options.productsCommand,
    },
  ];
  const served = fixtures.filter((fixture) => fixture.port !== undefined);
  const fixtureOrigin = (fixture: Fixture) => `http://127.0.0.1:${fixture.port}`;
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
      { name: "site", testIgnore: fixtures.map((fixture) => fixture.spec), use: { browserName: "chromium" } },
      ...served.map((fixture) => ({
        name: fixture.name,
        testMatch: fixture.spec,
        use: { browserName: "chromium" as const, baseURL: fixtureOrigin(fixture) },
      })),
    ],
    webServer: [
      server(options.command ?? `pnpm exec astro preview --host 127.0.0.1 --port ${port}`, origin),
      ...served.map((fixture) =>
        server(
          fixture.command ??
            `pnpm exec astro preview --outDir ${fixture.outDir} --host 127.0.0.1 --port ${fixture.port}`,
          fixtureOrigin(fixture),
        ),
      ),
    ],
  });
}

/**
 * The run's ports. The main process picks them and the workers inherit them
 * through the environment, so every process of one run uses the same ports.
 */
export async function runPorts(): Promise<{ port: number; homePort: number; docsPort: number; productsPort: number }> {
  process.env.WYRD_BROWSER_PORT ??= String(await freePort());
  process.env.WYRD_BROWSER_HOME_PORT ??= String(await freePort());
  process.env.WYRD_BROWSER_DOCS_PORT ??= String(await freePort());
  process.env.WYRD_BROWSER_PRODUCTS_PORT ??= String(await freePort());
  return {
    port: Number(process.env.WYRD_BROWSER_PORT),
    homePort: Number(process.env.WYRD_BROWSER_HOME_PORT),
    docsPort: Number(process.env.WYRD_BROWSER_DOCS_PORT),
    productsPort: Number(process.env.WYRD_BROWSER_PRODUCTS_PORT),
  };
}

/** The origin of the docs fixture server of this run (set by runPorts). */
export function docsOrigin(): string {
  const port = process.env.WYRD_BROWSER_DOCS_PORT;
  if (!port) throw new Error("no docs fixture server in this run (WYRD_BROWSER_DOCS_PORT is not set)");
  return `http://127.0.0.1:${port}`;
}

/** The origin of the product page fixture server of this run (set by runPorts). */
export function productsOrigin(): string {
  const port = process.env.WYRD_BROWSER_PRODUCTS_PORT;
  if (!port) throw new Error("no product page fixture server in this run (WYRD_BROWSER_PRODUCTS_PORT is not set)");
  return `http://127.0.0.1:${port}`;
}
