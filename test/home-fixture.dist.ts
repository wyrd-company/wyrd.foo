/*
 * Checks of the home page built from the fixture content in
 * test/fixtures/home-content (`pnpm build:fixtures`): tab membership, the
 * feature-entry exclusions, marks and the build's featured pick.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse, type HTMLElement } from "node-html-parser";
import { beforeAll, describe, expect, it } from "vitest";

const DIST = "dist-fixtures/home";
const FEATURES = ["feature-one", "feature-three", "feature-two"];

let root: HTMLElement;
beforeAll(() => {
  const file = join(DIST, "index.html");
  expect(existsSync(file), `${file}: run \`pnpm build:fixtures\` first`).toBe(true);
  root = parse(readFileSync(file, "utf8"));
  // The page under test is the fixture home page, not a fallback.
  expect(root.querySelector("#catalog")).not.toBeNull();
  expect(root.querySelectorAll("[data-catalog-row]").length).toBeGreaterThan(0);
});

const row = (key: string) => {
  const el = root.querySelector(`[data-catalog-row="${key}"]`);
  if (!el) throw new Error(`no catalog row ${key}`);
  return el;
};
const rowKeys = () => root.querySelectorAll("[data-catalog-row]").map((r) => r.getAttribute("data-catalog-row"));
const membersOf = (kind: string) =>
  root
    .querySelectorAll("[data-catalog-row]")
    .filter((r) => (r.getAttribute("data-kinds") ?? "").split(" ").includes(kind))
    .map((r) => r.getAttribute("data-catalog-row"));
const tabCount = (id: string) =>
  Number(root.querySelector(`[data-catalog-tab="${id}"] [data-catalog-count]`)?.text);
/** The built file a site URL points at. */
const built = (url: string) => join(DIST, decodeURI(new URL(url, "https://wyrd.foo").pathname));

describe("home page catalog", () => {
  it("has one row per product and per feature entry, in catalog order", () => {
    expect(rowKeys()).toEqual(["alpha-cli", "cinder-mcp", "beacon", "delta-image", ...FEATURES]);
    expect(tabCount("all")).toBe(7);
  });

  it("puts a multi-kind product under each of its kinds' tabs", () => {
    expect(row("beacon").getAttribute("data-kinds")).toBe("app devcontainer-feature");
    expect(membersOf("app")).toEqual(["beacon"]);
    expect(membersOf("devcontainer-feature")).toEqual(["beacon", ...FEATURES]);
    expect(tabCount("app")).toBe(1);
    expect(tabCount("devcontainer-feature")).toBe(4);
  });

  it("gives every tab the count of its rows", () => {
    for (const tab of root.querySelectorAll("[data-catalog-tab]")) {
      const id = tab.getAttribute("data-catalog-tab")!;
      const expected = id === "all" ? rowKeys().length : membersOf(id).length;
      expect(tabCount(id), id).toBe(expected);
    }
  });

  it("shows the first kind's badge and get-it command", () => {
    const beacon = row("beacon");
    expect(beacon.querySelectorAll(".kind-chip").map((c) => c.getAttribute("data-kind"))).toEqual(["app"]);
    expect(beacon.querySelector("[data-copy]")?.getAttribute("data-copy")).toBe("docker run ghcr.io/example-org/beacon:0.3");
    expect(beacon.querySelector(".home-row-getit code")?.text).toBe("docker run ghcr.io/example-org/beacon:0.3");
  });

  it("shows the logo where there is one, and the monogram where there is none", () => {
    const logo = row("alpha-cli").querySelector(".product-mark img")?.getAttribute("src");
    expect(logo).toBe("/assets/alpha-cli/assets/logo.svg");
    expect(existsSync(built(logo!))).toBe(true);
    const imgs = row("cinder-mcp").querySelectorAll(".product-mark img").map((i) => i.getAttribute("src")!);
    expect(imgs).toEqual(["/assets/cinder-mcp/assets/logo.svg", "/assets/cinder-mcp/assets/logo-dark.svg"]);
    for (const src of imgs) expect(existsSync(built(src)), src).toBe(true);
    expect(row("beacon").querySelector(".product-mark")).toBeNull();
    expect(row("beacon").querySelector(".monogram")?.text).toBe("B");
  });

  it("links Docs only for products with docs pages", () => {
    expect(row("alpha-cli").querySelector(".home-row-docs-link")?.getAttribute("href")).toBe("/docs/alpha-cli/");
    expect(row("delta-image").querySelector(".home-row-docs-link")).toBeNull();
    expect(row("feature-one").querySelector(".home-row-docs-link")).toBeNull();
  });

  it("links each row to its product page", () => {
    expect(row("feature-two").querySelector(".home-row-link")?.getAttribute("href")).toBe("/tools/feature-two");
  });
});

describe("home page recent releases", () => {
  it("links each entry to its product's releases page, then all releases", () => {
    const box = root.querySelector("#releases")!;
    expect(box.querySelectorAll("[data-release-key]").map((r) => r.getAttribute("href"))).toEqual([
      "/tools/beacon/releases",
      "/tools/alpha-cli/releases",
      "/tools/cinder-mcp/releases",
    ]);
    expect(box.querySelector(".home-releases-all")?.getAttribute("href")).toBe("/releases");
    expect(box.querySelector(".home-releases-all")?.text.trim()).toBe("All releases →");
  });

  it("lists products newest first and leaves out feature entries", () => {
    const releases = root.querySelectorAll("#releases [data-release-key]").map((r) => r.getAttribute("data-release-key"));
    expect(releases).toEqual(["beacon", "alpha-cli", "cinder-mcp"]);
  });

  it("shows the mark, the name and kind · version · date", () => {
    const beacon = root.querySelector('#releases [data-release-key="beacon"]')!;
    expect(beacon.querySelector(".monogram")?.text).toBe("B");
    expect(beacon.querySelector(".home-release-name")?.text).toBe("beacon");
    expect(beacon.querySelector(".home-release-meta")?.text.replace(/\s+/g, " ").trim()).toBe("App · 0.3.1 · 10 Oct 2026");
    expect(root.querySelector('#releases [data-release-key="alpha-cli"] .product-mark img')?.getAttribute("src")).toBe(
      "/assets/alpha-cli/assets/logo.svg",
    );
  });
});

describe("home page featured card", () => {
  const slot = () => root.querySelector("[data-featured-slot]")!;

  it("writes the build's pick into the HTML", () => {
    const card = slot().querySelector("[data-featured-key]");
    expect(card?.getAttribute("data-featured-key")).toBe("cinder-mcp");
    expect(card?.querySelector(".product-mark img")?.getAttribute("src")).toBe("/assets/cinder-mcp/assets/logo.svg");
    const media = card?.querySelector(".featured-media img")?.getAttribute("src");
    expect(media).toBe("/assets/cinder-mcp/assets/demo.png");
    expect(existsSync(built(media!))).toBe(true);
  });

  it("offers the browser every product but no feature entry", () => {
    const data = root.querySelector("[data-featured-candidates]")!;
    const keys = (JSON.parse(data.text) as { key: string }[]).map((c) => c.key).sort();
    expect(keys).toEqual(["alpha-cli", "beacon", "cinder-mcp", "delta-image"]);
    const templates = root
      .querySelectorAll("template[data-featured-template]")
      .map((t) => t.getAttribute("data-featured-template"))
      .sort();
    expect(templates).toEqual(["alpha-cli", "beacon", "delta-image"]);
  });

  it("links Get started to the product's docs, or its install section", () => {
    expect(slot().querySelector(".featured-cta")?.getAttribute("href")).toBe("/docs/cinder-mcp/");
    const delta = root.querySelector('template[data-featured-template="delta-image"]')!;
    expect(delta.querySelector(".featured-cta")?.getAttribute("href")).toBe("/tools/delta-image#install");
  });
});
