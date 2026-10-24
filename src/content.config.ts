import { defineCollection } from "astro:content";
import { contentGlob } from "./lib/content-glob.ts";
import { CONTENT_ROOT } from "./lib/content-root.ts";
import { pageSchema, pageSlugOf, toolFileSchema } from "./schema/index.ts";

// Collections validated by the shared docs contract in src/schema/. The
// publisher writes `<root>/<key>/tool.yaml`, and under `<root>/<key>/docs/`
// the product's docs folder (docs/user/ or docs/user/<key>/): pages at any
// depth, assets, and the docs changelog `CHANGELOG.md`, which is data, not a
// page. Adding a folder adds a product to the catalog and the docs nav.
// The root is WYRD_CONTENT_DIR, default `content/`.
const products = defineCollection({
  loader: contentGlob({
    pattern: "*/tool.yaml",
    base: CONTENT_ROOT,
    generateId: ({ entry }) => entry.split("/")[0],
  }),
  schema: toolFileSchema,
});

const pages = defineCollection({
  loader: contentGlob({
    pattern: ["*/docs/**/*.md", "!*/docs/CHANGELOG.md"],
    base: CONTENT_ROOT,
    // <key>/docs/guides/getting-started.md -> "<key>/getting-started"
    generateId: ({ entry }) => `${entry.split("/")[0]}/${pageSlugOf(entry)}`,
  }),
  schema: pageSchema,
});

// `<key>/docs/CHANGELOG.md`: the docs unit changelog, linked from the docs
// version footer (`/docs/<key>/changelog`).
const docsChangelogs = defineCollection({
  loader: contentGlob({
    pattern: "*/docs/CHANGELOG.md",
    base: CONTENT_ROOT,
    generateId: ({ entry }) => entry.split("/")[0],
  }),
});

// `<key>/README.md`: the page body of a feature entry.
const featureReadmes = defineCollection({
  loader: contentGlob({
    pattern: "*/README.md",
    base: CONTENT_ROOT,
    generateId: ({ entry }) => entry.split("/")[0],
  }),
});

// `<key>/CHANGELOG.md`: the code unit changelog, shown in the product page's
// Releases section.
const codeChangelogs = defineCollection({
  loader: contentGlob({
    pattern: "*/CHANGELOG.md",
    base: CONTENT_ROOT,
    generateId: ({ entry }) => entry.split("/")[0],
  }),
});

export const collections = { products, pages, docsChangelogs, featureReadmes, codeChangelogs };
