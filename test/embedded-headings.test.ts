import { createMarkdownProcessor } from "@astrojs/markdown-remark";
import { describe, expect, it } from "vitest";
import { embeddedUnit, nestHeadings, rehypeEmbeddedHeadings } from "../src/lib/embedded-headings";

type Node = { type: string; tagName?: string; properties?: Record<string, unknown>; children?: Node[] };
const el = (tagName: string, properties: Record<string, unknown> = {}, children: Node[] = []): Node => ({ type: "element", tagName, properties, children });
const root = (...children: Node[]): Node => ({ type: "root", children });
const tags = (tree: Node) => tree.children!.filter((n) => /^h\d$/.test(n.tagName ?? "")).map((n) => `${n.tagName}#${n.properties?.id}`);

describe("embeddedUnit", () => {
  it("is the README or the changelog of a product folder, and nothing else", () => {
    const at = (path: string) => embeddedUnit(path, "/work/content");
    expect(at("/work/content/lantern/README.md")).toBe("readme");
    expect(at("/work/content/lantern/CHANGELOG.md")).toBe("changelog");
    expect(at("/work/content/widget/docs/CHANGELOG.md"), "the docs changelog is a docs page").toBeUndefined();
    expect(at("/work/content/widget/docs/getting-started.md")).toBeUndefined();
    expect(at("/work/content/README.md")).toBeUndefined();
    expect(at("/work/content/widget/notes.md")).toBeUndefined();
    expect(embeddedUnit(undefined, "/work/content")).toBeUndefined();
  });

  it("is not a file name that the units object inherits", () => {
    for (const name of ["constructor", "toString", "hasOwnProperty", "__proto__", "valueOf"]) {
      expect(embeddedUnit(`/work/content/lantern/${name}`, "/work/content"), name).toBeUndefined();
    }
  });

  it("is not a README.md outside the content root", () => {
    const at = (path: string) => embeddedUnit(path, "/work/content");
    expect(at("/work/README.md"), "one level above the root").toBeUndefined();
    expect(at("/work/content/../README.md"), "written through the root").toBeUndefined();
    expect(at("/work/other/README.md"), "a folder beside the root").toBeUndefined();
    expect(at("/work/content-two/README.md"), "a folder whose name starts with the root's").toBeUndefined();
    expect(at("/work/CHANGELOG.md")).toBeUndefined();
    expect(at("/work/content/lantern/README.md"), "the control: inside the root").toBe("readme");
  });

  it("reads the content root relative to the working folder, as WYRD_CONTENT_DIR is written", () => {
    expect(embeddedUnit(`${process.cwd()}/test/fixtures/product-content/lantern/README.md`, "test/fixtures/product-content")).toBe("readme");
  });
});

describe("nestHeadings", () => {
  it("makes the top level an h3 and moves each deeper level by the same amount", () => {
    const tree = root(el("h1", { id: "a" }), el("h2", { id: "b" }), el("h3", { id: "c" }), el("h2", { id: "d" }));
    nestHeadings(tree, "readme");
    expect(tags(tree)).toEqual(["h3#readme--a", "h4#readme--b", "h5#readme--c", "h4#readme--d"]);
  });

  it("takes the document's own top level, not h1", () => {
    const tree = root(el("h2", { id: "a" }), el("h3", { id: "b" }));
    nestHeadings(tree, "changelog");
    expect(tags(tree)).toEqual(["h3#changelog--a", "h4#changelog--b"]);
  });

  it("stops at h6", () => {
    const tree = root(...[1, 2, 3, 4, 5, 6].map((n) => el(`h${n}`, { id: `x${n}` })));
    nestHeadings(tree, "readme");
    expect(tags(tree)).toEqual(["h3#readme--x1", "h4#readme--x2", "h5#readme--x3", "h6#readme--x4", "h6#readme--x5", "h6#readme--x6"]);
  });

  it("reaches a heading inside another element, and leaves one with no id without one", () => {
    const tree = root(el("div", {}, [el("h1", {}, [])]));
    nestHeadings(tree, "readme");
    expect(tree.children![0].children![0]).toMatchObject({ tagName: "h3", properties: {} });
    expect(tree.children![0].children![0].properties).not.toHaveProperty("id");
  });

  it("follows a link to a heading of the document, and leaves other links alone", () => {
    const link = (href: string) => el("a", { href });
    const links = [link("#usage"), link("#Caf%C3%A9"), link("#elsewhere"), link("https://example.org/#usage"), link("usage")];
    const tree = root(el("h1", { id: "usage" }), el("h2", { id: "Café" }), el("p", {}, links));
    nestHeadings(tree, "readme");
    expect(links.map((l) => l.properties!.href)).toEqual(["#readme--usage", "#readme--Caf%C3%A9", "#elsewhere", "https://example.org/#usage", "usage"]);
  });

  it("changes nothing in a document with no headings", () => {
    const tree = root(el("p", { id: "usage" }));
    nestHeadings(tree, "readme");
    expect(tree.children![0].properties).toEqual({ id: "usage" });
  });
});

describe("rehypeEmbeddedHeadings in Astro's Markdown pipeline", () => {
  const render = async (path: string, markdown: string) => {
    const processor = await createMarkdownProcessor({ rehypePlugins: [[rehypeEmbeddedHeadings, { contentRoot: "/work/content" }]] });
    return (await processor.render(markdown, { fileURL: new URL(`file://${path}`) })).code;
  };
  const markdown = "# Title\n\n## Usage\n\n[to usage](#usage)\n\n<h2>Raw heading</h2>\n";

  it("shifts and prefixes after the built-in heading ids exist and the raw HTML is parsed", async () => {
    const html = await render("/work/content/lantern/README.md", markdown);
    expect(html).toContain('<h3 id="readme--title">Title</h3>');
    expect(html).toContain('<h4 id="readme--usage">Usage</h4>');
    expect(html).toContain('<a href="#readme--usage">to usage</a>');
    expect(html, "a heading written as raw HTML moves with the others").toContain("<h4>Raw heading</h4>");
  });

  it("leaves a docs page's Markdown as it renders without the step", async () => {
    const html = await render("/work/content/lantern/docs/guide.md", markdown);
    expect(html).toContain('<h1 id="title">Title</h1>');
    expect(html).toContain('<h2 id="usage">Usage</h2>');
    expect(html).toContain('<a href="#usage">to usage</a>');
    expect(html).toContain("<h2>Raw heading</h2>");
  });
});
