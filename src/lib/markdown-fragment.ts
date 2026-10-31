// ---
// relationships:
//   implements: site
// ---
import { toHast } from "mdast-util-to-hast";
import { toHtml } from "hast-util-to-html";
import { parseFragment, type DefaultTreeAdapterTypes } from "parse5";
import { htmlVoidElements } from "html-void-elements";
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
    if (start.startsWith(opening) && !start.includes(closing)) {
      // CommonMark's block terminator and HTML's token terminator differ for
      // abrupt comments (<!--> and <!--->). Finish the Markdown block with an
      // empty HTML comment if the original HTML comment is already closed.
      if (opening === "<!--") {
        let unfinished = false;
        parseFragment(value, {
          onParseError(error) {
            if (error.code === "eof-in-comment") unfinished = true;
          },
        });
        if (!unfinished) return `${value}\n<!-- -->`;
      }
      return `${value}\n${closing}`;
    }
  }
  if (/^<![A-Z]/.test(start) && !start.includes(">")) return `${value}>`;
  return value;
}

/** Inspect the HTML interpretation without replacing the returned Markdown.
 * Locations distinguish EOF-open elements from explicit and implied closes.
 * parse5 owns nesting, raw-text modes, attributes, comments and foreign content.
 */
function htmlBoundary(source: string): string {
  const tree = markdown.parse(source);
  const html = toHtml(toHast(tree, { allowDangerousHtml: true }), {
    allowDangerousHtml: true,
  });
  let lexical = "";
  const options = {
    sourceCodeLocationInfo: true,
    onParseError(error: { code: string }) {
      if (error.code === "eof-in-comment") lexical = "-->";
      if (error.code === "eof-in-cdata") lexical = "]]>";
    },
  };
  parseFragment(html, options);
  // A comment nested in a block can hide every subsequent tag from the HTML
  // parser. Finish its token before inspecting the remaining element state.
  const closedHtml = html + lexical;
  const fragment = parseFragment(closedHtml, { sourceCodeLocationInfo: true });
  const open: DefaultTreeAdapterTypes.Element[] = [];
  function walk(node: DefaultTreeAdapterTypes.Node): void {
    if ("tagName" in node) {
      const location = node.sourceCodeLocation;
      // parse5 leaves an EOF-popped raw-text element's end at its start;
      // ordinary EOF-open elements end at the input length instead.
      if (
        location &&
        !location.endTag &&
        (location.endOffset === closedHtml.length || location.endOffset === location.startOffset) &&
        !(node.namespaceURI === "http://www.w3.org/1999/xhtml" && htmlVoidElements.includes(node.tagName))
      ) {
        open.push(node);
      }
      if (node.tagName === "template" && "content" in node) walk(node.content);
    }
    if ("childNodes" in node) node.childNodes.forEach(walk);
  }
  walk(fragment);
  return (
    lexical +
    open
      .reverse()
      .map((node) => `</${node.tagName}>`)
      .join("")
  );
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
        if (!identifiers.has(node.identifier))
          identifiers.set(node.identifier, `${scope}-${identifiers.size}`);
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
  const result = markdown.stringify(tree).trimEnd();
  const boundary = htmlBoundary(result);
  return boundary ? `${result}\n\n${boundary}` : result;
}
