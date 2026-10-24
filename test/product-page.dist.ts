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

function tabIdByLabel(block: HTMLElement, label: string): string {
  const tab = block.querySelectorAll('[role="tab"]').find((t) => text(t) === label || text(t).endsWith(` ${label}`));
  expect(tab, `no tab ${label}`).toBeDefined();
  return tab!.id;
}

describe("product pages from the fixture content", () => {
  it("builds one page for each fixture product", () => {
    for (const key of PRODUCTS) productPage(key);
  });

  it("gives each page its hero, facts and the Releases section the header links to", () => {
    for (const key of PRODUCTS) {
      const root = productPage(key);
      expect(root.querySelector("h1.hero-name")).not.toBeNull();
      expect(root.querySelector("dl.facts"), key).not.toBeNull();
      expect(root.querySelector("section#releases"), key).not.toBeNull();
      const releases = root.querySelectorAll(".site-nav a").find((a) => text(a) === "Releases");
      expect(releases?.getAttribute("href"), key).toBe(`/tools/${key}#releases`);
    }
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
    expect(text(root.querySelector(".hero-install-label"))).toBe("Install with Homebrew (macOS, Linux)");
    expect(root.querySelector(".hero-install pre")?.textContent).toBe("brew install example-org/tap/gizmo");
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

  it("writes the repo.wyrd.foo setup above the apt and rpm install lines", () => {
    const root = productPage("widget");
    const linux = root.getElementById("install-cli-linux")!;
    expect(panelCode(root, tabIdByLabel(linux, "APT"))).toBe([...APT_SETUP, "sudo apt update", "sudo apt install widget"].join("\n"));
    expect(panelCode(root, tabIdByLabel(linux, "RPM"))).toBe([...RPM_SETUP, "sudo dnf install widget"].join("\n"));
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

describe("install block: MCP server", () => {
  it("makes one client tab per install entry, the plugin marketplaces included", () => {
    const root = productPage("sprocket");
    const block = root.querySelector('[data-install-block="mcp-server"]')!;
    expect(tabs(block, "MCP client")).toEqual([
      "Claude Code",
      "Claude Desktop",
      "Cursor",
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
  it("shows the latest release with its GitHub Release, then the code unit changelog", () => {
    const releases = productPage("widget").querySelector("#releases")!;
    expect(text(releases.querySelector("[data-release-latest] .release-version"))).toBe("1.4.0");
    expect(releases.querySelector(".release-link")?.getAttribute("href")).toBe("https://github.com/example-org/widget/releases/tag/1.4.0");
    expect(texts(releases, ".release-log h2")).toEqual(["1.4.0 - 2026-09-30", "1.3.1 - 2026-08-12"]);
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
    expect(releases.querySelector(".release-log")).toBeNull();
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
    expect(texts(page, "#readme .product-prose h1, #readme .product-prose h2")).toEqual(["Lantern", "Example usage", "Options", "Notes"]);
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
    expect(texts(productPage("beacon"), "#readme .product-prose h1, #readme .product-prose h2")).toEqual(["Beacon", "Usage"]);
  });

  it("shows the release from the tag, with no GitHub Release link, and the unit changelog", () => {
    const releases = root().querySelector("#releases")!;
    expect(text(releases.querySelector(".release-version"))).toBe("1.2.0");
    expect(releases.querySelector(".release-link")).toBeNull();
    expect(texts(releases, ".release-log h2")).toEqual(["1.2.0 - 2026-10-05"]);
  });
});
