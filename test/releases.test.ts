/* The /releases list in lib/releases.ts, over the fixture content in test/fixtures/home-content. */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import type { HomeEntry } from "../src/lib/home";
import { releaseListings } from "../src/lib/releases";
import { toolFileSchema } from "../src/schema/index.ts";

const CONTENT = "test/fixtures/home-content";

function fixtures(): HomeEntry[] {
  return readdirSync(CONTENT).map((key) => ({
    key,
    data: toolFileSchema.parse(parse(readFileSync(join(CONTENT, key, "tool.yaml"), "utf8"))),
    hasDocs: false,
  }));
}

describe("releaseListings", () => {
  it("lists each product with a release and a changelog entry, newest release first, ties by key", () => {
    const withEntry = new Set(["alpha-cli", "beacon", "cinder-mcp", "delta-image", "feature-one", "feature-two"]);
    // delta-image has no release; feature-three has no changelog entry.
    expect(releaseListings(fixtures(), withEntry).map((r) => r.key)).toEqual(["feature-one", "feature-two", "beacon", "alpha-cli", "cinder-mcp"]);
  });

  it("leaves out a product with a release and no changelog entry", () => {
    expect(releaseListings(fixtures(), new Set(["beacon"])).map((r) => r.key)).toEqual(["beacon"]);
    expect(releaseListings(fixtures(), new Set())).toEqual([]);
  });

  it("shows the primary kind, the release version and date, and the mark", () => {
    const [cinder] = releaseListings(fixtures(), new Set(["cinder-mcp"]));
    expect(cinder).toMatchObject({
      key: "cinder-mcp",
      name: "cinder-mcp",
      kind: "mcp-server",
      version: "2.0.0",
      logo: "/assets/cinder-mcp/assets/logo.svg",
      logoDark: "/assets/cinder-mcp/assets/logo-dark.svg",
    });
    expect(cinder.date.toISOString().slice(0, 10)).toBe("2026-08-01");
  });
});
