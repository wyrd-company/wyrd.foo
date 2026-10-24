/*
 * Which "On this page" entry is current: the last heading whose top has
 * scrolled to or past the line (the bottom of the sticky header). Before the
 * first heading reaches the line, none is current.
 */
export function activeHeading(tops: readonly number[], line: number): number {
  let current = -1;
  tops.forEach((top, i) => {
    if (top <= line) current = i;
  });
  return current;
}
