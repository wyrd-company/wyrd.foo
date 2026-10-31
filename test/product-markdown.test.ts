// ---
// relationships:
//   verifies: site
// ---
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { toolFileSchema } from "../src/schema/index";
import { productMarkdown } from "../src/lib/product-markdown";
import { APT_SETUP, RPM_SETUP } from "../src/lib/install-blocks";

const fixture = (key: string) =>
  toolFileSchema.parse(parse(readFileSync(`test/fixtures/product-content/${key}/tool.yaml`, "utf8")));

describe("product Markdown", () => {
  it("includes facts, media, all install methods, ordered docs and the latest changelog", () => {
    const tool = fixture("widget");
    const result = productMarkdown(
      "widget",
      tool,
      [
        {
          section: "Start",
          groups: [
            {
              group: "Basics",
              pages: [{ slug: "intro", title: "Introduction" }],
            },
          ],
        },
      ],
      undefined,
      {
        version: "1.4.0",
        body: "## 1.4.0\n\n### Features\n\n- Sample change.\n",
      },
    );
    expect(result).toContain("# widget\n");
    expect(result).toContain("Status: Stable");
    expect(result).toContain("Latest: 1.4.0 · 2026-09-30");
    expect(result).toContain("/assets/widget/assets/terminal.png");
    expect(result).toContain("### Start\n\n#### Basics\n\n- [Introduction](</docs/widget/intro>)");
    expect(result).toContain(APT_SETUP.join("\n"));
    expect(result).toContain(RPM_SETUP.join("\n"));
    if (tool.kinds[0].kind === "cli")
      for (const entry of tool.kinds[0].install) expect(result).toContain(entry.command);
    expect(result).toContain("## 1.4.0\n\n### Features\n\n- Sample change.");
    expect(result).toContain("[All releases](</tools/widget/releases>)");
  });

  it("includes every kind of a product, video links, MCP tools and image tags", () => {
    const mixed = productMarkdown("gizmo", fixture("gizmo"), []);
    expect(mixed).toContain('"features": {\n  "ghcr.io/example-org/gizmo/gizmo:2": {}');
    expect(mixed).toContain("[A recording of the sample board.](</assets/gizmo/assets/demo.webm>)");
    const mcp = productMarkdown("sprocket", fixture("sprocket"), []);
    expect(mcp).toContain("Claude Code marketplace (Plugin)");
    expect(mcp).toContain("codex plugin install example-org/sprocket");
    expect(mcp).toContain("| update\\_record | Updates one field of a sample record. | Writes |");
    expect(mcp).toContain("No releases yet.");
    expect(mcp).not.toContain("## Documentation");
    const image = productMarkdown("harbor", fixture("harbor"), []);
    expect(image).toContain('"image": "ghcr.io/example-org/harbor:0"');
    expect(image).toContain("| 0.9.0 | debian-bookworm | amd64, arm64 |");
  });

  it("preserves feature README Markdown and omits full-product sections", () => {
    const readme = readFileSync("test/fixtures/product-content/lantern/README.md", "utf8");
    const result = productMarkdown("lantern", fixture("lantern"), [], readme);
    expect(result).toContain(readme.trim());
    expect(result).not.toMatch(/## (Media|What it does|Documentation)/);
    expect(result).toContain("# Lantern\n");
  });

  it("escapes metadata and uses a code fence longer than any in the command", () => {
    const tool = fixture("gadget");
    tool.name = "Sample [tool]";
    if (tool.kinds[0].kind === "app") tool.kinds[0].install[0].command = "echo '```'\necho done";
    const result = productMarkdown("sample", tool, []);
    expect(result).toContain("# Sample \\[tool\\]");
    expect(result).toContain("````\necho '```'\necho done\n````");
  });
});
