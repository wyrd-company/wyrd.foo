import { describe, expect, it } from "vitest";
import SearchIndexMeta from "../src/components/SearchIndexMeta.astro";
import DocsHeader from "../src/components/docs/DocsHeader.astro";
import DocsSidebar from "../src/components/docs/DocsSidebar.astro";
import DocsToc from "../src/components/docs/DocsToc.astro";
import DocsVersionFooter from "../src/components/docs/DocsVersionFooter.astro";
import { CONTENT_ROOT } from "../src/lib/content-root";
import { docsProducts } from "../src/lib/docs-products";
import type { ToolFile } from "../src/schema/index.ts";
import { render } from "./render";

const tool = (name: string, extra: Record<string, unknown> = {}) =>
  ({
    name,
    version: "0.2.0",
    "docs-version": "0.2.3",
    "release-unit": name,
    owner: "example-org/things",
    "docs-path": "docs/user",
    tagline: "A thing.",
    blurb: "A thing.",
    status: "stable",
    category: "Agent Tooling",
    highlights: ["Does a thing."],
    media: [{ src: "demo.gif", caption: "A thing." }],
    kinds: [
      { kind: "app", install: [{ method: "docker", command: "docker run x" }] },
      { kind: "devcontainer-feature", ref: "ghcr.io/o/r/x:1" },
    ],
    ...extra,
  }) as unknown as ToolFile;

const page = (folder: string, slug: string, title = slug) => ({
  id: `${folder}/${slug}`,
  filePath: `${CONTENT_ROOT}/${folder}/docs/${slug}.md`,
  data: { title, product: folder, install: false },
});

const nav = [
  { section: "Get started", groups: [{ group: "Basics", pages: ["intro", "install"] }] },
  { section: "Guides", groups: [{ group: "Configure", pages: ["config"] }] },
];
const [sectioned, flat] = docsProducts(
  [
    { id: "gadget", data: tool("gadget", { nav, order: 1, logo: "logo.svg" }) },
    { id: "gizmo", data: tool("gizmo") },
  ],
  [page("gadget", "intro"), page("gadget", "install"), page("gadget", "config"), page("gadget", "extra"), page("gizmo", "intro")],
  [{ id: "gadget" }],
);
const products = [sectioned, flat];

describe("DocsHeader", () => {
  it("has section tabs for a product with sections, the current one marked", async () => {
    const root = await render(DocsHeader, { product: sectioned, products, section: "Guides" });
    const tabs = root.querySelectorAll(".docs-tabs a");
    expect(tabs.map((a) => [a.text.trim(), a.getAttribute("href")])).toEqual([
      ["Get started", "/docs/gadget/intro"],
      ["Guides", "/docs/gadget/config"],
    ]);
    expect(root.querySelectorAll('.docs-tabs a[aria-current="page"]').map((a) => a.text.trim())).toEqual(["Guides"]);
  });

  it("has no tab row for a product with no sections", async () => {
    const root = await render(DocsHeader, { product: flat, products, section: null });
    expect(root.querySelector(".docs-tabs")).toBeNull();
  });

  it("switches between products with their marks, the current one marked", async () => {
    const root = await render(DocsHeader, { product: flat, products, section: null });
    const items = root.querySelectorAll(".docs-switcher a");
    expect(items.map((a) => a.getAttribute("href"))).toEqual(["/docs/gadget", "/docs/gizmo"]);
    expect(items[0].querySelector("img")?.getAttribute("src")).toBe("/assets/gadget/logo.svg");
    expect(items[1].querySelector(".monogram")?.text).toBe("G");
    expect(root.querySelector('.docs-switcher a[aria-current="page"]')?.getAttribute("href")).toBe("/docs/gizmo");
    expect(root.querySelector(".docs-switcher-button")?.getAttribute("popovertarget")).toBe("docs-switcher");
    expect(root.querySelector("#docs-switcher")?.hasAttribute("popover")).toBe(true);
  });

  it("ranks the product in search and links its releases and repo", async () => {
    const root = await render(DocsHeader, { product: sectioned, products, section: "Guides" });
    expect(root.querySelector("dialog.wsearch")?.getAttribute("data-product")).toBe("gadget");
    expect(root.querySelector(".docs-releases")?.getAttribute("href")).toBe("/releases");
    expect(root.querySelector(".docs-github")?.getAttribute("href")).toBe("https://github.com/example-org/things");
  });
});

describe("DocsSidebar", () => {
  it("shows the current section's groups with reading progress", async () => {
    const root = await render(DocsSidebar, { section: sectioned.map[0], current: "install" });
    expect(root.querySelectorAll(".docs-sidebar-heading").map((p) => p.text)).toEqual(["Basics"]);
    expect(root.querySelectorAll("li").map((li) => li.getAttribute("data-progress"))).toEqual(["done", "current"]);
    expect(root.querySelector('a[aria-current="page"]')?.getAttribute("href")).toBe("/docs/gadget/install");
  });

  it("puts pages nav does not list in More, in the last section", async () => {
    const root = await render(DocsSidebar, { section: sectioned.map[1], current: "config" });
    expect(root.querySelectorAll(".docs-sidebar-heading").map((p) => p.text)).toEqual(["Configure", "More"]);
  });

  it("shows no group heading for a product with no nav", async () => {
    const root = await render(DocsSidebar, { section: flat.map[0], current: "intro" });
    expect(root.querySelectorAll(".docs-sidebar-heading")).toHaveLength(0);
    expect(root.querySelectorAll("li a").map((a) => a.getAttribute("href"))).toEqual(["/docs/gizmo/intro"]);
  });
});

describe("DocsToc", () => {
  const headings = [
    { depth: 2, slug: "one", text: "One" },
    { depth: 3, slug: "one-a", text: "One A" },
    { depth: 4, slug: "deep", text: "Deep" },
  ];

  it("lists level 2 and 3 headings, nested by depth", async () => {
    const root = await render(DocsToc, { title: "T", headings, markdownUrl: "/docs/x/t.md", editUrl: "https://github.com/o/r/edit/HEAD/docs/user/t.md" });
    expect(root.querySelectorAll(".docs-toc-nav li").map((li) => [li.getAttribute("data-depth"), li.querySelector("a")?.getAttribute("href")])).toEqual([
      ["2", "#one"],
      ["3", "#one-a"],
    ]);
  });

  it("links back to top, Copy as Markdown and Edit on GitHub", async () => {
    const root = await render(DocsToc, { title: "T", headings, markdownUrl: "/docs/x/t.md", editUrl: "https://github.com/o/r/edit/HEAD/docs/user/t.md" });
    expect(root.querySelector('.docs-toc-actions a[href="#top"]')).not.toBeNull();
    expect(root.querySelector("[data-copy-markdown]")?.getAttribute("data-copy-markdown")).toBe("/docs/x/t.md");
    expect(root.querySelectorAll(".docs-toc-actions a").at(-1)?.getAttribute("href")).toBe("https://github.com/o/r/edit/HEAD/docs/user/t.md");
  });
});

describe("DocsVersionFooter", () => {
  it("links the docs version to the docs changelog when there is one", async () => {
    const root = await render(DocsVersionFooter, { product: sectioned });
    expect(root.querySelector(".docs-version")?.text.replace(/\s+/g, " ").trim()).toBe("Docs 0.2.3 · for gadget 0.2.0");
    expect(root.querySelector(".docs-version a")?.getAttribute("href")).toBe("/docs/gadget/changelog");
  });

  it("writes the docs version as plain text when there is no changelog, and links the product version to its releases", async () => {
    const root = await render(DocsVersionFooter, { product: flat });
    expect(root.querySelectorAll(".docs-version a").map((a) => [a.text, a.getAttribute("href")])).toEqual([
      ["for gizmo 0.2.0", "/tools/gizmo/releases"],
    ]);
    expect(root.querySelector(".docs-version")?.text.replace(/\s+/g, " ").trim()).toBe("Docs 0.2.3 · for gizmo 0.2.0");
  });
});

describe("SearchIndexMeta", () => {
  it("indexes the product filter, one kind filter per kind and the product name, outside the page text", async () => {
    const root = await render(SearchIndexMeta, { product: "gadget", productName: "gadget, the app", kinds: ["app", "devcontainer-feature"] });
    expect(root.querySelectorAll('[data-pagefind-filter="product"]').map((e) => e.text)).toEqual(["gadget"]);
    expect(root.querySelectorAll('[data-pagefind-filter="kind"]').map((e) => e.text)).toEqual(["app", "devcontainer-feature"]);
    expect(root.querySelector('[data-pagefind-meta="productName"]')?.text).toBe("gadget, the app");
    expect(root.querySelector("[data-pagefind-ignore]")?.querySelectorAll("[data-pagefind-filter]")).toHaveLength(3);
  });
});
