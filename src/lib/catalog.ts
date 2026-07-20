import { getCollection, type CollectionEntry } from "astro:content";

export type ToolStatus = "stable" | "preview" | "planned";

export const STATUS_LABEL: Record<ToolStatus, string> = {
  stable: "Stable",
  preview: "Preview",
  planned: "Planned",
};

// Known category order for grouping the landing catalog. Categories that a tool
// self-registers but that are not listed here fall to the end, alphabetically.
export const CATEGORY_ORDER = [
  "Git & Review",
  "Release & Versioning",
  "Agent Tooling",
  "Agent Infrastructure",
  "Knowledge & Planning",
  "Code Intelligence",
];

export interface CatalogTool {
  slug: string;
  name: string;
  tagline: string;
  blurb: string;
  category: string;
  language: string;
  status: ToolStatus;
  repo: string;
  order: number;
  install: { label: string; command: string }[];
  hasDocs: boolean;
}

export interface DocPageMeta {
  slug: string;
  title: string;
  order: number;
  install: boolean;
  entry: CollectionEntry<"docs">;
}

const toolSlugOf = (id: string) => id.split("/")[0];
const pageSlugOf = (id: string) => id.split("/")[1];

/** All tools, enriched with whether they ship docs, sorted by `order`. */
export async function getCatalog(): Promise<CatalogTool[]> {
  const [tools, docs] = await Promise.all([
    getCollection("tools"),
    getCollection("docs"),
  ]);
  const docToolSlugs = new Set(docs.map((d) => toolSlugOf(d.id)));

  return tools
    .map((t) => ({
      slug: t.id,
      ...t.data,
      hasDocs: docToolSlugs.has(t.id),
    }))
    .sort((a, b) => a.order - b.order);
}

/** Landing catalog grouped by category, using CATEGORY_ORDER then alphabetical. */
export async function getCatalogByCategory(): Promise<
  { category: string; tools: CatalogTool[] }[]
> {
  const catalog = await getCatalog();
  const categories = [...new Set(catalog.map((t) => t.category))].sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a);
    const ib = CATEGORY_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
  return categories.map((category) => ({
    category,
    tools: catalog.filter((t) => t.category === category),
  }));
}

/** Tools that ship at least one docs page, sorted — drives the docs top nav. */
export async function getDocTools(): Promise<CatalogTool[]> {
  return (await getCatalog()).filter((t) => t.hasDocs);
}

/** Pages for one tool, sorted by `order`. */
export async function getToolPages(toolSlug: string): Promise<DocPageMeta[]> {
  const docs = await getCollection("docs", (e) => toolSlugOf(e.id) === toolSlug);
  return docs
    .map((entry) => ({
      slug: pageSlugOf(entry.id),
      title: entry.data.title,
      order: entry.data.order,
      install: entry.data.install,
      entry,
    }))
    .sort((a, b) => a.order - b.order);
}
