/*
 * The real browser config (test/browser/playwright.config.ts) is strict about
 * fixtures: a fixture row with no port fails the run, because its specs would
 * be skipped while the run passes. It must not set `optionalFixtures`, which
 * only the harness tests' inner runs set (test/browser/harness.spec.ts).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HarnessOptions } from "./browser/config";

const calls: HarnessOptions[] = [];

vi.mock("./browser/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./browser/config")>();
  return {
    ...actual,
    harnessConfig: (options: HarnessOptions) => {
      calls.push(options);
      return actual.harnessConfig(options);
    },
  };
});

const PORT_VARIABLES = ["WYRD_BROWSER_PORT", "WYRD_BROWSER_HOME_PORT", "WYRD_BROWSER_DOCS_PORT", "WYRD_BROWSER_PRODUCTS_PORT"];
let saved: Record<string, string | undefined>;

beforeEach(() => {
  calls.length = 0;
  saved = Object.fromEntries(PORT_VARIABLES.map((name) => [name, process.env[name]]));
  for (const name of PORT_VARIABLES) delete process.env[name];
  vi.resetModules();
});

afterEach(() => {
  for (const name of PORT_VARIABLES) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

/** Load the real config as Playwright does, and take the options it hands to the harness. */
async function realConfig() {
  const { default: config } = await import("./browser/playwright.config");
  expect(calls).toHaveLength(1);
  return { config, options: calls[0] };
}

describe("the real browser config", () => {
  it("does not set optionalFixtures", async () => {
    const { options } = await realConfig();
    expect(Object.keys(options)).not.toContain("optionalFixtures");
    expect(options.optionalFixtures).toBeUndefined();
  });

  it("gives every fixture a port, so each has a project and a server", async () => {
    const { config, options } = await realConfig();
    for (const port of [options.homePort, options.docsPort, options.productsPort]) expect(port).toEqual(expect.any(Number));
    expect(config.projects?.map((project) => project.name)).toEqual(["site", "home", "docs", "products"]);
    expect(config.webServer).toHaveLength(4);
  });

  it("fails a fixture row with no port, with the options it really passes", async () => {
    const { options } = await realConfig();
    const { harnessConfig } = await vi.importActual<typeof import("./browser/config")>("./browser/config");
    for (const [name, key] of [
      ["home", "homePort"],
      ["docs", "docsPort"],
      ["products", "productsPort"],
    ] as const) {
      expect(() => harnessConfig({ ...options, [key]: undefined }), name).toThrow(`no port for the fixture server of: ${name}`);
    }
    expect(() => harnessConfig(options)).not.toThrow();
  });
});
