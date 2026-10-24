import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { namedAssetPaths, productAssetFiles } from "../src/lib/product-asset-files";
import type { ToolFile } from "../src/schema/index";

const product = {
  name: "widget",
  version: "1.0.0",
  "docs-version": "1.0.0",
  "release-unit": "widget",
  owner: "example-org/widget",
  tagline: "A widget.",
  blurb: "A widget.",
  status: "stable",
  category: "Agent Tooling",
  highlights: ["One."],
  logo: "assets/logo.svg",
  "logo-dark": "assets/logo-dark.svg",
  favicon: "assets/favicon.png",
  "social-image": "assets/social.png",
  media: [
    { src: "assets/demo.gif", caption: "A demo." },
    { src: "assets/logo.svg", caption: "The logo again." },
  ],
  kinds: [{ kind: "cli", install: [{ method: "cargo", os: ["linux"], command: "cargo install widget" }] }],
} as unknown as ToolFile;

const feature = {
  kinds: [{ kind: "devcontainer-feature", ref: "ghcr.io/example-org/features/lamp:1" }],
  source: "src/features/lamp",
  category: "Dev Containers",
  "release-unit": "lamp",
  owner: "example-org/features",
  name: "Lamp",
  description: "A lamp.",
  version: "1.0.0",
  logo: "assets/lamp.svg",
} as unknown as ToolFile;

describe("namedAssetPaths", () => {
  it("names every asset field of a product once, in field order", () => {
    expect(namedAssetPaths(product)).toEqual([
      "assets/logo.svg",
      "assets/logo-dark.svg",
      "assets/favicon.png",
      "assets/social.png",
      "assets/demo.gif",
    ]);
  });

  it("names only the logo of a feature entry", () => {
    expect(namedAssetPaths(feature)).toEqual(["assets/lamp.svg"]);
  });
});

describe("productAssetFiles", () => {
  it("maps each named asset to its published file under <root>/<key>/docs/", () => {
    expect(productAssetFiles("root", "lamp", feature, () => true)).toEqual([
      { path: "assets/lamp.svg", file: join("root", "lamp", "docs", "assets/lamp.svg") },
    ]);
  });

  it("fails, naming the product and the field value, when a named asset was not published", () => {
    const missing = join("root", "widget", "docs", "assets/demo.gif");
    expect(() => productAssetFiles("root", "widget", product, (file) => file !== missing)).toThrow(
      `widget/tool.yaml names assets/demo.gif, but ${missing} does not exist`,
    );
  });
});
