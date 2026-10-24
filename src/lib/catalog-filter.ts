/*
 * Catalog tab and filter rules, shared by the home page build and its browser
 * script. Type imports only, so the browser bundle stays small.
 */
import type { Kind } from "../schema/vocabulary.ts";

/** Whether a row shows under a tab. */
export function inTab(row: { kinds: readonly Kind[] }, tab: "all" | Kind): boolean {
  return tab === "all" || row.kinds.includes(tab);
}

/** Whether a row matches the filter text: its name, key or category. */
export function matchesFilter(haystack: string, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const text = haystack.toLowerCase();
  return words.every((word) => text.includes(word));
}
