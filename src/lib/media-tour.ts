/* How the media tour's dialog moves through the tour's items. */

/** The item `delta` places from `index`, or null at an end of the tour: the tour stops there. */
export function tourStep(index: number, delta: number, count: number): number | null {
  const next = index + delta;
  return next >= 0 && next < count ? next : null;
}

/** An item's place in the tour: "3 of 8". */
export function tourPosition(index: number, count: number): string {
  return `${index + 1} of ${count}`;
}
