// ---
// relationships:
//   verifies: site
// ---
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("builds a Markdown file for every fixture product and feature entry", () => {
  for (const key of ["widget", "gadget", "sprocket", "gizmo", "harbor", "lantern", "beacon"]) {
    const body = readFileSync(`dist-fixtures/products/tools/${key}.md`, "utf8");
    expect(body).toMatch(/^# /);
    expect(body).toContain("## Install");
    expect(body).toContain("## Releases");
    expect(body).not.toContain("<!DOCTYPE html>");
  }
  const widget = readFileSync("dist-fixtures/products/tools/widget.md", "utf8");
  expect(widget).toContain("getting-started");
  expect(widget).toContain("## 1.4.0");
  expect(widget).not.toContain("## 1.3.1");
  const lantern = readFileSync("dist-fixtures/products/tools/lantern.md", "utf8");
  expect(lantern).toContain(readFileSync("test/fixtures/product-content/lantern/README.md", "utf8").trim());
});
