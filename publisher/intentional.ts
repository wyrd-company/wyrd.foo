import { parse } from "yaml";
import { z } from "zod";

// The part of `.intentional/config.yml` the publisher reads: release units,
// each with its path, its primary tag template and its projections. These
// fields are the same in contract-1 and contract-2. Generated workflows are
// never read.

export const INTENTIONAL_CONFIG = ".intentional/config.yml";

const tagSchema = z.looseObject({ role: z.string(), template: z.string() });

const unitSchema = z.looseObject({
  path: z.string(),
  projections: z
    .array(z.looseObject({ adapter: z.string(), file: z.string(), pointer: z.string().optional() }))
    .default([]),
  tags: z.record(z.string(), tagSchema),
});

const configSchema = z.looseObject({
  contract: z.enum(["contract-1", "contract-2"]),
  "release-units": z.record(z.string(), unitSchema).default({}),
});

export interface ReleaseUnit {
  id: string;
  /** Unit folder relative to the repo root, with no leading `./` or trailing `/`. */
  path: string;
  /** The primary tag template, for example `{id}@{version}`. */
  primaryTag: string;
  /** Projection files, relative to the repo root. */
  projections: { adapter: string; file: string; pointer?: string }[];
}

export type IntentionalConfig = ReadonlyMap<string, ReleaseUnit>;

export class IntentionalConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IntentionalConfigError";
  }
}

/** Parse the config. Throws IntentionalConfigError when it is not a contract-1 or contract-2 config the publisher can read. */
export function parseIntentionalConfig(text: string): IntentionalConfig {
  let raw: unknown;
  try {
    raw = parse(text);
  } catch (error) {
    throw new IntentionalConfigError(`is not YAML: ${(error as Error).message}`);
  }
  const result = configSchema.safeParse(raw);
  if (!result.success) {
    throw new IntentionalConfigError(
      result.error.issues.map((issue) => `${issue.path.join(".") || "config"}: ${issue.message}`).join("; "),
    );
  }
  const units = new Map<string, ReleaseUnit>();
  for (const [id, unit] of Object.entries(result.data["release-units"])) {
    const primary = Object.values(unit.tags).filter((tag) => tag.role === "primary");
    if (primary.length !== 1) throw new IntentionalConfigError(`release-units.${id}: has ${primary.length} primary tags; needs one`);
    const path = normalizeFolder(unit.path);
    units.set(id, {
      id,
      path,
      primaryTag: primary[0].template,
      projections: unit.projections.map((projection) => ({ ...projection, file: joinPath(path, projection.file) })),
    });
  }
  return units;
}

/** The tag a template names for a unit and version. */
export function tagName(template: string, unitId: string, version: string): string {
  return template.replaceAll("{id}", unitId).replaceAll("{version}", version);
}

/** A file in a unit folder, relative to the repo root. */
export function unitFile(unit: ReleaseUnit, name: string): string {
  return joinPath(unit.path, name);
}

function normalizeFolder(path: string): string {
  return path.replace(/^\.\/?/, "").replace(/\/+$/, "");
}

function joinPath(folder: string, file: string): string {
  const name = file.replace(/^\.\//, "");
  return folder === "" ? name : `${folder}/${name}`;
}
