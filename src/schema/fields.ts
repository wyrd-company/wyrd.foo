import { z } from "zod";

// Field formats shared by docs.yml, page front matter and the ingested
// tool.yaml.

/** A product key: the folder `content/<key>/`, the route `/tools/<key>` and a page's `product:`. */
export const productKey = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/, "must be lower-case letters, digits and hyphens")
  .describe("Product key: content/<key>/, /tools/<key> and a page's product:.");

/** A release unit id in `.intentional/config.yml`. */
export const releaseUnitId = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "must be a release unit id")
  .describe("Release unit id in .intentional/config.yml.");

// SemVer 2.0.0 (semver.org): numeric identifiers have no leading zero, and
// dot-separated prerelease and build identifiers are never empty.
const NUMERIC = "0|[1-9]\\d*";
const PRERELEASE_ID = `(?:${NUMERIC}|\\d*[a-zA-Z-][0-9a-zA-Z-]*)`;
const BUILD_ID = "[0-9a-zA-Z-]+";
const SEMVER = new RegExp(
  `^(?:${NUMERIC})\\.(?:${NUMERIC})\\.(?:${NUMERIC})` +
    `(?:-${PRERELEASE_ID}(?:\\.${PRERELEASE_ID})*)?` +
    `(?:\\+${BUILD_ID}(?:\\.${BUILD_ID})*)?$`,
);

export const semver = z.string().regex(SEMVER, "must be a SemVer 2.0.0 version, for example 1.2.3");

// No leading slash, no backslash, no `.` or `..` segment.
const RELATIVE_PATH = /^(?!\/)(?!.*(?:^|\/)\.{1,2}(?:\/|$))[^\\]+$/;

/** A file path relative to `docs/user/`. */
export const assetPath = z
  .string()
  .regex(RELATIVE_PATH, "must be a relative path inside docs/user/, with no . or .. segment")
  .describe("File path relative to docs/user/.");

/** A file path relative to a feature entry's `source` folder. */
export const sourceFilePath = z
  .string()
  .regex(RELATIVE_PATH, "must be a relative path inside the feature's source folder, with no . or .. segment")
  .describe("File path relative to the feature's source folder.");

/** A folder path relative to the repository root. */
export const repoPath = z
  .string()
  .regex(RELATIVE_PATH, "must be a relative path inside the repository, with no . or .. segment")
  .describe("Folder path relative to the repository root.");

/** An OCI reference, for example `ghcr.io/owner/repo/name:1`. */
export const ociRef = z
  .string()
  .regex(/^\S+$/, "must be an OCI reference with no spaces")
  .describe("OCI reference, for example ghcr.io/owner/repo/name:1.");

/** One line of text. */
export const oneLine = z
  .string()
  .min(1)
  .regex(/^[^\r\n]*$/, "must be one line");

/** `owner/repo` on GitHub. */
export const ownerRepo = z
  .string()
  .regex(/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/, "must be owner/repo");

/** Artifact metadata. The schema allows it; the site and the publisher ignore it. */
export const relationships = z
  .record(z.string(), z.unknown())
  .describe("Artifact metadata. Allowed and ignored.");
