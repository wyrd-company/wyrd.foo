/*
 * The text of /llms.txt, in the llmstxt.org format: an H1 with the site name,
 * a blockquote summary, then H2 sections of Markdown link lists
 * (`- [title](url): notes`). A "Tools" section lists every catalog row; each
 * product with docs pages then has a "<name> docs" section, in the docs
 * reading order, linking each page's Markdown endpoint.
 */
import { markdownHref } from "./docs-pages";
import { productUrl, type CatalogRow } from "./home";
import { SITE_DESCRIPTION, SITE_NAME } from "./site";

/** A product's docs pages, in reading order. */
export interface LlmsDocs {
  key: string;
  name: string;
  pages: { slug: string; title: string }[];
}

/** Link text may not hold brackets. */
const linkText = (s: string) => s.replace(/[[\]]/g, "\\$&");
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

function entry(title: string, url: string, notes?: string): string {
  const note = notes === undefined ? "" : oneLine(notes);
  return `- [${linkText(oneLine(title))}](${url})${note === "" ? "" : `: ${note}`}`;
}

/**
 * `rows` are the catalog rows in catalog order; `docs` are the products that
 * have docs pages, in any order (sections follow catalog order). `site` is the
 * site's origin.
 */
export function llmsTxt(site: URL | string, rows: readonly CatalogRow[], docs: readonly LlmsDocs[]): string {
  const url = (path: string) => new URL(path, site).href;
  const docsByKey = new Map(docs.map((product) => [product.key, product]));
  const lines = [`# ${SITE_NAME}`, "", `> ${SITE_DESCRIPTION}`, "", "## Tools", ""];
  for (const row of rows) lines.push(entry(row.name, url(productUrl(row.key)), row.tagline));
  for (const { key } of rows) {
    const product = docsByKey.get(key);
    if (product === undefined || product.pages.length === 0) continue;
    lines.push("", `## ${oneLine(product.name)} docs`, "");
    for (const page of product.pages) lines.push(entry(page.title, url(markdownHref(key, page.slug))));
  }
  return `${lines.join("\n")}\n`;
}
