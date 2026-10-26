import assert from "node:assert/strict";
import { stripVTControlCharacters } from "node:util";

// Astro colours its output on GitHub Actions (CI + GITHUB_ACTIONS). Tests run
// it with colour forced on, so a local run sees the output a hosted run does,
// and match the text with the control sequences stripped.

/** Child environment entries that force colour on. */
export const COLOUR = { FORCE_COLOR: "1" };

/** The text of coloured output, after checking that it was coloured. */
export function plainText(output: string): string {
  assert.match(output, /\u001b\[[0-9;]*m/, "the output is coloured");
  return stripVTControlCharacters(output);
}
