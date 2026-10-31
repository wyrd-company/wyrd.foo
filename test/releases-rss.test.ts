// ---
// relationships:
//   verifies: site
// ---
import { readFileSync } from "node:fs";
import { parse as parseHtml } from "node-html-parser";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { toolFileSchema } from "../src/schema/index.ts";
import type { HomeEntry } from "../src/lib/home.ts";
import { releasesRss } from "../src/lib/releases-rss.ts";

const site = new URL("https://example.com");
const product = (key: string): HomeEntry => ({
  key,
  data: toolFileSchema.parse(parse(readFileSync(`test/fixtures/product-content/${key}/tool.yaml`, "utf8"))),
  hasDocs: false,
});
const guid = (xml: string) => xml.match(/<guid[^>]*>(.*?)<\/guid>/)?.[1];

describe("releases RSS", () => {
  it("uses the releases list's ordering and eligibility, including features", async () => {
    const response = await releasesRss(
      site,
      [product("widget"), product("gadget"), product("lantern"), product("gizmo"), product("sprocket")],
      new Map([
        ["widget", "Widget notes"],
        ["gadget", "Gadget notes"],
        ["lantern", "Feature notes"],
        ["sprocket", "No release"],
      ]),
    );
    expect(response.headers.get("Content-Type")).toContain("application/xml");
    const xml = await response.text();
    expect(xml.match(/<item>/g)).toHaveLength(3);
    expect(xml.indexOf("<title>gadget")).toBeLessThan(xml.indexOf("<title>Lantern"));
    expect(xml.indexOf("<title>Lantern")).toBeLessThan(xml.indexOf("<title>widget"));
    expect(xml).toContain("<link>https://example.com/tools/widget/releases</link>");
    expect(xml).toContain("<pubDate>Wed, 30 Sep 2026 00:00:00 GMT</pubDate>");
    expect(xml).toContain("<description>Widget notes</description>");
    expect(xml).not.toContain("gizmo");
    expect(xml).not.toContain("sprocket");
  });

  it("keeps a version's identity on docs edits and changes it for a new release", async () => {
    const entry = product("widget");
    const first = await (await releasesRss(site, [entry], new Map([[entry.key, "Original"]]))).text();
    const edited = await (await releasesRss(site, [entry], new Map([[entry.key, "Edited"]]))).text();
    entry.data.release!.version = "1.5.0";
    const next = await (await releasesRss(site, [entry], new Map([[entry.key, "Next"]]))).text();
    expect(guid(first)).toBe("urn:wyrd-tools:release:widget:1.4.0");
    expect(guid(edited)).toBe(guid(first));
    expect(guid(next)).not.toBe(guid(first));
    expect(first).toContain('isPermaLink="false"');
  });

  it("escapes names and changelog text as XML, without emitting executable markup", async () => {
    const entry = product("widget");
    entry.data.name = "Sample & <tool>";
    const xml = await (await releasesRss(site, [entry], new Map([[entry.key, 'Text & <script>alert("x")</script> ]]>']]))).text();
    expect(xml).toContain("Sample &amp; &lt;tool&gt;");
    expect(xml).toContain("Text &amp;amp; &amp;lt;script&amp;gt;");
    expect(xml).not.toContain("<script>");
    expect(xml).not.toContain("]]>");
  });

  it("preserves literal notes after XML decoding and reader HTML interpretation", async () => {
    const entry = product("widget");
    const notes = 'Use `--output <file>`; keep `&lt;tag&gt;` literally.\n<script>alert("x")</script> ]]>';
    const xml = await (await releasesRss(site, [entry], new Map([[entry.key, notes]]))).text();
    const description = parseHtml(xml).querySelector("item description")!.text;
    const rendered = parseHtml(description);
    expect(rendered.querySelector("script")).toBeNull();
    expect(rendered.text).toBe(notes);
  });

  it("builds a valid empty channel when no product qualifies", async () => {
    const xml = await (await releasesRss(site, [product("widget")], new Map())).text();
    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain("<title>Wyrd Tools releases</title>");
    expect(xml).toContain("<link>https://example.com/releases</link>");
    expect(xml).not.toContain("<item>");
  });
});
