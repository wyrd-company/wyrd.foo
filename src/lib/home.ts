/*
 * What the home page shows: catalog rows and kind tabs, Recent releases, and
 * the featured product. Plain functions over ingested tool.yaml data, so the
 * page, its browser script and the tests share them.
 *
 * Feature entries (the short docs.yml entry for one dev container feature)
 * are catalog rows like any product, but they are never featured and are not
 * listed in Recent releases.
 */
import { isFeatureEntry } from "../schema/docs-file.ts";
import type { ToolFeature, ToolFile, ToolProduct } from "../schema/tool-file.ts";
import { KINDS, type Kind, type Status } from "../schema/vocabulary.ts";
import { inTab } from "./catalog-filter.ts";
import type { FeaturedCandidate } from "./featured.ts";
import { productAssetUrl } from "./product-assets.ts";

/** One ingested product: its key, its tool.yaml and whether it has docs pages. */
export interface HomeEntry {
  key: string;
  data: ToolFile;
  hasDocs: boolean;
}

export const KIND_LABEL: Record<Kind, string> = {
  cli: "CLI",
  "mcp-server": "MCP server",
  app: "App",
  "devcontainer-feature": "Dev container feature",
  "devcontainer-image": "Dev container image",
};

/** Catalog tab labels, in tab order after "All". */
export const KIND_TAB_LABEL: Record<Kind, string> = {
  cli: "CLIs",
  "mcp-server": "MCP servers",
  app: "Apps",
  "devcontainer-feature": "Dev container features",
  "devcontainer-image": "Dev container images",
};

export const STATUS_LABEL: Record<Status, string> = {
  stable: "Stable",
  preview: "Preview",
  planned: "Planned",
};

export function isFeature(data: ToolFile): data is ToolFeature {
  return isFeatureEntry(data);
}

export const productUrl = (key: string) => `/tools/${key}`;
export const docsUrl = (key: string) => `/docs/${key}/`;

/** The product's mark: logo URLs, when it has a logo. */
export function markOf(entry: HomeEntry): { logo?: string; logoDark?: string } {
  const { data, key } = entry;
  const logoDark = isFeature(data) ? undefined : data["logo-dark"];
  return {
    logo: data.logo ? productAssetUrl(key, data.logo) : undefined,
    logoDark: data.logo && logoDark ? productAssetUrl(key, logoDark) : undefined,
  };
}

type KindBlock = ToolProduct["kinds"][number] | ToolFeature["kinds"][number];

/**
 * The "get it" command of a kind block: the default install command (else the
 * first), or for dev container kinds the devcontainer.json line that adds it.
 */
export function getItCommand(block: KindBlock): string {
  switch (block.kind) {
    case "cli":
    case "app":
    case "mcp-server": {
      const install: { default?: boolean; command: string }[] = block.install;
      return (install.find((entry) => entry.default) ?? install[0]).command;
    }
    case "devcontainer-feature":
      return `"${block.ref}": {}`;
    case "devcontainer-image":
      return `"image": "${block.ref}"`;
  }
}

export interface CatalogRow {
  key: string;
  name: string;
  tagline: string;
  category: string;
  /** Feature entries have no status. */
  status?: Status;
  /** All kinds, primary first. */
  kinds: Kind[];
  primaryKind: Kind;
  getIt: string;
  hasDocs: boolean;
  isFeature: boolean;
  logo?: string;
  logoDark?: string;
}

/** Products with an `order` first, lower first; then the rest. Ties by name, then key. */
function catalogOrder(a: HomeEntry, b: HomeEntry): number {
  const oa = isFeature(a.data) ? undefined : a.data.order;
  const ob = isFeature(b.data) ? undefined : b.data.order;
  if (oa !== ob) {
    if (oa === undefined) return 1;
    if (ob === undefined) return -1;
    return oa - ob;
  }
  return compareName(a.data.name, b.data.name) || compareText(a.key, b.key);
}

/** Names ignore case: "beacon" before "Feature one". */
function compareName(a: string, b: string): number {
  return compareText(a.toLowerCase(), b.toLowerCase()) || compareText(a, b);
}

/** Code-unit order: the same in every locale. */
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function catalogRows(entries: readonly HomeEntry[]): CatalogRow[] {
  return [...entries].sort(catalogOrder).map((entry) => {
    const { key, data, hasDocs } = entry;
    const feature = isFeature(data);
    const primary = data.kinds[0];
    return {
      key,
      name: data.name,
      tagline: feature ? data.description : data.tagline,
      category: data.category,
      status: feature ? undefined : data.status,
      kinds: data.kinds.map((block) => block.kind),
      primaryKind: primary.kind,
      getIt: getItCommand(primary),
      hasDocs,
      isFeature: feature,
      ...markOf(entry),
    };
  });
}

export interface KindTab {
  /** "all", or a kind. */
  id: "all" | Kind;
  label: string;
  count: number;
}

/**
 * The catalog tabs: All, then one per kind that some row has, in kind order.
 * A row is under the tab of each of its kinds, and once under All.
 */
export function kindTabs(rows: readonly CatalogRow[]): KindTab[] {
  const tabs: KindTab[] = [{ id: "all", label: "All", count: rows.length }];
  for (const kind of KINDS) {
    const count = rows.filter((row) => inTab(row, kind)).length;
    if (count > 0) tabs.push({ id: kind, label: KIND_TAB_LABEL[kind], count });
  }
  return tabs;
}

export function filterText(row: Pick<CatalogRow, "name" | "key" | "category">): string {
  return `${row.name} ${row.key} ${row.category}`;
}

export interface RecentRelease {
  key: string;
  name: string;
  kind: Kind;
  version: string;
  date: Date;
  logo?: string;
  logoDark?: string;
}

export const RECENT_RELEASES = 5;

/** The newest releases, newest first. Feature entries are not listed. */
export function recentReleases(entries: readonly HomeEntry[], limit = RECENT_RELEASES): RecentRelease[] {
  return entries
    .flatMap((entry) => {
      const { data, key } = entry;
      if (isFeature(data) || !data.release) return [];
      return [
        {
          key,
          name: data.name,
          kind: data.kinds[0].kind,
          version: data.release.version,
          date: data.release.date,
          ...markOf(entry),
        },
      ];
    })
    .sort((a, b) => b.date.getTime() - a.date.getTime() || compareText(a.key, b.key))
    .slice(0, limit);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "12 Oct 2026", in UTC, the same in every locale. */
export function formatDate(date: Date): string {
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

// --- featured -----------------------------------------------------------

/** The featured candidates: every product that is not a feature entry. */
export function featuredCandidates(entries: readonly HomeEntry[]): FeaturedCandidate[] {
  return entries.flatMap(({ key, data }) => {
    if (isFeature(data)) return [];
    return [
      {
        key,
        stable: data.status === "stable",
        hasMedia: data.media.length > 0,
        featured: data.featured && { from: data.featured.from.getTime(), until: data.featured.until.getTime() },
        released: data.release?.date.getTime(),
      },
    ];
  });
}

export interface FeaturedCard {
  key: string;
  name: string;
  kind: Kind;
  status: Status;
  tagline: string;
  blurb: string;
  /** Docs when the product has docs pages, else the product page's install section. */
  getStarted: string;
  media: { src: string; alt: string };
  logo?: string;
  logoDark?: string;
}

/** The featured card of each product that can be featured, by key. */
export function featuredCards(entries: readonly HomeEntry[]): Map<string, FeaturedCard> {
  const cards = new Map<string, FeaturedCard>();
  for (const entry of entries) {
    const { key, data, hasDocs } = entry;
    if (isFeature(data)) continue;
    const media = data.media[0];
    cards.set(key, {
      key,
      name: data.name,
      kind: data.kinds[0].kind,
      status: data.status,
      tagline: data.tagline,
      blurb: data.blurb,
      getStarted: hasDocs ? docsUrl(key) : `${productUrl(key)}#install`,
      media: { src: productAssetUrl(key, media.src), alt: media.alt ?? media.caption },
      ...markOf(entry),
    });
  }
  return cards;
}
