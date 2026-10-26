import { z } from "zod";
import {
  assetPath,
  ociRef,
  oneLine,
  productKey,
  relationships,
  releaseUnitId,
  repoPath,
  semver,
  sourceFilePath,
} from "./fields.ts";
import {
  CATEGORIES,
  FEATURE_ENTRY_CATEGORY,
  INSTALL_METHODS,
  LABELLED_METHODS,
  MCP_INSTALL_METHODS,
  OPERATING_SYSTEMS,
  OS_FREE_METHODS,
  SITE_SETUP_METHODS,
  STATUSES,
} from "./vocabulary.ts";

// The schema of `docs/user/docs.yml`. Checks that need more than one file
// (pages, assets) are in cross-check.ts.

type Ctx = z.RefinementCtx;

const includes = (list: readonly string[], value: string) => list.includes(value);

// --- install --------------------------------------------------------------

const installEntry = z
  .strictObject({
    method: z.enum(INSTALL_METHODS),
    os: z
      .array(z.enum(OPERATING_SYSTEMS))
      .min(1)
      .optional()
      .describe("Systems the command runs on. Required, except for docker."),
    label: oneLine.optional().describe("Short qualifier, for example \"Debian, Ubuntu\". Required for other."),
    default: z.boolean().optional().describe("The command shown in the hero. At most one entry."),
    command: z
      .string()
      .min(1)
      .describe("One line, or several. For apt and rpm, only the install line: the site owns the repo setup."),
  })
  .superRefine((entry, ctx) => {
    if (entry.os === undefined && !includes(OS_FREE_METHODS, entry.method)) {
      ctx.addIssue({ code: "custom", path: ["os"], message: `is required for method ${entry.method}` });
    }
    if (entry.os !== undefined && new Set(entry.os).size !== entry.os.length) {
      ctx.addIssue({ code: "custom", path: ["os"], message: "lists a system more than once" });
    }
    checkLabel(entry, ctx);
    if (includes(SITE_SETUP_METHODS, entry.method) && !isSingleCommand(entry.command)) {
      ctx.addIssue({
        code: "custom",
        path: ["command"],
        message: `must be only the install line for method ${entry.method}; the site writes the repository setup`,
      });
    }
  });

const mcpInstallEntry = z
  .strictObject({
    method: z.enum(MCP_INSTALL_METHODS),
    label: oneLine.optional().describe("Tab qualifier. Required for plugin and other."),
    default: z.boolean().optional().describe("The command shown in the hero. At most one entry."),
    command: z.string().min(1).describe("The command or configuration for this client."),
  })
  .superRefine(checkLabel);

function checkLabel(entry: { method: string; label?: string }, ctx: Ctx) {
  if (entry.label === undefined && includes(LABELLED_METHODS, entry.method)) {
    ctx.addIssue({ code: "custom", path: ["label"], message: `is required for method ${entry.method}` });
  }
}

// One shell command: no line break and no command list or pipeline.
function isSingleCommand(command: string) {
  return !/[\r\n;|]|&&/.test(command.trim());
}

function atMostOneDefault(entries: { default?: boolean }[], ctx: Ctx) {
  const defaults = entries.flatMap((entry, index) => (entry.default ? [index] : []));
  for (const index of defaults.slice(1)) {
    ctx.addIssue({ code: "custom", path: [index, "default"], message: "is set on more than one entry" });
  }
}

const installList = z.array(installEntry).min(1).superRefine(atMostOneDefault);
const mcpInstallList = z.array(mcpInstallEntry).min(1).superRefine(atMostOneDefault);

// --- kinds ----------------------------------------------------------------

const mcpTool = z.strictObject({
  name: oneLine,
  description: oneLine,
  effect: oneLine.describe("Side effects, for example \"Read-only\" or \"Writes\"."),
});

const imageTag = z.strictObject({
  tag: oneLine,
  base: oneLine.optional(),
  architectures: z.array(oneLine).min(1).optional(),
});

export const cliKind = z.strictObject({ kind: z.literal("cli"), install: installList });
export const appKind = z.strictObject({ kind: z.literal("app"), install: installList });
export const mcpServerKind = z.strictObject({
  kind: z.literal("mcp-server"),
  install: mcpInstallList.describe("Client tabs are made from the entries present."),
  tools: z.array(mcpTool).min(1).describe("The tools the server exposes."),
});
export const devcontainerFeatureKind = z.strictObject({
  kind: z.literal("devcontainer-feature"),
  ref: ociRef,
});
export const devcontainerImageKind = z.strictObject({
  kind: z.literal("devcontainer-image"),
  ref: ociRef,
  tags: z
    .array(imageTag)
    .min(1)
    .optional()
    .describe("Registry tags, when the publisher cannot read them from the image build config."),
});

export const kindBlock = z.discriminatedUnion("kind", [
  cliKind,
  mcpServerKind,
  appKind,
  devcontainerFeatureKind,
  devcontainerImageKind,
]);

function uniqueKinds(kinds: { kind: string }[], ctx: Ctx) {
  const seen = new Set<string>();
  kinds.forEach((block, index) => {
    if (seen.has(block.kind)) {
      ctx.addIssue({ code: "custom", path: [index, "kind"], message: `${block.kind} is listed more than once` });
    }
    seen.add(block.kind);
  });
}

// --- product entry --------------------------------------------------------

const mediaItem = z.strictObject({
  src: assetPath,
  caption: oneLine,
  alt: oneLine.optional(),
});

export const navSchema = z
  .array(
    z.strictObject({
      section: oneLine,
      groups: z
        .array(z.strictObject({ group: oneLine, pages: z.array(oneLine).min(1) }))
        .min(1),
    }),
  )
  .min(1)
  .describe("Docs sections, groups and page slugs. Pages not listed go into a trailing More group.");

/** The fields of a full product entry. The ingested tool.yaml extends them. */
export const productEntryShape = {
  name: oneLine,
  version: semver.describe("The installed version, from the code unit. Written by intentional."),
  "docs-version": semver.describe("The docs version, from the docs unit <key>-docs. Written by intentional."),
  "release-unit": releaseUnitId.optional().describe("The code release unit. Default: the product key."),
  tagline: oneLine,
  blurb: z.string().min(1),
  status: z.enum(STATUSES),
  category: z.enum(CATEGORIES),
  order: z.number().int().optional().describe("Catalog position, lower first. Products without order sort after, by name."),
  kinds: z.array(kindBlock).min(1).superRefine(uniqueKinds).describe("Kind blocks. The first is the primary kind."),
  highlights: z.array(oneLine).min(1).max(6),
  media: z.array(mediaItem).min(1),
  nav: navSchema.optional(),
  logo: assetPath.optional().describe("Square SVG mark, listed in assets."),
  "logo-dark": assetPath.optional().describe("SVG mark for the dark theme, listed in assets."),
  favicon: assetPath.optional().describe("SVG or PNG, listed in assets."),
  "social-image": assetPath.optional().describe("PNG or JPEG, 1200x630, listed in assets."),
};

export const productEntry = z.strictObject(productEntryShape);

// --- feature entry --------------------------------------------------------

/** The fields of a feature entry. The ingested tool.yaml extends them. */
export const featureEntryShape = {
  kinds: z.tuple([
    z.strictObject({
      kind: z.literal("devcontainer-feature"),
      ref: ociRef
        .optional()
        .describe("Overrides the derived reference ghcr.io/<owner>/<repo>/<feature id>:<major>."),
    }),
  ]),
  source: repoPath.describe("Folder that holds devcontainer-feature.json and README.md."),
  category: z.enum(CATEGORIES).default(FEATURE_ENTRY_CATEGORY),
  logo: sourceFilePath.optional().describe("Square SVG mark, relative to source. Not listed in assets."),
  "release-unit": releaseUnitId.optional().describe("The feature's release unit. Default: the key."),
};

export const featureEntry = z
  .strictObject(featureEntryShape)
  .describe("Short entry for a dev container feature with its own README.md and devcontainer-feature.json.");

// --- docs.yml -------------------------------------------------------------

export const productOrFeatureEntry = z.union([featureEntry, productEntry]);

export const docsFileSchema = z
  .strictObject({
    schemaVersion: z.literal(1).describe("The site schema version this file targets."),
    assets: z.array(assetPath).default([]).describe("Files, relative to docs/user/, that are published."),
    products: z
      .record(productKey, productOrFeatureEntry)
      .refine((products) => Object.keys(products).length > 0, "must hold at least one product")
      .describe("Products, keyed by product key."),
    relationships: relationships.optional(),
  })
  .describe("docs/user/docs.yml: the products a tool repo publishes to wyrd.foo.");

export type DocsFile = z.output<typeof docsFileSchema>;
export type ProductEntry = z.output<typeof productEntry>;
export type FeatureEntry = z.output<typeof featureEntry>;
export type KindBlock = z.output<typeof kindBlock>;

/** True when the entry is a feature entry, the short entry for a dev container feature. */
export function isFeatureEntry(entry: ProductEntry | FeatureEntry): entry is FeatureEntry {
  return Object.hasOwn(entry, "source");
}

/** The release unit of a product or feature entry: `release-unit`, or the key. */
export function releaseUnitOf(key: string, entry: ProductEntry | FeatureEntry): string {
  return entry["release-unit"] ?? key;
}
