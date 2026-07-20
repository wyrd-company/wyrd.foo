import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

// The `content/` tree simulates the "docs tap": each tool repo pushes a
// self-contained folder — `content/<tool>/tool.yaml` (catalog metadata) plus
// `content/<tool>/docs/*.md` (pages). The site reads it; adding a folder
// self-registers a tool on the landing catalog and the docs nav.

const tools = defineCollection({
  loader: glob({
    pattern: "*/tool.yaml",
    base: "./content",
    // content/gitpr/tool.yaml -> "gitpr"
    generateId: ({ entry }) => entry.split("/")[0],
  }),
  schema: z.object({
    name: z.string(),
    tagline: z.string(),
    blurb: z.string(),
    category: z.string(),
    language: z.string(),
    status: z.enum(["stable", "preview", "planned"]),
    repo: z.string().url(),
    order: z.number().default(999),
    install: z
      .array(z.object({ label: z.string(), command: z.string() }))
      .default([]),
  }),
});

const docs = defineCollection({
  loader: glob({
    pattern: "*/docs/*.md",
    base: "./content",
    // content/gitpr/docs/overview.md -> "gitpr/overview"
    generateId: ({ entry }) => entry.replace("/docs/", "/").replace(/\.md$/, ""),
  }),
  schema: z.object({
    title: z.string(),
    order: z.number(),
    install: z.boolean().default(false),
  }),
});

export const collections = { tools, docs };
