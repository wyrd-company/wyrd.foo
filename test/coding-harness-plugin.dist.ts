// relationships: implements site
import { readFileSync } from "node:fs";
import { parse } from "node-html-parser";
import { expect, it } from "vitest";

it("builds plugin product, docs, releases, catalog and search metadata", () => {
  const root = parse(readFileSync("dist-fixtures/products/tools/compass/index.html", "utf8"));
  expect(root.querySelector('[data-pagefind-filter="kind"]')?.textContent).toBe("coding-harness-plugin");
  const block = root.querySelector('[data-install-block="coding-harness-plugin"]')!;
  expect(block.querySelector('[aria-selected="true"]')?.textContent.trim()).toBe("Another harness");
  expect(block.querySelector('[role="tabpanel"]:not([hidden]) pre')?.textContent).toBe("Follow the setup guide");
  expect(block.querySelector("table")).toBeNull();
  expect(readFileSync("dist-fixtures/products/index.html", "utf8")).toContain("Coding harness plugins");
  expect(readFileSync("dist-fixtures/products/docs/compass/overview/index.html", "utf8")).toContain("sample plugin");
  expect(readFileSync("dist-fixtures/products/tools/compass/releases/index.html", "utf8")).toContain("Compass");
});
