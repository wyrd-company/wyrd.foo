import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { docsFileOf, docsLinkHref, docsTargets, filesUnder, rewriteDocsLinks } from "../src/lib/docs-links";
import { servedAssetFiles } from "../src/lib/product-asset-files";
import type { ToolFile } from "../src/schema/index";

const targets = docsTargets([
  "CHANGELOG.md",
  "overview.md",
  "getting-started.md",
  "guides/configuration.md",
  "guides/deep/tuning.md",
  "assets/demo.gif",
  "assets/sample file.yaml",
]);
const root = { key: "widget", rel: "overview.md" };
const nested = { key: "widget", rel: "guides/deep/tuning.md" };

describe("docsLinkHref", () => {
  it.each([
    ["getting-started.md", "/docs/widget/getting-started/"],
    ["getting-started.md#before-you-start", "/docs/widget/getting-started/#before-you-start"],
    ["./getting-started.md?tab=1#top", "/docs/widget/getting-started/?tab=1#top"],
    ["guides/configuration.md#the-port", "/docs/widget/configuration/#the-port"],
    ["getting-started", "/docs/widget/getting-started/"],
    ["getting-started#before-you-start", "/docs/widget/getting-started/#before-you-start"],
    ["configuration", "/docs/widget/configuration/"],
    ["CHANGELOG.md#020", "/docs/widget/changelog/#020"],
    ["assets/demo.gif", "/assets/widget/assets/demo.gif"],
    ["assets/sample%20file.yaml", "/assets/widget/assets/sample%20file.yaml"],
  ])("resolves %s from a top-level page to %s", (href, site) => {
    expect(docsLinkHref(href, root, targets)).toBe(site);
  });

  it.each([
    ["../configuration.md#the-port", "/docs/widget/configuration/#the-port"],
    ["../../overview.md", "/docs/widget/overview/"],
    ["../../CHANGELOG.md", "/docs/widget/changelog/"],
    ["../../assets/demo.gif", "/assets/widget/assets/demo.gif"],
    ["getting-started", "/docs/widget/getting-started/"],
  ])("resolves %s from a nested page to %s", (href, site) => {
    expect(docsLinkHref(href, nested, targets)).toBe(site);
  });

  it.each([
    "https://example.com/getting-started.md",
    "mailto:someone@example.com",
    "/docs/widget/overview",
    "#heading",
    "missing.md",
    "missing",
    "guides/",
    "../outside.md",
    "../../../outside.md",
    "changelog",
    "deep/missing",
    "notes.txt",
  ])("keeps %s as written", (href) => {
    expect(docsLinkHref(href, href.startsWith("../../../") ? nested : root, targets)).toBeUndefined();
  });

  it("does not take a bare slug with a folder from another folder", () => {
    expect(docsLinkHref("other/configuration", root, targets)).toBeUndefined();
  });

  it("keeps a link to the changelog as written when the product publishes none", () => {
    expect(docsLinkHref("CHANGELOG.md", root, docsTargets(["overview.md"]))).toBeUndefined();
  });
});

describe("rewriteDocsLinks", () => {
  it("rewrites the href of each relative <a> and leaves other elements alone", () => {
    const tree = {
      type: "root",
      children: [
        { type: "element", tagName: "a", properties: { href: "getting-started.md#x" }, children: [] },
        { type: "element", tagName: "a", properties: { href: "https://example.com" }, children: [] },
        { type: "element", tagName: "img", properties: { src: "assets/demo.gif" }, children: [] },
      ],
    };
    rewriteDocsLinks(tree, root, targets);
    expect(tree.children.map((node) => node.properties)).toEqual([
      { href: "/docs/widget/getting-started/#x" },
      { href: "https://example.com" },
      { src: "assets/demo.gif" },
    ]);
  });
});

describe("docsFileOf", () => {
  it("names the product and path of a docs file", () => {
    expect(docsFileOf("content/widget/docs/guides/configuration.md", "content")).toEqual({ key: "widget", rel: "guides/configuration.md" });
    expect(docsFileOf("content/widget/docs/CHANGELOG.md", "./content")).toEqual({ key: "widget", rel: "CHANGELOG.md" });
  });

  it("names no product for another file", () => {
    expect(docsFileOf("content/widget/README.md", "content")).toBeUndefined();
    expect(docsFileOf("content/widget/CHANGELOG.md", "content")).toBeUndefined();
    expect(docsFileOf("README.md", "content")).toBeUndefined();
    expect(docsFileOf(undefined, "content")).toBeUndefined();
  });
});

describe("filesUnder and servedAssetFiles", () => {
  it("lists the files of a docs folder and serves the ones that are not Markdown", () => {
    const dir = mkdtempSync(join(tmpdir(), "docs-links-"));
    const docs = join(dir, "widget", "docs");
    mkdirSync(join(docs, "assets"), { recursive: true });
    for (const file of ["overview.md", "CHANGELOG.md", "assets/logo.svg", "assets/guide.pdf"]) writeFileSync(join(docs, file), "x");
    const files = filesUnder(docs).sort();
    expect(files).toEqual(["CHANGELOG.md", "assets/guide.pdf", "assets/logo.svg", "overview.md"]);
    expect(filesUnder(join(dir, "missing"))).toEqual([]);
    const data = { logo: "assets/logo.svg", source: "src/widget" } as unknown as ToolFile;
    const served = servedAssetFiles(dir, "widget", data, () => true, [...docsTargets(files).assets]);
    expect(served.map((asset) => asset.path)).toEqual(["assets/logo.svg", "assets/guide.pdf"]);
  });
});
