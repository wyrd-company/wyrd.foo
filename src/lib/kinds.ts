/* Display names of product kinds: the search dialog's kind chips and the product page's facts list. */
import { KINDS, type Kind } from "../schema/vocabulary.ts";

export const KIND_LABELS: Record<Kind, string> = {
  cli: "CLI",
  "mcp-server": "MCP server",
  app: "App",
  "coding-harness-plugin": "Coding harness plugin",
  "devcontainer-feature": "Dev container feature",
  "devcontainer-image": "Dev container image",
};

/** The kinds a search index holds, in vocabulary order; values that are not kinds are left out. */
export function indexedKinds(counts: Record<string, number> | undefined): Kind[] {
  return KINDS.filter((kind) => (counts?.[kind] ?? 0) > 0);
}
