// ---
// relationships:
//   verifies: site
// ---
import { createMarkdownProcessor } from "@astrojs/markdown-remark";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("builds a Markdown file for every fixture product and feature entry", async () => {
  for (const key of ["widget", "gadget", "sprocket", "gizmo", "harbor", "lantern", "beacon"]) {
    const body = readFileSync(`dist-fixtures/products/tools/${key}.md`, "utf8");
    expect(body).toMatch(/^# /);
    expect(body).toContain("## Install");
    expect(body).toContain("## Releases");
    expect(body).not.toContain("<!DOCTYPE html>");
  }
  const widget = readFileSync("dist-fixtures/products/tools/widget.md", "utf8");
  expect(widget).toContain("getting-started");
  expect(widget).toContain("Latest: 1.4.0");
  expect(widget).toContain("Write the plan as one JSON document with `--json`.");
  expect(widget).not.toContain("Keep the input order when a folder holds files");
  const lantern = readFileSync("dist-fixtures/products/tools/lantern.md", "utf8");
  const processor = await createMarkdownProcessor();
  const readme = readFileSync("test/fixtures/product-content/lantern/README.md", "utf8");
  expect((await processor.render(lantern)).code).toContain(
    (await processor.render(readme)).code.replace(/^<h1[^>]*>.*?<\/h1>\n/, ""),
  );
});
