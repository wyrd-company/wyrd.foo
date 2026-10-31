// ---
// relationships:
//   implements: site
// ---
/** The product page as Markdown, using the same data and install helpers as its HTML form. */
import type { ToolFile, KindBlock } from "../schema/index";
import type { DocsMapSection } from "./docs-map";
import {
  copyText,
  devcontainerFeatureSnippet,
  devcontainerImageSnippet,
  mcpClientTabs,
  platformTabs,
} from "./install-blocks";
import { KIND_LABELS } from "./kinds";
import { formatReleaseDate, STATUS_LABELS } from "./product-facts";
import { productAssetUrl } from "./product-assets";
import { isVideo } from "./product-media";

const text = (value: string) =>
  value
    .replace(/([\\`*_[\]<>#])/g, "\\$1")
    .replace(/\s+/g, " ")
    .trim();
const link = (label: string, href: string) => `[${text(label)}](<${href}>)`;
const code = (value: string) => {
  const fence = "`".repeat(Math.max(3, ...[...value.matchAll(/`+/g)].map((match) => match[0].length + 1)));
  return `${fence}\n${value.trimEnd()}\n${fence}`;
};
const table = (headers: string[], rows: string[][]) =>
  [headers, headers.map(() => "---"), ...rows]
    .map((row) => `| ${row.map((cell) => text(cell).replace(/\|/g, "\\|")).join(" | ")} |`)
    .join("\n");

function installMarkdown(block: KindBlock): string {
  const parts = [`### ${KIND_LABELS[block.kind]}`];
  switch (block.kind) {
    case "cli":
    case "app":
      for (const platform of platformTabs(block.install)) {
        parts.push(`#### ${platform.label}`);
        for (const method of platform.methods) {
          parts.push(text([method.pill, method.qualifier].filter(Boolean).join(" · ")), code(copyText(method)));
        }
      }
      break;
    case "mcp-server":
      for (const client of mcpClientTabs(block.install)) {
        parts.push(`#### ${text(client.label)}${client.marketplace ? " (Plugin)" : ""}`, code(client.command));
      }
      parts.push(
        "#### Tools this server exposes",
        table(
          ["Tool", "What it does", "Side effects"],
          block.tools.map((tool) => [tool.name, tool.description, tool.effect]),
        ),
      );
      break;
    case "devcontainer-feature":
      parts.push("Add to devcontainer.json", code(devcontainerFeatureSnippet(block.ref)));
      break;
    case "devcontainer-image":
      parts.push("Image", code(block.ref), "Use in devcontainer.json", code(devcontainerImageSnippet(block.ref)));
      if (block.tags)
        parts.push(
          "#### Tags",
          table(
            ["Tag", "Base", "Architectures"],
            block.tags.map((tag) => [tag.tag, tag.base ?? "—", tag.architectures?.join(", ") ?? "—"]),
          ),
        );
      break;
  }
  return parts.join("\n\n");
}

export function productMarkdown(
  key: string,
  tool: ToolFile,
  map: readonly DocsMapSection[],
  readme?: string,
  latest?: { body: string; version: string },
): string {
  const product = "source" in tool ? undefined : tool;
  const parts = [`# ${text(tool.name)}`];
  if (product) parts.push(text(product.tagline));
  parts.push(text(product ? product.blurb : "description" in tool ? tool.description : ""));
  const facts = [
    `- Kinds: ${tool.kinds.map((block) => KIND_LABELS[block.kind]).join(" · ")}`,
    ...(product ? [`- Status: ${STATUS_LABELS[product.status]}`] : []),
    `- Latest: ${text(tool.release?.version ?? tool.version)}${tool.release ? ` · ${formatReleaseDate(tool.release.date)}` : ""}`,
    `- Category: ${text(tool.category)}`,
    `- Repository: ${link(tool.owner, `https://github.com/${tool.owner}`)}`,
  ];
  parts.push(facts.join("\n"));
  if (product) {
    parts.push("## Media");
    for (const media of product.media) {
      const href = productAssetUrl(key, media.src);
      parts.push(
        isVideo(media.src) ? link(media.alt ?? media.caption, href) : `!${link(media.alt ?? media.caption, href)}`,
      );
      parts.push(text(media.caption));
    }
    parts.push("## What it does", product.highlights.map((highlight) => `- ${text(highlight)}`).join("\n"));
  }
  parts.push("## Install", ...tool.kinds.map(installMarkdown));
  // Published README and release Markdown retain their source text and headings.
  if (readme !== undefined) parts.push("## README", readme.trim());
  if (map.length > 0) {
    parts.push("## Documentation");
    for (const section of map) {
      if (section.section) parts.push(`### ${text(section.section)}`);
      for (const group of section.groups) {
        parts.push(`${"#".repeat(section.section ? 4 : 3)} ${text(group.group)}`);
        parts.push(group.pages.map((page) => `- ${link(page.title, `/docs/${key}/${page.slug}`)}`).join("\n"));
      }
    }
  }
  parts.push("## Releases");
  if (tool.release) {
    parts.push(`Latest: ${text(tool.release.version)} · ${formatReleaseDate(tool.release.date)}`);
    if (tool.release.url) parts.push(link("Release notes on GitHub", tool.release.url));
  } else if (latest) parts.push(`Latest: ${text(latest.version)}`);
  else parts.push("No releases yet.");
  if (latest) parts.push(latest.body.trim(), link("All releases", `/tools/${key}/releases`));
  return `${parts.join("\n\n")}\n`;
}
