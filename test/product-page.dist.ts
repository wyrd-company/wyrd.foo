/*
 * Checks of the product pages built from the fixture content root
 * test/fixtures/product-content (`pnpm build:product-fixture`, into dist-fixtures/products/):
 * one product of each kind, a product with two kinds, a product with no docs
 * pages and a feature entry.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse, type HTMLElement } from "node-html-parser";
import { describe, expect, it } from "vitest";
import { monogramDataUri } from "../src/lib/head";
import { APT_SETUP, RPM_SETUP } from "../src/lib/install-blocks";

const DIST = "dist-fixtures/products";
const SITE = "https://wyrd.foo";
const PRODUCTS = ["widget", "gadget", "sprocket", "gizmo", "harbor", "lantern", "beacon"];

/** The built product page; fails unless the page is the product page for `key`. */
function productPage(key: string): HTMLElement {
  const file = join(DIST, "tools", key, "index.html");
  expect(existsSync(file), `${file}: run \`pnpm build:product-fixture\` first`).toBe(true);
  const root = parse(readFileSync(file, "utf8"));
  expect(root.querySelector("article.product")?.getAttribute("data-product"), file).toBe(key);
  return root;
}

const text = (el: HTMLElement | null | undefined) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
const texts = (root: HTMLElement, selector: string) => root.querySelectorAll(selector).map((el) => text(el));
const fact = (root: HTMLElement, name: string) => text(root.querySelector(`[data-fact="${name}"]`));
const builtFile = (url: string) => join(DIST, decodeURI(new URL(url, SITE).pathname));
const tabs = (block: HTMLElement, label: string) =>
  texts(block, `[role="tablist"][aria-label="${label}"] > [role="tab"]`);

/** The code of the panel a tab controls. */
function panelCode(root: HTMLElement, tabId: string): string {
  const panel = root.getElementById(root.getElementById(tabId)!.getAttribute("aria-controls")!);
  return panel!.querySelector("pre")!.textContent;
}

/** The panel a tab controls: its disclosure (if any), its pre blocks in order, and the whole block as Copy takes it. */
function panelBlock(root: HTMLElement, tabId: string) {
  const panel = root.getElementById(root.getElementById(tabId)!.getAttribute("aria-controls")!)!;
  const pres = panel.querySelectorAll("pre").map((pre) => pre.textContent);
  return { details: panel.querySelector("details[data-code-setup]"), hint: panel.querySelector("summary")?.textContent.trim(), pres, full: pres.join("\n") };
}

function tabIdByLabel(block: HTMLElement, label: string): string {
  const tab = block.querySelectorAll('[role="tab"]').find((t) => text(t) === label || text(t).endsWith(` ${label}`));
  expect(tab, `no tab ${label}`).toBeDefined();
  return tab!.id;
}

describe("product pages from the fixture content", () => {
  it("builds one page for each fixture product", () => {
    for (const key of PRODUCTS) productPage(key);
  });

  it("gives each page its hero, facts and the Releases section", () => {
    for (const key of PRODUCTS) {
      const root = productPage(key);
      expect(root.querySelector("h1.hero-name")).not.toBeNull();
      expect(root.querySelector("dl.facts"), key).not.toBeNull();
      expect(root.querySelector("section#releases"), key).not.toBeNull();
    }
  });

  it("indexes each page once for search, with its product, name and kinds", () => {
    const kinds: Record<string, string[]> = {
      widget: ["cli"],
      gadget: ["app"],
      sprocket: ["mcp-server"],
      gizmo: ["app", "devcontainer-feature"],
      harbor: ["devcontainer-image"],
      lantern: ["devcontainer-feature"],
      beacon: ["devcontainer-feature"],
    };
    for (const key of PRODUCTS) {
      const root = productPage(key);
      const bodies = root.querySelectorAll("[data-pagefind-body]");
      expect(bodies, key).toHaveLength(1);
      expect(bodies[0].tagName, key).toBe("ARTICLE");
      expect(texts(bodies[0], '[data-pagefind-filter="product"]'), key).toEqual([key]);
      expect(texts(bodies[0], '[data-pagefind-filter="kind"]'), key).toEqual(kinds[key]);
      expect(texts(bodies[0], '[data-pagefind-meta="productName"]'), key).toEqual([text(bodies[0].querySelector("h1.hero-name"))]);
    }
  });

  it("puts the product pages in the search index, beside the docs pages", () => {
    const entry = JSON.parse(readFileSync(join(DIST, "pagefind", "pagefind-entry.json"), "utf8")) as {
      languages: Record<string, { page_count: number }>;
    };
    // 7 product pages, their 7 releases pages, /releases and the 8 fixture docs pages (widget 4, gizmo 2, sprocket 1, harbor 1).
    expect(Object.values(entry.languages).map((l) => l.page_count)).toEqual([2 * PRODUCTS.length + 1 + 8]);
  });

  it("serves every image, video and icon the pages use", () => {
    for (const key of PRODUCTS) {
      const root = productPage(key);
      const urls = [
        ...root.querySelectorAll("img[src], video[src]").map((el) => el.getAttribute("src")!),
        root.querySelector('link[rel="icon"]')!.getAttribute("href")!,
        root.querySelector('meta[property="og:image"]')!.getAttribute("content")!,
      ].filter((url) => !url.startsWith("data:"));
      for (const url of urls) expect(existsSync(builtFile(url)), `${key}: ${url}`).toBe(true);
    }
  });
});

describe("hero and facts", () => {
  it("shows the primary kind's default command and every fact", () => {
    const root = productPage("widget");
    expect(text(root.querySelector(".hero-install-label"))).toBe("Install with Homebrew (macOS, Linux)");
    expect(root.querySelector(".hero-install pre")?.textContent).toBe("brew install example-org/tap/widget");
    expect(fact(root, "kinds")).toBe("CLI");
    expect(fact(root, "status")).toBe("Stable");
    expect(fact(root, "latest")).toBe("1.4.0 · 2026-09-30");
    expect(fact(root, "category")).toBe("Templates & Scaffolding");
    expect(root.querySelector('[data-fact="repository"] a')?.getAttribute("href")).toBe("https://github.com/example-org/widget");
  });

  it("lists all kinds of a product with more than one kind, and shows the first kind's command", () => {
    const root = productPage("gizmo");
    expect(fact(root, "kinds")).toBe("App · Dev container feature");
    expect(text(root.querySelector(".hero-install-label"))).toBe("Install with APT (Linux)");
    const hero = root.querySelector(".hero-install")!;
    expect(hero.querySelectorAll("pre").map((pre) => pre.textContent)).toEqual([[...APT_SETUP, "sudo apt update"].join("\n"), "sudo apt install gizmo"]);
    expect(hero.querySelector("details[data-code-setup]")?.hasAttribute("open")).toBe(false);
    expect(text(hero.querySelector("summary"))).toBe("Set up the repo.wyrd.foo APT repository (once)");
  });

  it("shows the logo, and the dark logo for the dark theme", () => {
    const marks = productPage("widget").querySelectorAll(".hero-title .product-mark img").map((img) => img.getAttribute("src"));
    expect(marks).toEqual(["/assets/widget/assets/logo.svg", "/assets/widget/assets/logo-dark.svg"]);
  });

  it("shows the monogram for a product with no logo", () => {
    const root = productPage("gadget");
    expect(root.querySelector(".hero-title .product-mark")).toBeNull();
    expect(text(root.querySelector(".hero-title .monogram"))).toBe("G");
  });
});

describe("head: favicon and social image", () => {
  const head = (key: string) => {
    const root = productPage(key);
    return {
      icon: root.querySelector('link[rel="icon"]')?.getAttribute("href"),
      type: root.querySelector('link[rel="icon"]')?.getAttribute("type"),
      og: root.querySelector('meta[property="og:image"]')?.getAttribute("content"),
      twitter: root.querySelector('meta[name="twitter:image"]')?.getAttribute("content"),
    };
  };

  it("uses the product's own favicon and social image", () => {
    expect(head("widget")).toEqual({
      icon: "/assets/widget/assets/favicon.png",
      type: "image/png",
      og: `${SITE}/assets/widget/assets/social.png`,
      twitter: `${SITE}/assets/widget/assets/social.png`,
    });
  });

  it("uses the monogram and the site image for a product with neither", () => {
    for (const [key, name] of [["gadget", "gadget"], ["lantern", "Lantern"]]) {
      expect(head(key)).toEqual({ icon: monogramDataUri(name), type: "image/svg+xml", og: `${SITE}/social.png`, twitter: `${SITE}/social.png` });
    }
  });
});

describe("install block: CLI and app", () => {
  const block = () => productPage("widget").querySelector('[data-install-block="platforms"]')!;

  it("shows no kind tabs for a product with one kind", () => {
    expect(productPage("widget").querySelector('#install [role="tablist"][aria-label="Kind"]')).toBeNull();
  });

  it("makes platform tabs from os, with Docker last", () => {
    expect(tabs(block(), "Platform")).toEqual(["macOS", "Linux", "Windows", "Docker"]);
    expect(tabs(block(), "Linux install method")).toEqual(["Homebrew", "APT", "RPM", "Cargo"]);
    expect(tabs(block(), "Windows install method")).toEqual(["Cargo", "WinGet"]);
  });

  it("writes the repo.wyrd.foo setup above the apt and rpm install lines, collapsed", () => {
    const root = productPage("widget");
    const linux = root.getElementById("install-cli-linux")!;
    const apt = panelBlock(root, tabIdByLabel(linux, "APT"));
    expect(apt.full).toBe([...APT_SETUP, "sudo apt update", "sudo apt install widget"].join("\n"));
    expect(apt.hint).toBe("Set up the repo.wyrd.foo APT repository (once)");
    expect(apt.details?.hasAttribute("open")).toBe(false);
    expect(apt.details?.querySelectorAll("pre").map((pre) => pre.textContent)).toEqual([[...APT_SETUP, "sudo apt update"].join("\n")]);
    const rpm = panelBlock(root, tabIdByLabel(linux, "RPM"));
    expect(rpm.full).toBe([...RPM_SETUP, "sudo dnf install widget"].join("\n"));
    expect(rpm.hint).toBe("Set up the repo.wyrd.foo RPM repository (once)");
    expect(rpm.details?.hasAttribute("open")).toBe(false);
  });

  it("leaves the other methods as one command with no disclosure", () => {
    const root = productPage("widget");
    const linux = root.getElementById("install-cli-linux")!;
    for (const [label, command] of [["Homebrew", "brew install example-org/tap/widget"], ["Cargo", "cargo install widget"]]) {
      const block = panelBlock(root, tabIdByLabel(linux, label));
      expect(block.details, label).toBeNull();
      expect(block.pres, label).toEqual([command]);
    }
    expect(root.querySelector(".hero-install details")).toBeNull();
  });

  it("opens on the default entry's platform and method", () => {
    const root = productPage("gadget");
    const selected = root.querySelectorAll('[role="tablist"][aria-label="Platform"] > [aria-selected="true"]');
    expect(selected.map((tab) => text(tab))).toEqual(["Docker"]);
    expect(root.getElementById("install-app-macos")?.hasAttribute("hidden")).toBe(true);
    expect(root.getElementById("install-app-docker")?.hasAttribute("hidden")).toBe(false);
  });

  it("shows an app's other media as the console tour", () => {
    const root = productPage("gadget");
    expect(text(root.querySelector(".media-tour-title"))).toBe("Console tour");
    expect(texts(root, ".media-tour-list figcaption")).toEqual(["02 Watch the sample queues.", "03 Change the sample settings."]);
  });
});

describe("media: tour modal", () => {
  it("links each tour thumbnail to its full-size file, and the first item to nothing", () => {
    const root = productPage("gizmo");
    expect(root.querySelectorAll(".media-main [data-media-open]")).toEqual([]);
    const openers = root.querySelectorAll(".media-tour-list [data-media-open]");
    expect(openers.map((a) => a.tagName)).toEqual(["A", "A", "A"]);
    expect(openers.map((a) => a.getAttribute("href"))).toEqual([
      "/assets/gizmo/assets/demo.webm",
      "/assets/gizmo/assets/panel.png",
      "/assets/gizmo/assets/notes.png",
    ]);
    // The image's link is named by the image's alt (or caption); the video's by an own label.
    expect(root.querySelector('.media-tour-list a[href$="panel.png"] img')?.getAttribute("alt")).toBe("The sample panel.");
    expect(root.querySelector('.media-tour-list a[href$="notes.png"] img')?.getAttribute("alt")).toBe("A list of sample notes.");
    expect(openers[0].getAttribute("aria-label")).toBe("Open full size: A recording of the sample board.");
    expect(openers.every((a) => !a.hasAttribute("role"))).toBe(true);
  });

  it("describes each tour item for the dialog", () => {
    const root = productPage("gizmo");
    const items = root.querySelectorAll(".media-tour-list > li");
    expect(items.map((li) => li.getAttribute("data-tour-kind"))).toEqual(["video", "image", "image"]);
    expect(items.map((li) => li.getAttribute("data-tour-src"))).toEqual([
      "/assets/gizmo/assets/demo.webm",
      "/assets/gizmo/assets/panel.png",
      "/assets/gizmo/assets/notes.png",
    ]);
    expect(items.map((li) => li.getAttribute("data-tour-caption"))).toEqual([
      "The sample board in use.",
      "The sample panel.",
      "The sample notes.",
    ]);
    expect(items.map((li) => li.getAttribute("data-tour-label"))).toEqual([
      "A recording of the sample board.",
      "The sample panel.",
      "A list of sample notes.",
    ]);
  });

  it("has one closed dialog outside the tour list, with its controls", () => {
    const root = productPage("gizmo");
    const dialogs = root.querySelectorAll("dialog.media-modal");
    expect(dialogs).toHaveLength(1);
    const dialog = dialogs[0];
    expect(dialog.hasAttribute("open")).toBe(false);
    expect(dialog.getAttribute("aria-label")).toBe("Console tour");
    expect(dialog.closest(".media-tour-list")).toBeNull();
    expect(text(dialog.querySelector("button[data-modal-close]"))).toBe("Close");
    expect(dialog.querySelector("button[data-modal-prev]")?.getAttribute("aria-label")).toBe("Previous");
    expect(dialog.querySelector("button[data-modal-next]")?.getAttribute("aria-label")).toBe("Next");
    expect(dialog.querySelector("[data-modal-position]")).not.toBeNull();
    expect(dialog.querySelector("[data-modal-caption]")).not.toBeNull();
    expect(dialog.querySelector("[data-modal-stage]")).not.toBeNull();
    // The video of the dialog is made by the script, from a template, so nothing plays on load.
    expect(dialog.querySelectorAll("video[autoplay]")).toEqual([]);
  });

  it("is on a product with a tour of images only, and on no product without a tour", () => {
    expect(productPage("gadget").querySelectorAll("dialog.media-modal")).toHaveLength(1);
    expect(productPage("gadget").querySelectorAll(".media-tour-list [data-media-open]")).toHaveLength(2);
    for (const key of ["widget", "sprocket", "harbor", "lantern", "beacon"]) {
      const root = productPage(key);
      expect(root.querySelectorAll("dialog.media-modal"), key).toEqual([]);
      expect(root.querySelectorAll("[data-media-open]"), key).toEqual([]);
    }
  });
});

describe("media: video", () => {
  it("shows a WebM in the tour as a muted, looping video with a pause button, and no autoplay", () => {
    const root = productPage("gizmo");
    const video = root.querySelector(".media-tour video")!;
    expect(video.getAttribute("src")).toBe("/assets/gizmo/assets/demo.webm");
    expect(video.hasAttribute("autoplay")).toBe(false);
    for (const attr of ["muted", "loop", "playsinline", "controls"]) expect(video.hasAttribute(attr), attr).toBe(true);
    expect(root.querySelector(".media-tour button[data-media-toggle]")?.getAttribute("aria-label")).toBe(
      "Play video: A recording of the sample board.",
    );
    expect(root.querySelectorAll("video[autoplay]")).toEqual([]);
  });
});

describe("install block: MCP server", () => {
  it("makes one client tab per install entry, the plugin marketplaces included", () => {
    const root = productPage("sprocket");
    const block = root.querySelector('[data-install-block="mcp-server"]')!;
    expect(tabs(block, "MCP client")).toEqual([
      "Claude Code",
      "Claude Desktop",
      "Codex",
      "Cursor",
      "OpenCode",
      "Pi",
      "Antigravity",
      "VS Code",
      "JSON",
      "Plugin Claude Code marketplace",
      "Plugin Codex marketplace",
    ]);
    expect(panelCode(root, tabIdByLabel(block, "Codex marketplace"))).toBe("codex plugin install example-org/sprocket");
  });

  it("lists the tools the server exposes with their side effects", () => {
    const rows = productPage("sprocket")
      .querySelectorAll('[data-install-block="mcp-server"] tbody tr')
      .map((row) => row.querySelectorAll("td").map((td) => text(td)));
    expect(rows).toEqual([
      ["list_records", "Lists sample records that match a filter.", "Read-only"],
      ["get_record", "Reads one sample record.", "Read-only"],
      ["update_record", "Updates one field of a sample record.", "Writes"],
    ]);
  });
});

describe("install block: dev container feature and image", () => {
  it("gives a product with two kinds one tab for each kind's block, in kinds order", () => {
    const root = productPage("gizmo");
    expect(root.querySelectorAll("#install [data-install-block]").map((b) => b.getAttribute("data-install-block"))).toEqual([
      "platforms",
      "devcontainer-feature",
    ]);
    expect(tabs(root.querySelector("#install")!, "Kind")).toEqual(["Install", "Dev container"]);
    expect(root.getElementById("install-kind-app")?.hasAttribute("hidden")).toBe(false);
    expect(root.getElementById("install-kind-devcontainer-feature")?.hasAttribute("hidden")).toBe(true);
    expect(root.querySelector('[data-install-block="devcontainer-feature"] pre')?.textContent).toBe(
      '"features": {\n  "ghcr.io/example-org/gizmo/gizmo:2": {}\n}',
    );
  });

  it("shows an image's reference, devcontainer.json line and tags table", () => {
    const block = productPage("harbor").querySelector('[data-install-block="devcontainer-image"]')!;
    expect(block.querySelectorAll("pre").map((pre) => pre.textContent)).toEqual([
      "ghcr.io/example-org/harbor:0",
      '"image": "ghcr.io/example-org/harbor:0"',
    ]);
    expect(block.querySelectorAll("tbody tr").map((row) => row.querySelectorAll("td").map((td) => text(td)))).toEqual([
      ["0", "debian-bookworm", "amd64, arm64"],
      ["0.9", "debian-bookworm", "amd64, arm64"],
      ["0.9.0", "debian-bookworm", "amd64, arm64"],
    ]);
  });
});

describe("documentation", () => {
  it("maps the docs sections and groups from nav, with unlisted pages in More", () => {
    const root = productPage("widget");
    expect(root.querySelector(".hero-actions a.button-primary")?.getAttribute("href")).toBe("/docs/widget/");
    const cards = root.querySelectorAll("#docs .docs-map-card").map((card) => ({
      section: text(card.querySelector(".docs-map-section")),
      groups: card.querySelectorAll(".docs-map-group").map((group) => [
        text(group.querySelector(".docs-map-group-name")),
        ...group.querySelectorAll("a").map((a) => a.getAttribute("href")),
      ]),
    }));
    expect(cards).toEqual([
      { section: "Get started", groups: [["Basics", "/docs/widget/getting-started", "/docs/widget/configuration"]] },
      { section: "Reference", groups: [["Commands", "/docs/widget/commands"], ["More", "/docs/widget/troubleshooting"]] },
    ]);
  });

  it("hides Read the docs and the Documentation section for a product with no docs pages", () => {
    const root = productPage("gadget");
    expect(root.querySelector("#install")).not.toBeNull();
    expect(root.querySelector(".hero-actions a.button-primary")).toBeNull();
    expect(root.querySelector("#docs")).toBeNull();
    expect(root.querySelectorAll("a").filter((a) => a.getAttribute("href")?.startsWith("/docs/gadget"))).toEqual([]);
  });
});

describe("releases", () => {
  it("shows the latest release with its GitHub Release, then only the latest changelog entry", () => {
    const releases = productPage("widget").querySelector("#releases")!;
    expect(text(releases.querySelector("[data-release-latest] .release-version"))).toBe("1.4.0");
    expect(releases.querySelector(".release-link")?.getAttribute("href")).toBe("https://github.com/example-org/widget/releases/tag/1.4.0");
    expect(releases.querySelector(".release-log")).toBeNull();
    expect(texts(releases, ".release-entry :is(h3, h4, h5, h6)")).toEqual(["Features"]);
    expect(text(releases.querySelector(".release-entry"))).toContain("Write the plan as one JSON document with --json.");
    expect(text(releases)).not.toContain("Keep the input order");
  });

  it("leaves the intro, the older entries and the Earlier releases line to the releases page", () => {
    const releases = text(productPage("gadget").querySelector("#releases"));
    expect(releases).toContain("Show the queue depth in the console.");
    expect(releases).toContain("Keep the console open when a queue empties.");
    for (const older of ["Each released version", "Start the console with one command.", "Earlier releases"]) {
      expect(releases).not.toContain(older);
    }
  });

  it("shows the version with no date, and no releases, for a product with no release data", () => {
    const root = productPage("sprocket");
    expect(fact(root, "latest")).toBe("0.3.1");
    expect(root.querySelector("#releases [data-release-latest]")).toBeNull();
    expect(text(root.querySelector("#releases .release-none"))).toBe("No releases yet.");
  });

  it("shows only the latest release when the product has no changelog", () => {
    const releases = productPage("gizmo").querySelector("#releases")!;
    expect(text(releases.querySelector(".release-version"))).toBe("2.1.0");
    expect(releases.querySelector(".release-log, .release-entry")).toBeNull();
  });
});

describe("feature entry page", () => {
  const root = () => productPage("lantern");

  it("is the abbreviated page: hero, devcontainer.json snippet, README, releases", () => {
    const page = root();
    expect(page.querySelector("article.product")?.getAttribute("data-page")).toBe("feature");
    expect(page.querySelectorAll("article.product > section").map((s) => s.id)).toEqual(["install", "readme", "releases"]);
    expect(page.querySelector('#install [data-install-block="devcontainer-feature"] pre')?.textContent).toBe(
      '"features": {\n  "ghcr.io/example-org/features/lantern:1": {}\n}',
    );
  });

  it("renders the README as it is, with no generated options table and no docs", () => {
    const page = root();
    expect(texts(page, "#readme .product-prose h3, #readme .product-prose h4")).toEqual(["Lantern", "Example usage", "Options", "Releases", "Notes"]);
    expect(page.querySelectorAll("table").length).toBe(1);
    expect(page.querySelector("#readme table")).not.toBeNull();
    expect(page.querySelector(".hero-actions a.button-primary")).toBeNull();
    expect(page.querySelector("#docs, #highlights, .media-main")).toBeNull();
  });

  it("shows the feature's name, description and version from devcontainer-feature.json", () => {
    const page = root();
    expect(text(page.querySelector("h1.hero-name"))).toBe("Lantern");
    expect(text(page.querySelector(".hero-description"))).toBe("Installs the sample lantern tool into a dev container.");
    expect(fact(page, "kinds")).toBe("Dev container feature");
    expect(fact(page, "latest")).toBe("1.2.0 · 2026-10-05");
    expect(page.querySelector('[data-fact="status"]')).toBeNull();
  });

  it("renders each feature entry's own README", () => {
    expect(texts(productPage("beacon"), "#readme .product-prose h3, #readme .product-prose h4")).toEqual(["Beacon", "Usage"]);
  });

  it("shows the release from the tag, with no GitHub Release link, and the unit changelog's latest entry", () => {
    const releases = root().querySelector("#releases")!;
    expect(text(releases.querySelector(".release-version"))).toBe("1.2.0");
    expect(releases.querySelector(".release-link")).toBeNull();
    expect(texts(releases, ".release-entry h3")).toEqual(["Features"]);
  });
});

describe("embedded headings", () => {
  const level = (el: HTMLElement) => Number(el.tagName.slice(1));
  const embedded = (root: HTMLElement, section: string) => root.querySelectorAll(`#${section} .product-prose :is(h1, h2, h3, h4, h5, h6)`);
  /** Product pages with a README or a changelog, and which. */
  const WITH_README = ["lantern", "beacon"];
  const WITH_CHANGELOG = ["widget", "gadget", "lantern"];

  it("has the hero name as the only h1 of every product page", () => {
    for (const key of PRODUCTS) {
      const root = productPage(key);
      expect(texts(root, "h1"), key).toEqual([text(root.querySelector("h1.hero-name"))]);
    }
  });

  it("starts the README and the changelog at an h3, below the section's h2", () => {
    for (const key of WITH_README) {
      expect(level(embedded(productPage(key), "readme")[0]), `${key} README`).toBe(3);
    }
    for (const key of WITH_CHANGELOG) {
      expect(level(embedded(productPage(key), "releases")[0]), `${key} changelog`).toBe(3);
    }
  });

  it("moves each deeper level down by the same amount, and none past h6", () => {
    const readme = embedded(productPage("lantern"), "readme");
    expect(readme.map((h) => `${h.tagName} ${text(h)}`)).toEqual(["H3 Lantern", "H4 Example usage", "H4 Options", "H4 Releases", "H4 Notes"]);
    const changelog = embedded(productPage("gadget"), "releases");
    expect(changelog.map((h) => `${h.tagName} ${text(h)}`)).toEqual(["H3 Features", "H3 Fixes"]);
    for (const key of PRODUCTS) {
      for (const section of ["readme", "releases"]) {
        for (const heading of embedded(productPage(key), section)) expect(level(heading), `${key} ${section}`).toBeLessThanOrEqual(6);
      }
    }
  });

  it("repeats no id on any page", () => {
    for (const key of PRODUCTS) {
      const ids = productPage(key)
        .querySelectorAll("[id]")
        .map((el) => el.id);
      expect(ids.filter((id, i) => ids.indexOf(id) !== i), key).toEqual([]);
    }
  });

  it("gives every embedded heading an id that no element of the page itself has", () => {
    for (const key of PRODUCTS) {
      const root = productPage(key);
      const own = root
        .querySelectorAll("[id]")
        .filter((el) => !el.closest(".product-prose"))
        .map((el) => el.id);
      for (const heading of root.querySelectorAll(".product-prose :is(h1, h2, h3, h4, h5, h6)[id]")) {
        expect(own, `${key}: #${heading.id}`).not.toContain(heading.id);
        expect(heading.id, key).toMatch(new RegExp(`^(readme|changelog--${key})--.`));
      }
    }
  });

  it("keeps #releases on the Releases section when the README has a heading named Releases", () => {
    const root = productPage("lantern");
    expect(texts(root, "#readme .product-prose h4")).toContain("Releases");
    const withId = root.querySelectorAll('[id="releases"]');
    expect(withId).toHaveLength(1);
    expect(withId[0].tagName).toBe("SECTION");
    expect(text(withId[0].querySelector(":scope > h2"))).toBe("Releases");
    expect(root.getElementById("readme--releases")?.tagName).toBe("H4");
  });

  it("points a README link to one of its headings at the heading's new id", () => {
    const root = productPage("lantern");
    const link = root.querySelectorAll("#readme .product-prose a").find((a) => text(a) === "Options");
    expect(link?.getAttribute("href")).toBe("#readme--options");
    expect(text(root.getElementById("readme--options"))).toBe("Options");
  });

  it("leaves the docs pages as they were: levels and ids unchanged", () => {
    const widget = readFileSync(join(DIST, "docs", "widget", "getting-started", "index.html"), "utf8");
    expect(widget).not.toMatch(/id="(readme|changelog)--/);
    const changelog = parse(readFileSync(join("dist-fixtures/docs", "docs", "gadget", "changelog", "index.html"), "utf8"));
    expect(changelog.querySelector('.docs-prose h1[id="changelog"]')).not.toBeNull();
    expect(texts(changelog, ".docs-prose h2")).toEqual(["0.2.3", "0.2.0"]);
    expect(changelog.querySelector('.docs-prose h2[id="023"]')).not.toBeNull();
  });
});
