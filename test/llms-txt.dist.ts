/*
 * Checks of /llms.txt built from the product fixture content
 * (test/fixtures/product-content, `pnpm build:product-fixture`, into
 * dist-fixtures/products/).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DIST = "dist-fixtures/products";
const SITE = "https://wyrd.foo";

function llms(): string {
  const file = join(DIST, "llms.txt");
  expect(existsSync(file), `${file}: run \`pnpm build:product-fixture\` first`).toBe(true);
  return readFileSync(file, "utf8");
}

/** The lines under the `## <heading>` line, up to the next heading. */
function section(text: string, heading: string): string[] {
  const lines = text.split("\n");
  const start = lines.indexOf(`## ${heading}`);
  expect(start, `no section ${heading}`).toBeGreaterThan(-1);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith("## "));
  return (end === -1 ? rest : rest.slice(0, end)).filter((line) => line !== "");
}

describe("/llms.txt built from the product fixture content", () => {
  it("opens with an H1 and a one-sentence blockquote summary", () => {
    const lines = llms().split("\n");
    expect(lines[0]).toBe("# Wyrd Tools");
    expect(lines[1]).toBe("");
    expect(lines[2]).toBe("> Single-purpose tools for developers and the agents that work alongside them.");
  });

  it("lists every product under Tools, features included, in catalog order", () => {
    expect(section(llms(), "Tools")).toEqual([
      `- [widget](${SITE}/tools/widget): Turn sample inputs into sample outputs.`,
      `- [gizmo](${SITE}/tools/gizmo): A sample board that runs on your machine or in a dev container.`,
      expect.stringMatching(new RegExp(`^- \\[Beacon\\]\\(${SITE}/tools/beacon\\): .+`)),
      `- [Compass](${SITE}/tools/compass): Sample instructions for an agent.`,
      `- [gadget](${SITE}/tools/gadget): A small sample console that you run.`,
      `- [harbor](${SITE}/tools/harbor): A sample base image for dev containers.`,
      expect.stringMatching(new RegExp(`^- \\[Lantern\\]\\(${SITE}/tools/lantern\\): .+`)),
      `- [sprocket](${SITE}/tools/sprocket): Let an agent read and update sample records.`,
    ]);
  });

  it("gives each product with docs a section of its pages in reading order", () => {
    const text = llms();
    expect(section(text, "widget docs")).toEqual([
      `- [Getting started](${SITE}/docs/widget/getting-started.md)`,
      `- [Configuration](${SITE}/docs/widget/configuration.md)`,
      `- [Commands](${SITE}/docs/widget/commands.md)`,
      `- [Troubleshooting](${SITE}/docs/widget/troubleshooting.md)`,
    ]);
    expect(section(text, "gizmo docs")).toEqual([
      `- [Overview](${SITE}/docs/gizmo/overview.md)`,
      `- [Running gizmo](${SITE}/docs/gizmo/running.md)`,
    ]);
  });

  it("has a docs section for each product with docs, and for none without", () => {
    const headings = llms().split("\n").filter((line) => line.startsWith("## "));
    expect(headings).toEqual(["## Tools", "## widget docs", "## gizmo docs", "## Compass docs", "## harbor docs", "## sprocket docs"]);
  });

  it("links only to Markdown endpoints that exist in the build", () => {
    const urls = [...llms().matchAll(/\]\((\S+\.md)\)/g)].map((m) => m[1]);
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url.startsWith(`${SITE}/docs/`), url).toBe(true);
      const file = join(DIST, new URL(url).pathname);
      expect(existsSync(file), file).toBe(true);
    }
  });

  it("holds no HTML", () => {
    expect(llms()).not.toMatch(/<[a-z!/]/i);
  });
});
