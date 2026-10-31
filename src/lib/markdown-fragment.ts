// ---
// relationships:
//   implements: site
// ---
import type { Nodes } from "mdast";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkStringify from "remark-stringify";

// Match the site's CommonMark + GFM syntax. Serializing each document closes
// code fences and escapes unresolved references before another document can
// supply definitions for them.
const markdown = unified().use(remarkParse).use(remarkGfm).use(remarkStringify, { bullet: "-" });

/** Raw HTML is opaque to the Markdown serializer; close its EOF-scoped forms. */
function closeHtml(value: string): string {
  const start = value.trimStart();
  for (const [opening, closing] of [
    ["<!--", "-->"],
    ["<?", "?>"],
    ["<![CDATA[", "]]>"],
  ] as const) {
    if (start.startsWith(opening) && !start.includes(closing)) return `${value}\n${closing}`;
  }
  if (/^<![A-Z]/.test(start) && !start.includes(">")) return `${value}>`;
  const raw = /^<(script|pre|style|textarea)(?=[\s>])/i.exec(start);
  if (raw && !new RegExp(`</${raw[1]}\\s*>`, "i").test(start)) return `${value}\n</${raw[1]}>`;
  return value;
}

/** Preserve each embedded document's meaning without sharing reference scope. */
export function markdownFragment(source: string, scope: "readme" | "changelog"): string {
  const tree = markdown.parse(source);
  const identifiers = new Map<string, string>();
  function visit(node: Nodes): void {
    switch (node.type) {
      case "definition":
      case "linkReference":
      case "imageReference":
      case "footnoteDefinition":
      case "footnoteReference":
        // Full references keep their visible text, including collapsed and
        // shortcut forms. Labels and identifiers must agree for serialization.
        // Short generated labels also preserve source labels at Markdown's
        // maximum label length.
        if (!identifiers.has(node.identifier)) identifiers.set(node.identifier, `${scope}-${identifiers.size}`);
        node.identifier = identifiers.get(node.identifier)!;
        node.label = node.identifier;
        if (node.type === "linkReference" || node.type === "imageReference") node.referenceType = "full";
        break;
      case "html":
        node.value = closeHtml(node.value);
        break;
    }
    if ("children" in node) for (const child of node.children) visit(child);
  }
  visit(tree);
  return markdown.stringify(tree).trimEnd();
}
