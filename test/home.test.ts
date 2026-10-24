/*
 * The home page rules in lib/home.ts, lib/featured.ts and
 * lib/catalog-filter.ts, over the fixture content in test/fixtures/home-content.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { inTab, matchesFilter } from "../src/lib/catalog-filter";
import { pickFeatured, slotChange, utcWeek, type FeaturedCandidate } from "../src/lib/featured";
import {
  catalogRows,
  featuredCandidates,
  featuredCards,
  formatDate,
  getItCommand,
  kindTabs,
  recentReleases,
  type HomeEntry,
} from "../src/lib/home";
import { toolFileSchema } from "../src/schema/index.ts";

const CONTENT = "test/fixtures/home-content";
const WITH_DOCS = new Set(["alpha-cli", "beacon", "cinder-mcp"]);

function fixtures(): HomeEntry[] {
  return readdirSync(CONTENT).map((key) => ({
    key,
    data: toolFileSchema.parse(parse(readFileSync(join(CONTENT, key, "tool.yaml"), "utf8"))),
    hasDocs: WITH_DOCS.has(key),
  }));
}

const FEATURES = ["feature-one", "feature-three", "feature-two"];

describe("catalog rows", () => {
  const rows = catalogRows(fixtures());

  it("puts products with an order first, lower first, then the rest by name ignoring case", () => {
    expect(rows.map((r) => r.key)).toEqual(["alpha-cli", "cinder-mcp", "beacon", "delta-image", ...FEATURES]);
  });

  it("has one row per feature entry", () => {
    expect(rows.filter((r) => r.isFeature).map((r) => r.key)).toEqual(FEATURES);
  });

  it("takes the badge and the get-it command from the first kind", () => {
    const beacon = rows.find((r) => r.key === "beacon")!;
    expect(beacon.kinds).toEqual(["app", "devcontainer-feature"]);
    expect(beacon.primaryKind).toBe("app");
    expect(beacon.getIt).toBe("docker run ghcr.io/example-org/beacon:0.3");
  });

  it("uses the default install entry, else the first", () => {
    expect(rows.find((r) => r.key === "alpha-cli")!.getIt).toBe("brew install example-org/tap/alpha-cli");
    expect(rows.find((r) => r.key === "cinder-mcp")!.getIt).toBe("claude mcp add cinder -- npx -y cinder-mcp");
  });

  it("gives dev container kinds their devcontainer.json line", () => {
    expect(rows.find((r) => r.key === "feature-one")!.getIt).toBe('"ghcr.io/example-org/features/feature-one:1": {}');
    expect(rows.find((r) => r.key === "delta-image")!.getIt).toBe('"image": "ghcr.io/example-org/images/delta:1"');
    expect(getItCommand({ kind: "devcontainer-feature", ref: "ghcr.io/o/r/f:2" })).toBe('"ghcr.io/o/r/f:2": {}');
  });

  it("resolves logos to asset URLs, and gives no logo to a product without one", () => {
    const byKey = new Map(rows.map((r) => [r.key, r]));
    expect(byKey.get("alpha-cli")).toMatchObject({ logo: "/assets/alpha-cli/assets/logo.svg", logoDark: undefined });
    expect(byKey.get("cinder-mcp")).toMatchObject({
      logo: "/assets/cinder-mcp/assets/logo.svg",
      logoDark: "/assets/cinder-mcp/assets/logo-dark.svg",
    });
    expect(byKey.get("beacon")!.logo).toBeUndefined();
  });

  it("gives feature entries no status and their description as tagline", () => {
    const feature = rows.find((r) => r.key === "feature-two")!;
    expect(feature.status).toBeUndefined();
    expect(feature.tagline).toBe("Adds sample tool two to a dev container.");
  });
});

describe("kind tabs", () => {
  const rows = catalogRows(fixtures());
  const tabs = kindTabs(rows);
  const members = (tab: Parameters<typeof inTab>[1]) => rows.filter((r) => inTab(r, tab)).map((r) => r.key);

  it("lists All, then each kind present, in kind order, with counts", () => {
    expect(tabs.map((t) => [t.id, t.label, t.count])).toEqual([
      ["all", "All", 7],
      ["cli", "CLIs", 1],
      ["mcp-server", "MCP servers", 1],
      ["app", "Apps", 1],
      ["devcontainer-feature", "Dev container features", 4],
      ["devcontainer-image", "Dev container images", 1],
    ]);
  });

  it("shows a product under each of its kinds' tabs, and every row under All", () => {
    expect(members("app")).toEqual(["beacon"]);
    expect(members("devcontainer-feature")).toEqual(["beacon", ...FEATURES]);
    expect(members("all")).toHaveLength(rows.length);
  });

  it("leaves out a tab no row has", () => {
    const onlyCli = rows.filter((r) => r.key === "alpha-cli");
    expect(kindTabs(onlyCli).map((t) => t.id)).toEqual(["all", "cli"]);
  });
});

describe("catalog filter", () => {
  it("matches every word against name, key and category, ignoring case", () => {
    expect(matchesFilter("beacon beacon Agent Infrastructure", "agent BEA")).toBe(true);
    expect(matchesFilter("beacon beacon Agent Infrastructure", "agent tooling")).toBe(false);
    expect(matchesFilter("anything", "   ")).toBe(true);
  });
});

describe("recent releases", () => {
  const releases = recentReleases(fixtures());

  it("lists products newest first and leaves out feature entries, even with newer releases", () => {
    expect(releases.map((r) => r.key)).toEqual(["beacon", "alpha-cli", "cinder-mcp"]);
  });

  it("shows the primary kind and the release version", () => {
    expect(releases[0]).toMatchObject({ kind: "app", version: "0.3.1" });
  });

  it("formats dates in UTC with three-letter months", () => {
    expect(formatDate(new Date("2026-09-30T23:30:00Z"))).toBe("30 Sep 2026");
    expect(formatDate(new Date("2026-01-01T00:00:00Z"))).toBe("1 Jan 2026");
  });

  it("stops at the limit", () => {
    expect(recentReleases(fixtures(), 2)).toHaveLength(2);
  });
});

describe("featured", () => {
  const DAY = 86_400_000;
  const now = Date.parse("2026-10-24T12:00:00Z");

  it("never offers a feature entry", () => {
    expect(featuredCandidates(fixtures()).map((c) => c.key)).not.toEqual(expect.arrayContaining(["feature-one"]));
    expect([...featuredCards(fixtures()).keys()].sort()).toEqual(["alpha-cli", "beacon", "cinder-mcp", "delta-image"]);
  });

  it("picks the fixture's active feature", () => {
    expect(pickFeatured(featuredCandidates(fixtures()), now)).toBe("cinder-mcp");
  });

  it("links Get started to the docs, or to the install section when there are none", () => {
    const cards = featuredCards(fixtures());
    expect(cards.get("alpha-cli")!.getStarted).toBe("/docs/alpha-cli/");
    expect(cards.get("delta-image")!.getStarted).toBe("/tools/delta-image#install");
    expect(cards.get("alpha-cli")!.media.src).toBe("/assets/alpha-cli/assets/demo.png");
  });

  const c = (key: string, more: Partial<FeaturedCandidate> = {}): FeaturedCandidate => ({
    key,
    stable: true,
    hasMedia: true,
    ...more,
  });

  it("prefers the active feature with the latest from", () => {
    const candidates = [
      c("a", { featured: { from: now - 5 * DAY, until: now + DAY } }),
      c("b", { featured: { from: now - DAY, until: now + DAY } }),
      c("z", { released: now - DAY }),
    ];
    expect(pickFeatured(candidates, now)).toBe("b");
  });

  it("treats until as the end: a feature is over at until", () => {
    const candidates = [c("a", { featured: { from: now - DAY, until: now } }), c("b", { released: now - DAY })];
    expect(pickFeatured(candidates, now)).toBe("b");
  });

  it("treats from as the start: a feature is not active before from", () => {
    const candidates = [c("a", { featured: { from: now + 1, until: now + DAY } }), c("b", { released: now - DAY })];
    expect(pickFeatured(candidates, now)).toBe("b");
  });

  it("falls back to the newest release in the last 14 days", () => {
    const candidates = [c("a", { released: now - 3 * DAY }), c("b", { released: now - 2 * DAY }), c("c", { released: now - 20 * DAY })];
    expect(pickFeatured(candidates, now)).toBe("b");
    expect(pickFeatured([c("c", { released: now - 14 * DAY, stable: false })], now)).toBeUndefined();
  });

  it("ignores a release dated after now", () => {
    expect(pickFeatured([c("a", { released: now + DAY, stable: false })], now)).toBeUndefined();
  });

  it("otherwise rotates weekly through stable products with media, by key", () => {
    const pool = [c("d"), c("b"), c("x", { stable: false }), c("y", { hasMedia: false }), c("c")];
    const week = utcWeek(now);
    const picks = Array.from({ length: 12 }, (_, i) => pickFeatured(pool, now + i * 7 * DAY));
    expect(picks).toEqual(Array.from({ length: 12 }, (_, i) => ["b", "c", "d"][(week + i) % 3]));
  });

  it("has no pick when nothing qualifies", () => {
    expect(pickFeatured([c("x", { stable: false })], now)).toBeUndefined();
  });

  it("starts each UTC week on Monday", () => {
    const sunday = Date.parse("2026-10-25T23:59:59Z");
    const monday = Date.parse("2026-10-26T00:00:00Z");
    expect(utcWeek(monday)).toBe(utcWeek(sunday) + 1);
    expect(utcWeek(Date.parse("2026-10-19T00:00:00Z"))).toBe(utcWeek(sunday));
  });

  it("has no pick once an only feature has ended and nothing else qualifies", () => {
    const until = Date.parse("2026-10-15T00:00:00Z");
    const ended = [c("sample-app", { stable: false, featured: { from: Date.parse("2026-10-01T00:00:00Z"), until } })];
    expect(pickFeatured(ended, until - 1)).toBe("sample-app");
    expect(pickFeatured(ended, until)).toBeUndefined();
    expect(pickFeatured(ended, until + 30 * DAY)).toBeUndefined();
  });
});

describe("featured slot change", () => {
  const cards = new Set(["a", "b"]);
  const hasCard = (key: string) => cards.has(key);

  it("keeps the card when the browser picks the card the build wrote", () => {
    expect(slotChange("a", "a", hasCard)).toBe("keep");
  });

  it("swaps to the browser's pick when the page holds its card", () => {
    expect(slotChange("a", "b", hasCard)).toEqual({ swap: "b" });
    expect(slotChange(undefined, "b", hasCard)).toEqual({ swap: "b" });
  });

  it("clears the build's card when the browser has no pick", () => {
    expect(slotChange("a", undefined, hasCard)).toBe("clear");
  });

  it("clears the build's card when the browser's pick has no card", () => {
    expect(slotChange("a", "z", hasCard)).toBe("clear");
  });

  it("leaves an empty slot empty when the browser has no pick either", () => {
    expect(slotChange(undefined, undefined, hasCard)).toBe("keep");
    expect(slotChange(undefined, "z", hasCard)).toBe("keep");
  });

  it("clears an ended feature's card, the review case", () => {
    const until = Date.parse("2026-10-15T00:00:00Z");
    const ended: FeaturedCandidate[] = [
      { key: "sample-app", stable: false, hasMedia: true, featured: { from: Date.parse("2026-10-01T00:00:00Z"), until } },
    ];
    const has = (key: string) => key === "sample-app";
    for (const at of [until, until + 86_400_000]) {
      expect(slotChange("sample-app", pickFeatured(ended, at), has), new Date(at).toISOString()).toBe("clear");
    }
  });
});
