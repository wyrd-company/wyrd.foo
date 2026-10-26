/*
 * Which "On this page" entry is current: the last heading whose top has
 * scrolled to or past the line (the bottom of the sticky header). Before the
 * first heading reaches the line, none is current. At the end of the page the
 * last headings can never reach the line, so there the current entry is the
 * last heading that has come into view.
 */
export interface TocView {
  /** The line a heading must reach: the bottom of the sticky header. */
  line: number;
  /** The bottom of the viewport. */
  bottom: number;
  /** The page is scrolled to its end. */
  atEnd: boolean;
}

export function activeHeading(tops: readonly number[], view: TocView): number {
  const limit = view.atEnd ? view.bottom : view.line;
  let current = -1;
  tops.forEach((top, i) => {
    if (top <= limit) current = i;
  });
  return current;
}
