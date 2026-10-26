/*
 * The featured pick (docs/technical-designs/site.yml, featured-product).
 * The build writes its pick into the home page; the browser runs the same
 * function on its own clock and swaps the card when the result differs. This
 * module has no imports, so the browser bundle stays small.
 */

/** What the featured pick reads about one product. Times are epoch milliseconds. */
export interface FeaturedCandidate {
  key: string;
  stable: boolean;
  hasMedia: boolean;
  featured?: { from: number; until: number };
  released?: number;
}

const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;
export const RECENT_RELEASE_WINDOW = 14 * DAY;
// 1970-01-01 was a Thursday; weeks start on Monday, 1969-12-29.
const MONDAY_OFFSET = 3 * DAY;

/** The UTC week of a time: whole weeks, Monday to Monday, since 1969-12-29. */
export function utcWeek(now: number): number {
  return Math.floor((now + MONDAY_OFFSET) / WEEK);
}

/** Code-unit order: the same in every locale. */
const byKey = (a: FeaturedCandidate, b: FeaturedCandidate) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

/**
 * The featured product at `now` (docs/technical-designs/site.yml,
 * featured-product): an active feature, the latest `from` first; else the
 * newest release in the last 14 days; else a weekly rotation through stable
 * products with media, by key. Ties go to the lower key.
 */
export function pickFeatured(candidates: readonly FeaturedCandidate[], now: number): string | undefined {
  const sorted = [...candidates].sort(byKey);

  const active = sorted.filter((c) => c.featured && c.featured.from <= now && now < c.featured.until);
  if (active.length > 0) {
    return active.reduce((best, c) => (c.featured!.from > best.featured!.from ? c : best)).key;
  }

  const recent = sorted.filter((c) => c.released !== undefined && c.released <= now && now - c.released < RECENT_RELEASE_WINDOW);
  if (recent.length > 0) {
    return recent.reduce((best, c) => (c.released! > best.released! ? c : best)).key;
  }

  const pool = sorted.filter((c) => c.stable && c.hasMedia);
  if (pool.length === 0) return undefined;
  return pool[utcWeek(now) % pool.length].key;
}

/** What the browser does to the featured slot: keep it, swap in another card, or clear it. */
export type SlotChange = "keep" | "clear" | { swap: string };

/**
 * The change to the featured slot for the browser's pick. `shown` is the card
 * the build wrote (none when the build had no pick); `hasCard` tells whether
 * the page holds a card for a key. A card whose feature has ended must not
 * stay: with no pick, or a pick with no card, the slot is cleared.
 */
export function slotChange(
  shown: string | undefined,
  pick: string | undefined,
  hasCard: (key: string) => boolean,
): SlotChange {
  if (pick === shown) return "keep";
  if (pick !== undefined && hasCard(pick)) return { swap: pick };
  return shown === undefined ? "keep" : "clear";
}
