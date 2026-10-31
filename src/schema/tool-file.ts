import { z } from "zod";
import { licenceSchema } from "./licence.ts";
import { featureEntryShape, productEntryShape } from "./docs-file.ts";
import { oneLine, ociRef, ownerRepo, releaseUnitId, repoPath, semver } from "./fields.ts";

// The schema of `content/<key>/tool.yaml`: a validated docs.yml entry, with
// its defaults resolved, plus the fields only the publisher writes.

const date = z.coerce.date();

export const releaseSchema = z.strictObject({
  version: semver,
  date,
  url: z.url().optional(),
  notes: z.string().optional(),
});

export const featuredSchema = z
  .strictObject({
    from: date,
    until: date,
    reason: oneLine,
    version: semver,
  })
  .refine((featured) => featured.from < featured.until, {
    message: "from must be before until",
    path: ["until"],
  });

const ingestShape = {
  "release-unit": releaseUnitId,
  owner: ownerRepo.describe("The repo that owns this key."),
  release: releaseSchema.optional(),
  licence: licenceSchema.optional(),
};

/** The docs folder of a product in its repo when the publisher names none. */
export const DEFAULT_DOCS_PATH = "docs/user";

/** tool.yaml for a full product entry. */
export const toolProductSchema = z.strictObject({
  ...productEntryShape,
  ...ingestShape,
  "docs-path": repoPath
    .default(DEFAULT_DOCS_PATH)
    .describe("The repo folder that holds the product's pages: docs/user, or docs/user/<key> in a repo with more than one docs unit."),
  featured: featuredSchema.optional(),
});

/**
 * tool.yaml for a feature entry. Name, description and version come from the
 * feature's devcontainer-feature.json; the reference is resolved. A feature
 * entry is never featured.
 */
export const toolFeatureSchema = z.strictObject({
  ...featureEntryShape,
  ...ingestShape,
  kinds: z.tuple([z.strictObject({ kind: z.literal("devcontainer-feature"), ref: ociRef })]),
  name: oneLine,
  description: z.string().min(1),
  version: semver,
});

export const toolFileSchema = z.union([toolFeatureSchema, toolProductSchema]);

export type ToolProduct = z.output<typeof toolProductSchema>;
export type ToolFeature = z.output<typeof toolFeatureSchema>;
export type ToolFile = z.output<typeof toolFileSchema>;
