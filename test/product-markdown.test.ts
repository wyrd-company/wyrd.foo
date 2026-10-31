// ---
// relationships:
//   verifies: site
// ---
import { unified } from "unified";
import remarkParse from "remark-parse";
import type { Nodes } from "mdast";
import { createMarkdownProcessor } from "@astrojs/markdown-remark";
import { parse as parseHtml } from "node-html-parser";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { toolFileSchema } from "../src/schema/index";
import { markdownFragment } from "../src/lib/markdown-fragment";
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

  it("preserves feature README Markdown and omits full-product sections", async () => {
    const readme = readFileSync("test/fixtures/product-content/lantern/README.md", "utf8");
    const result = productMarkdown("lantern", fixture("lantern"), [], readme);
    const processor = await createMarkdownProcessor();
    expect((await processor.render(result)).code).toContain(
      (await processor.render(readme)).code.replace(/^<h1[^>]*>.*?<\/h1>\n/, ""),
    );
    expect(readFileSync("test/fixtures/product-content/lantern/README.md", "utf8")).toBe(readme);
    expect(result).not.toMatch(/## (Media|What it does|Documentation)/);
    expect(result).toContain("# Lantern\n");
  });

  it("keeps full, collapsed, shortcut, image and footnote references local to each source", async () => {
    const source = (destination: string) => `
[Full][GuIde] [guide][] [guide] ![Image][guide] ![guide][] ![guide]

[guide]: https://example.org/${destination} "A title"
[GUIDE]: https://example.org/ignored

A note[^note].

[^note]: Note for ${destination}.

[unresolved] and \\[literal\\] and \`[guide]\`
`;
    const readme = source("readme");
    const latest = Object.freeze({
      version: "1.0.0",
      body: source("release") + "\n[unresolved]: https://example.org/release-only\n",
    });
    const processor = await createMarkdownProcessor();
    const output = parseHtml(
      (await processor.render(productMarkdown("sample", fixture("lantern"), [], readme, latest))).code,
    );
    for (const destination of ["readme", "release"]) {
      expect(output.querySelectorAll(`a[href="https://example.org/${destination}"]`)).toHaveLength(3);
      expect(output.querySelectorAll(`img[src="https://example.org/${destination}"]`)).toHaveLength(3);
    }
    expect(output.querySelectorAll('a[href="https://example.org/ignored"]')).toHaveLength(0);
    expect(output.querySelectorAll('a[href="https://example.org/release-only"]')).toHaveLength(1);
    expect(output.querySelectorAll("code").some((node) => node.text === "[guide]")).toBe(true);
    const notes = output.querySelectorAll("[data-footnote-ref]");
    expect(notes).toHaveLength(2);
    expect(new Set(notes.map((node) => node.getAttribute("href"))).size).toBe(2);
    for (const [index, destination] of ["readme", "release"].entries()) {
      const id = notes[index].getAttribute("href")!.slice(1);
      expect(output.getElementById(id)?.text).toContain(`Note for ${destination}.`);
    }
    expect(readme).toBe(source("readme"));
    expect(latest.body).toBe(source("release") + "\n[unresolved]: https://example.org/release-only\n");
  });

  it("preserves long labels and whitespace-normalized references", async () => {
    const label = "a".repeat(999);
    const source = `[Long][${label}] [Spaced][two\nwords]\n\n[${label}]: https://example.org/long\n[two words]: https://example.org/spaced\n`;
    const processor = await createMarkdownProcessor();
    const output = parseHtml(
      (await processor.render(productMarkdown("sample", fixture("lantern"), [], source))).code,
    );
    expect(output.querySelector('a[href="https://example.org/long"]')?.text).toBe("Long");
    expect(output.querySelector('a[href="https://example.org/spaced"]')?.text).toBe("Spaced");
  });

  it.each([
    ["backtick fence", "```sh\necho sample"],
    ["tilde fence", "~~~~sh\necho sample"],
    ["nested fence", "> ```sh\n> echo sample"],
    ["HTML comment", "<!-- sample"],
    ["processing instruction", "<?sample"],
    ["CDATA", "<![CDATA[sample"],
    ["declaration", "<!SAMPLE"],
    ["raw HTML", "<pre>sample"],
    ["nested pre probe", "<div>\n<pre>sample"],
    ["nested textarea", "<section>\n<textarea>sample"],
    ["nested script", "<div>\n<script>sample"],
    ["script escaped", "<div>\n<script><!-- sample"],
    ["script double escaped", "<div>\n<script><!-- <script>sample"],
    ["nested style", "<div>\n<style>sample"],
    ["nested comment", "<div>\n<!-- sample"],
    ["raw title", "<div>\n<title>sample"],
    ["raw xmp", "<div>\n<xmp>sample"],
    ["raw iframe", "<div>\n<iframe>sample"],
    ["foreign CDATA", "<svg><![CDATA[sample"],
    ["template raw text", "<template><textarea>sample"],
    ["open container", "<div>\n<span>sample"],
    ["HTML nonvoid slash", "<div>\n<textarea/>sample"],
    ["void before raw", '<div><img src="sample.png"><br><pre>sample'],
    ["quoted apparent closer", '<div data-end="</pre>">\n<pre>sample'],
    ["comment apparent closer", "<div><!-- </pre> -->\n<pre>sample"],
    ["script", "<script>sample"],
    ["style", "<style>sample"],
    ["textarea", "<textarea>sample"],
    ["indented code", "    echo sample"],
    ["list", "- sample"],
    ["table", "| sample |\n| --- |\n| value |"],
  ])("isolates EOF-scoped %s in both embedded documents", async (_name, fragment) => {
    const processor = await createMarkdownProcessor();
    const latest = Object.freeze({ version: "1.0.0", body: fragment });
    const result = productMarkdown(
      "sample",
      fixture("lantern"),
      [
        {
          section: null,
          groups: [
            {
              group: "Basics",
              pages: [{ title: "Introduction", slug: "intro" }],
            },
          ],
        },
      ],
      fragment,
      latest,
    );
    const output = parseHtml((await processor.render(result)).code);
    expect(output.querySelectorAll("h2").map((node) => node.text)).toEqual([
      "Install",
      "README",
      "Documentation",
      "Releases",
    ]);
    expect(output.querySelector('a[href="/docs/sample/intro"]')?.text).toBe("Introduction");
    expect(output.querySelector('a[href="/tools/sample/releases"]')?.text).toBe("All releases");
    expect(output.querySelectorAll("pre, code").every((node) => !node.text.includes("## Releases"))).toBe(
      true,
    );
    expect(latest.body).toBe(fragment);
    if (fragment.includes("echo sample")) {
      const codeValues = (source: string) => {
        const values: string[] = [];
        function walk(node: Nodes) {
          if (node.type === "code") values.push(node.value);
          if ("children" in node) node.children.forEach(walk);
        }
        walk(unified().use(remarkParse).parse(source));
        return values;
      };
      expect(codeValues(result).filter((value) => value === codeValues(fragment)[0])).toHaveLength(2);
    }
  });

  it.each([
    ["inline pre probe", "Text <pre>sample</pre> after.", "pre"],
    ["inline textarea probe", "Text <textarea>sample</textarea> after.", "textarea"],
    ["list pre probe", "- Text <pre>sample</pre> after.", "pre"],
    ["inline script", "Text <script>sample</script> after.", "script"],
    ["inline style", "Text <style>sample</style> after.", "style"],
    ["split blocks", "<div>\n<pre>sample\n\n</pre>\n</div>", "pre"],
    ["void and attributes", '<div><br><img src="sample.png"><pre data-end=">">sample</pre></div>', "pre"],
    ["raw apparent tags", "<div><textarea><pre>sample</textarea></div>", "textarea"],
    ["complete comment", "<div><!-- <pre> --><pre>sample</pre></div>", "pre"],
  ])("preserves complete %s in both documents", async (_name, fragment, selector) => {
    const processor = await createMarkdownProcessor();
    const standalone = parseHtml((await processor.render(fragment)).code);
    const result = productMarkdown("sample", fixture("lantern"), [], fragment, {
      version: "1.0.0",
      body: fragment,
    });
    const output = parseHtml((await processor.render(result)).code);
    expect(
      output
        .querySelectorAll(selector)
        .filter((node) => !node.classList.contains("astro-code"))
        .map((node) => node.outerHTML),
    ).toEqual([
      ...standalone.querySelectorAll(selector).map((node) => node.outerHTML),
      ...standalone.querySelectorAll(selector).map((node) => node.outerHTML),
    ]);
    expect(output.querySelector('a[href="/tools/sample/releases"]')?.text).toBe("All releases");
    expect(result).toContain(fragment);
    if (fragment.startsWith("Text")) expect(markdownFragment(fragment, "readme")).toBe(fragment);
  });

  it.each(["<!-->", "<!--->"])("preserves HTML abrupt-comment semantics for %s", async (fragment) => {
    const processor = await createMarkdownProcessor();
    const standalone = parseHtml((await processor.render(fragment)).code);
    const composed = parseHtml((await processor.render(markdownFragment(fragment, "readme"))).code);
    expect(composed.text).toBe(standalone.text);
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
