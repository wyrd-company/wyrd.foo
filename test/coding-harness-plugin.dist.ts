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
  const rows = block.querySelectorAll("table tbody tr").map((row) => row.querySelectorAll("td").map((cell) => cell.textContent.trim()));
  expect(rows).toEqual([
    ["Hook", "SessionStart", "Loads the sample instructions when a session starts.", "All"],
    ["Skill", "sample-review", "Reviews a change against the sample conventions.", "Example harness"],
  ]);
  expect(block.querySelectorAll("table thead th").map((cell) => cell.textContent.trim())).toEqual([
    "Element", "Name", "What it does", "Harnesses",
  ]);
  expect(block.querySelector("#install-plugin-provides")?.textContent).toBe("What the plugin provides");
  expect(root.querySelector(".media-main")).not.toBeNull();
  expect(readFileSync("dist-fixtures/products/index.html", "utf8")).toContain("Coding harness plugins");
  expect(readFileSync("dist-fixtures/products/docs/compass/overview/index.html", "utf8")).toContain("sample plugin");
  expect(readFileSync("dist-fixtures/products/tools/compass/releases/index.html", "utf8")).toContain("Compass");
});

it("builds a plugin product with no media without a media section or empty containers", () => {
  const root = parse(readFileSync("dist-fixtures/products/tools/quill/index.html", "utf8"));
  expect(root.querySelector("h1.hero-name")?.textContent).toBe("Quill");
  expect(root.querySelector(".media-main, .media-tour, dialog.media-modal")).toBeNull();
  expect(root.querySelector("#highlights")).not.toBeNull();
  expect(root.querySelector('[data-install-block="coding-harness-plugin"] table tbody tr td code')?.textContent).toBe("SessionStart");
  expect(readFileSync("dist-fixtures/products/tools/quill.md", "utf8")).not.toContain("## Media");
});
