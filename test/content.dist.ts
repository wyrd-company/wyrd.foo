/*
 * The built site in dist/ has a product page and a docs entry for every
 * product folder in content/. Run after `pnpm build` (`pnpm check`).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "node-html-parser";
import { describe, expect, it } from "vitest";

const DIST = "dist";
const keys = readdirSync("content", { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

function title(path: string) {
  expect(existsSync(join(DIST, path)), path).toBe(true);
  return parse(readFileSync(join(DIST, path), "utf8")).querySelector("title")?.text ?? "";
}

describe("built site from content/", () => {
  it("has products to check", () => {
    expect(keys.length).toBe(12);
  });

  for (const key of keys) {
    const name = readFileSync(join("content", key, "tool.yaml"), "utf8").match(/^name: (.+)$/m)?.[1] ?? key;

    it(`${key}: has a product page`, () => {
      expect(title(`tools/${key}/index.html`).split(" — ")[0]).toBe(name);
    });

    it(`${key}: has a docs entry`, () => {
      expect(title(`docs/${key}/index.html`)).toBe(`${name} docs — Wyrd Tools`);
    });
  }
});
