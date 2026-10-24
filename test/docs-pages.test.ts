import { describe, expect, it } from "vitest";
import { docsMap } from "../src/lib/docs-map";
import {
  DuplicateSlugError,
  editUrl,
  groupPages,
  neighbours,
  pageMarkdown,
  primaryInstall,
  progressOf,
  relPathOf,
  ReservedSlugError,
  sectionOf,
  versionLine,
  type PageSource,
} from "../src/lib/docs-pages";
import { docsProducts } from "../src/lib/docs-products";
import { activeHeading } from "../src/lib/docs-toc";
import type { ToolFile } from "../src/schema/index.ts";

const ROOT = "test/fixtures/root";
const source = (folder: string, path: string, data: Partial<PageSource["data"]> = {}): PageSource => {
  const slug = path.split("/").pop()!.replace(/\.md$/, "");
  return {
    id: `${folder}/${slug}`,
    filePath: `${ROOT}/${folder}/docs/${path}`,
    data: { title: slug, product: folder, install: false, ...data },
  };
};

const product = (name: string, extra: Record<string, unknown> = {}) =>
  ({
    name,
    version: "1.0.0",
    "docs-version": "1.0.1",
    "release-unit": name,
    owner: "example-org/things",
    "docs-path": "docs/user",
    tagline: "A thing.",
    blurb: "A thing.",
    status: "stable",
    category: "Agent Tooling",
    highlights: ["Does a thing."],
    media: [{ src: "demo.gif", caption: "A thing." }],
    kinds: [{ kind: "cli", install: [{ method: "npm", os: ["linux"], command: `npm i -g ${name}` }] }],
    ...extra,
  }) as unknown as ToolFile;

describe("relPathOf", () => {
  it("keeps folders under the product's docs folder", () => {
    expect(relPathOf(`${ROOT}/gadget/docs/guides/setup.md`, "gadget")).toBe("guides/setup.md");
    expect(relPathOf(`${ROOT}/gadget/docs/setup.md`, "gadget")).toBe("setup.md");
  });

  it("keeps a nested docs folder that belongs to the page's path", () => {
    expect(relPathOf(`${ROOT}/gadget/docs/docs/setup.md`, "gadget")).toBe("docs/setup.md");
    expect(relPathOf(`${ROOT}/gadget/docs/gadget/docs/setup.md`, "gadget")).toBe("gadget/docs/setup.md");
  });

  it("fails for a file outside the product's docs folder", () => {
    expect(() => relPathOf(`${ROOT}/gadget/setup.md`, "gadget")).toThrow(/not under gadget\/docs/);
  });
});

describe("editUrl", () => {
  it("joins owner, docs-path and the page path on the default branch", () => {
    expect(editUrl("example-org/things", "docs/user", "guides/setup.md")).toBe(
      "https://github.com/example-org/things/edit/HEAD/docs/user/guides/setup.md",
    );
  });

  it("uses a per-product docs folder", () => {
    expect(editUrl("example-org/things", "docs/user/gadget", "setup.md")).toBe(
      "https://github.com/example-org/things/edit/HEAD/docs/user/gadget/setup.md",
    );
  });

  it("encodes each path segment", () => {
    expect(editUrl("o/r", "docs/user", "a b/c#d.md")).toBe("https://github.com/o/r/edit/HEAD/docs/user/a%20b/c%23d.md");
  });
});

describe("groupPages", () => {
  it("routes two products' pages with one file name to their own product", () => {
    const grouped = groupPages([source("gadget", "getting-started.md"), source("gizmo", "getting-started.md")]);
    expect([...grouped.keys()]).toEqual(["gadget", "gizmo"]);
    expect(grouped.get("gadget")![0]).toMatchObject({ key: "gadget", slug: "getting-started", rel: "getting-started.md" });
    expect(grouped.get("gizmo")![0]).toMatchObject({ key: "gizmo", slug: "getting-started", rel: "getting-started.md" });
  });

  it("takes the product from front matter, not the folder", () => {
    const grouped = groupPages([source("gadget", "extra.md", { product: "gizmo" })]);
    expect(grouped.get("gizmo")![0]).toMatchObject({ key: "gizmo", slug: "extra" });
    expect(grouped.has("gadget")).toBe(false);
  });

  it("routes a page at any depth by its file name", () => {
    const [page] = groupPages([source("gadget", "a/b/c/deep.md")]).get("gadget")!;
    expect(page).toMatchObject({ slug: "deep", rel: "a/b/c/deep.md" });
  });

  it("fails on the reserved changelog slug, naming the file", () => {
    expect(() => groupPages([source("gadget", "guides/changelog.md")])).toThrow(ReservedSlugError);
    expect(() => groupPages([source("gadget", "guides/changelog.md")])).toThrow(/gadget\/docs\/guides\/changelog\.md: page slug "changelog" is reserved/);
  });

  it("fails on two pages of one product with one slug", () => {
    const twins = [source("gadget", "setup.md"), source("gizmo", "guides/setup.md", { product: "gadget" })];
    expect(() => groupPages(twins)).toThrow(DuplicateSlugError);
  });
});

describe("docsProducts", () => {
  const products = [
    { id: "zeta", data: product("zeta") },
    { id: "alpha", data: product("alpha") },
    { id: "first", data: product("first", { order: 1 }) },
    { id: "bare", data: product("bare") },
  ];
  const pages = [source("zeta", "intro.md"), source("alpha", "intro.md"), source("first", "intro.md")];

  it("lists products with pages, order first then by name", () => {
    expect(docsProducts(products, pages, []).map((p) => p.key)).toEqual(["first", "alpha", "zeta"]);
  });

  it("goes to the first page in reading order", () => {
    const withNav = [{ id: "alpha", data: product("alpha", { nav: [{ section: "S", groups: [{ group: "G", pages: ["b"] }] }] }) }];
    const [docs] = docsProducts(withNav, [source("alpha", "a.md", { order: 1 }), source("alpha", "b.md")], []);
    expect(docs.first.slug).toBe("b");
  });

  it("serves the product's marks and favicon from its assets", () => {
    const marked = [{ id: "alpha", data: product("alpha", { logo: "img/logo.svg", "logo-dark": "img/dark.svg", favicon: "fav.png" }) }];
    const [docs] = docsProducts(marked, [source("alpha", "intro.md")], []);
    expect(docs).toMatchObject({ logo: "/assets/alpha/img/logo.svg", logoDark: "/assets/alpha/img/dark.svg", favicon: "/assets/alpha/fav.png" });
    expect(docs.socialImage).toBeUndefined();
  });

  it("finds the product's docs changelog", () => {
    const [docs] = docsProducts([products[1]], [source("alpha", "intro.md")], [{ id: "alpha" }, { id: "zeta" }]);
    expect(docs.changelog).toEqual({ id: "alpha" });
  });

  it("fails on a page whose product has no tool.yaml", () => {
    expect(() => docsProducts(products, [source("ghost", "intro.md")], [])).toThrow(/names product ghost, which has no docs/);
  });

  it("fails on a page of a feature entry", () => {
    const feature = { id: "feat", data: { source: "src/feat", kinds: [{ kind: "devcontainer-feature", ref: "ghcr.io/o/r/feat:1" }] } as unknown as ToolFile };
    expect(() => docsProducts([feature], [source("feat", "intro.md")], [])).toThrow(/names product feat/);
  });
});

describe("reading progress and neighbours", () => {
  const page = (slug: string) => ({ slug, title: slug });
  const nav = [
    { section: "One", groups: [{ group: "A", pages: ["a1", "a2"] }, { group: "B", pages: ["b1"] }] },
    { section: "Two", groups: [{ group: "C", pages: ["c1"] }] },
  ];
  const map = docsMap(nav, ["a1", "a2", "b1", "c1"].map(page));

  it("marks pages before the current one done and after it ahead, across groups", () => {
    expect([...progressOf(map[0], "a2")]).toEqual([
      ["a1", "done"],
      ["a2", "current"],
      ["b1", "ahead"],
    ]);
  });

  it("finds a page's section", () => {
    expect(sectionOf(map, "c1")?.section).toBe("Two");
    expect(sectionOf(map, "nope")).toBeUndefined();
  });

  it("links previous and next across sections", () => {
    expect(neighbours(map, "b1")).toEqual({ prev: page("a2"), next: page("c1") });
    expect(neighbours(map, "a1").prev).toBeUndefined();
  });
});

describe("activeHeading", () => {
  it("is the last heading at or above the line", () => {
    expect(activeHeading([-300, -10, 105, 400], 105)).toBe(2);
    expect(activeHeading([-300, -10, 106, 400], 105)).toBe(1);
  });

  it("is none before the first heading reaches the line", () => {
    expect(activeHeading([200, 400], 105)).toBe(-1);
  });
});

describe("page text", () => {
  it("writes the version footer from the docs and product versions", () => {
    expect(versionLine({ name: "trowel", version: "0.2.0", docsVersion: "0.2.3" })).toEqual({
      docs: "Docs 0.2.3",
      product: "for trowel 0.2.0",
    });
  });

  it("copies the title as a heading, then the body", () => {
    expect(pageMarkdown("Setup", "\n\nBody text.\n")).toBe("# Setup\n\nBody text.\n");
  });

  it("installs with the default entry, else the first", () => {
    const install = [
      { method: "npm", os: ["linux"], command: "npm i -g x" },
      { method: "cargo", os: ["linux"], label: "From Git", default: true, command: "cargo install x" },
    ] as const;
    expect(primaryInstall({ kind: "cli", install: [...install] } as never)).toEqual({ label: "From Git", command: "cargo install x" });
    expect(primaryInstall({ kind: "cli", install: [install[0]] } as never)).toEqual({ label: "npm", command: "npm i -g x" });
    expect(primaryInstall({ kind: "devcontainer-image", ref: "ghcr.io/o/i:1" } as never)).toEqual({ label: "Reference", command: "ghcr.io/o/i:1" });
  });
});
