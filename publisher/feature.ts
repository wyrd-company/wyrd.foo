import { z } from "zod";
import { semver } from "../src/schema/fields.ts";

// A dev container feature's own files: `devcontainer-feature.json` holds its
// name, description, version and options; `README.md` is its page body.

export const FEATURE_JSON = "devcontainer-feature.json";
export const FEATURE_README = "README.md";

export const featureJsonSchema = z.looseObject({
  id: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/, "must be a feature id"),
  version: semver,
  name: z.string().min(1),
  description: z.string().min(1),
  options: z.record(z.string(), z.unknown()).default({}),
});

export type FeatureJson = z.output<typeof featureJsonSchema>;

/** The tag a feature is published under: the major of its version. */
export const featureTag = (version: string) => version.split(".")[0];

/** The derived OCI reference: `ghcr.io/<owner>/<repo>/<feature id>:<major>`. */
export function featureRef(ownerRepo: string, feature: FeatureJson): string {
  return `ghcr.io/${ownerRepo.toLowerCase()}/${feature.id}:${featureTag(feature.version)}`;
}

/** The last path segment of an OCI reference, without its tag or digest: the feature id it names. */
export function refName(ref: string): string {
  return ref.slice(ref.lastIndexOf("/") + 1).split(/[:@]/)[0];
}

/** True when `ref`, without its tag or digest, is `ghcr.io/<owner>/<repo>/<id>` of this repo (owner/repo lower-cased). */
export function isRefOf(ref: string, ownerRepo: string): boolean {
  const repository = `${ref.slice(0, ref.lastIndexOf("/") + 1)}${refName(ref)}`;
  return repository === `ghcr.io/${ownerRepo.toLowerCase()}/${refName(ref)}`;
}

/**
 * How an authored reference's tag differs from the feature's tag (the major of
 * its version), or undefined when it does not. A reference with no tag
 * differs. A digest reference (`@sha256:...`) pins one build and is not
 * compared.
 */
export function refTagDifference(ref: string, version: string): { tag?: string; expected: string } | undefined {
  const last = ref.slice(ref.lastIndexOf("/") + 1);
  if (last.includes("@")) return undefined;
  const colon = last.indexOf(":");
  const tag = colon === -1 ? undefined : last.slice(colon + 1);
  const expected = featureTag(version);
  return tag === expected ? undefined : { tag, expected };
}

/**
 * The option names a README documents: the first column of the table under
 * its `## Options` heading, without backticks. Empty when it has no such
 * section.
 */
export function readmeOptionNames(readme: string): string[] {
  const lines = readme.split(/\r?\n/);
  const start = lines.findIndex((line) => /^##\s+Options\s*$/i.test(line));
  if (start === -1) return [];
  const after = lines.slice(start + 1);
  const end = after.findIndex((line) => /^#{1,2}\s/.test(line));
  const section = end === -1 ? after : after.slice(0, end);
  const isRow = (line: string) => line.trim().startsWith("|");
  const first = section.findIndex(isRow);
  if (first === -1) return [];
  const rest = section.slice(first);
  const tableEnd = rest.findIndex((line) => !isRow(line));
  const table = tableEnd === -1 ? rest : rest.slice(0, tableEnd);
  // Row 0 holds the column names and row 1 the delimiter.
  return table
    .slice(2)
    .map((row) => row.trim().replace(/^\|/, "").split("|")[0].trim().replace(/^`(.*)`$/, "$1"))
    .filter((name) => name !== "");
}

/** The option names in only one of the README and the JSON, or undefined when they agree. */
export function optionDifference(readme: string, feature: FeatureJson): { onlyReadme: string[]; onlyJson: string[] } | undefined {
  const documented = new Set(readmeOptionNames(readme));
  const declared = new Set(Object.keys(feature.options));
  const onlyReadme = [...documented].filter((name) => !declared.has(name)).sort();
  const onlyJson = [...declared].filter((name) => !documented.has(name)).sort();
  return onlyReadme.length === 0 && onlyJson.length === 0 ? undefined : { onlyReadme, onlyJson };
}
