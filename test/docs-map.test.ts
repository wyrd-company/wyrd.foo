import { describe, expect, it } from "vitest";
import { docsMap, MORE_GROUP, readingOrder } from "../src/lib/docs-map";

const page = (slug: string, title = slug, order?: number) => ({ slug, title, order });
const shape = (map: ReturnType<typeof docsMap>) =>
  map.map((s) => ({ section: s.section, groups: s.groups.map((g) => [g.group, ...g.pages.map((p) => p.slug)]) }));

describe("docsMap", () => {
  it("takes sections, groups and page order from nav", () => {
    const nav = [
      { section: "Get started", groups: [{ group: "Basics", pages: ["install", "intro"] }] },
      { section: "Reference", groups: [{ group: "Commands", pages: ["run"] }, { group: "Files", pages: ["config"] }] },
    ];
    const map = docsMap(nav, [page("run"), page("config"), page("intro"), page("install")]);
    expect(shape(map)).toEqual([
      { section: "Get started", groups: [["Basics", "install", "intro"]] },
      { section: "Reference", groups: [["Commands", "run"], ["Files", "config"]] },
    ]);
  });

  it("puts pages nav does not list in a trailing More group, by order then title", () => {
    const nav = [{ section: "Guide", groups: [{ group: "Start", pages: ["intro"] }] }];
    const map = docsMap(nav, [page("intro"), page("b", "Beta"), page("a", "Alpha"), page("z", "Zed", 1)]);
    expect(shape(map)).toEqual([{ section: "Guide", groups: [["Start", "intro"], [MORE_GROUP, "z", "a", "b"]] }]);
  });

  it("gives a product with no nav one unnamed section holding only More", () => {
    const map = docsMap(undefined, [page("usage", "Usage", 2), page("install", "Install", 1)]);
    expect(shape(map)).toEqual([{ section: null, groups: [[MORE_GROUP, "install", "usage"]] }]);
  });

  it("skips slugs it has no page for and lists a page once", () => {
    const nav = [{ section: "Guide", groups: [{ group: "A", pages: ["intro", "gone"] }, { group: "B", pages: ["intro"] }] }];
    expect(shape(docsMap(nav, [page("intro")]))).toEqual([{ section: "Guide", groups: [["A", "intro"]] }]);
  });

  it("has no sections when the product has no pages", () => {
    expect(docsMap(undefined, [])).toEqual([]);
  });

  it("reads the map in order", () => {
    const nav = [{ section: "S", groups: [{ group: "G", pages: ["b"] }] }];
    expect(readingOrder(docsMap(nav, [page("a"), page("b")])).map((p) => p.slug)).toEqual(["b", "a"]);
  });
});
