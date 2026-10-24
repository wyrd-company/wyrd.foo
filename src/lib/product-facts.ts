/* Labels and formats of the product page's facts list. */
import type { Status } from "../schema/index.ts";

export const STATUS_LABELS: Record<Status, string> = {
  stable: "Stable",
  preview: "Preview",
  planned: "Planned",
};

/** A release date as YYYY-MM-DD, in UTC: the date the release data names. */
export function formatReleaseDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
