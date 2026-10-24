import { posix } from "node:path";
import { parse } from "yaml";
import {
  crossCheck,
  docsFileSchema,
  DOCS_CHANGELOG,
  docsPathOf,
  formatIssue,
  isFeatureEntry,
  isPageFile,
  pageSchema,
  parseWith,
  productDocsFolder,
  releaseUnitOf,
  toolFeatureSchema,
  toolProductSchema,
  type ContractIssue,
  type DocsFile,
  type FeatureEntry,
  type PageFrontMatter,
  type ProductEntry,
} from "../src/schema/index.ts";
import { FEATURE_JSON, FEATURE_README, featureJsonSchema, featureRef, optionDifference, type FeatureJson } from "./feature.ts";
import {
  INTENTIONAL_CONFIG,
  IntentionalConfigError,
  parseIntentionalConfig,
  tagName,
  unitFile,
  type IntentionalConfig,
  type ReleaseUnit,
} from "./intentional.ts";
import { linksOutside } from "./links.ts";
import { squareProblem } from "./logo.ts";
import { releaseFromTag, ReleaseLookupError, type ReleaseData, type ReleaseLookup } from "./releases.ts";
import { Findings, type Finding } from "./report.ts";
import type { RepoFiles, RepoTags } from "./repo-files.ts";

// The publisher core: from the files at one ref of one tool repo, compute
// every product's content folder. It reads and computes only; content.ts
// checks key ownership and writes.

export const DOCS_ROOT = "docs/user/";
export const DOCS_FILE = `${DOCS_ROOT}docs.yml`;
/** The code unit changelog, in the unit folder and in `content/<key>/`. */
export const CODE_CHANGELOG = "CHANGELOG.md";
const IMAGE_MANIFEST = "manifest.json";

export interface RepoInput {
  /** `owner/repo` of the tool repo. */
  ownerRepo: string;
  files: RepoFiles;
  tags: RepoTags;
  /** GitHub Releases. Without it, release data comes from local tags (local mode only). */
  releases?: ReleaseLookup;
  /** Publish mode: unmet requirements are errors, and a product needs its GitHub Release. */
  strict: boolean;
}

export interface ProductOutput {
  key: string;
  feature: boolean;
  /** The content of `content/<key>/tool.yaml`, validated with the site's tool.yaml schema. */
  tool: Record<string, unknown>;
  /** Every other file of `content/<key>/`, by path relative to it. */
  files: Map<string, Uint8Array>;
}

export interface RepoResult {
  ownerRepo: string;
  products: ProductOutput[];
  findings: Finding[];
  /** True when an error fails the repo; then nothing is written. */
  failed: boolean;
}

interface Context extends RepoInput {
  findings: Findings;
  config?: IntentionalConfig;
}

type Entry = ProductEntry | FeatureEntry;

/** Compute every product of the repo. Throws only on I/O failures of `files` or `tags`. */
export async function computeRepo(input: RepoInput): Promise<RepoResult> {
  if (input.strict && input.releases === undefined) throw new Error("publish mode needs a GitHub Release lookup");
  const findings = new Findings(input.strict);
  const ctx: Context = { ...input, findings };
  const result = (products: ProductOutput[]): RepoResult => ({
    ownerRepo: input.ownerRepo,
    products,
    findings: findings.list,
    failed: findings.failed,
  });

  const tree = await readTree(ctx);
  if (tree === undefined) return result([]);
  ctx.config = await readConfig(ctx);

  const products: ProductOutput[] = [];
  for (const [key, entry] of Object.entries(tree.docs.products) as [string, Entry][]) {
    const output = isFeatureEntry(entry) ? await featureOutput(ctx, tree, key, entry) : await productOutput(ctx, tree, key, entry);
    if (output !== undefined) products.push(output);
  }
  return result(findings.failed ? [] : products);
}

// --- docs/user/ -------------------------------------------------------------

interface Tree {
  docs: DocsFile;
  /** Files under docs/user/, by path relative to it. */
  files: Map<string, Uint8Array>;
  /** Pages, by path relative to docs/user/. */
  pages: Map<string, PageFrontMatter>;
}

async function readTree(ctx: Context): Promise<Tree | undefined> {
  const { findings } = ctx;
  const bytes = await ctx.files.read(DOCS_FILE);
  if (bytes === undefined) {
    findings.error({ file: DOCS_FILE, message: "does not exist" });
    return undefined;
  }
  const raw = parseYaml(ctx, DOCS_FILE, bytes);
  if (raw === undefined) return undefined;
  const docs = parseWith(docsFileSchema, raw, DOCS_FILE);
  if (!docs.ok) {
    reportIssues(findings, docs.issues);
    return undefined;
  }

  const files = new Map<string, Uint8Array>();
  for (const path of await ctx.files.list(DOCS_ROOT)) {
    const content = await ctx.files.read(path);
    if (content !== undefined) files.set(path.slice(DOCS_ROOT.length), content);
  }

  const keys = Object.keys(docs.data.products);
  const pages = new Map<string, PageFrontMatter>();
  for (const [path, content] of files) {
    if (!isPageFile(path, keys)) continue;
    const file = DOCS_ROOT + path;
    const source = new TextDecoder().decode(content);
    const page = parsePage(ctx, file, source);
    if (page !== undefined) pages.set(path, page);
    // A page is published inside its product's docs folder, so a link that leaves it points at nothing.
    const folder = page === undefined || !keys.includes(page.product) ? "" : productDocsFolder(page.product, files.keys());
    for (const link of linksOutside(file, source, DOCS_ROOT + folder)) {
      findings.warning({
        file,
        message: `line ${link.line}: link ${link.target} resolves to ${link.resolved}, outside ${DOCS_ROOT + folder}; that file is not published`,
      });
    }
  }

  const pageList = [...pages].map(([path, data]) => ({ path: DOCS_ROOT + path, data }));
  reportIssues(findings, crossCheck({ docsFile: DOCS_FILE, docs: docs.data, pages: pageList, files }));
  checkLogosSquare(findings, docs.data, files);
  return { docs: docs.data, files, pages };
}

function parsePage(ctx: Context, file: string, source: string): PageFrontMatter | undefined {
  const front = frontMatter(source);
  if (front === undefined) {
    ctx.findings.error({ file, message: "has no front matter" });
    return undefined;
  }
  const data = parseYaml(ctx, file, new TextEncoder().encode(front));
  if (data === undefined) return undefined;
  const page = parseWith(pageSchema, data, file);
  if (page.ok) return page.data;
  reportIssues(ctx.findings, page.issues);
  return undefined;
}

function checkLogosSquare(findings: Findings, docs: DocsFile, files: Map<string, Uint8Array>) {
  for (const [key, entry] of Object.entries(docs.products) as [string, Entry][]) {
    const folder = productDocsFolder(key, files.keys());
    const logos: [string, string | undefined][] = [["logo", entry.logo]];
    if (!isFeatureEntry(entry)) logos.push(["logo-dark", entry["logo-dark"]]);
    for (const [field, path] of logos) {
      const bytes = path === undefined || !path.toLowerCase().endsWith(".svg") ? undefined : files.get(folder + path);
      const problem = bytes === undefined ? undefined : squareProblem(bytes);
      if (problem !== undefined) findings.error({ key, file: DOCS_FILE, message: `products.${key}.${field}: ${path} ${problem}` });
    }
  }
}

async function readConfig(ctx: Context): Promise<IntentionalConfig | undefined> {
  const bytes = await ctx.files.read(INTENTIONAL_CONFIG);
  if (bytes === undefined) {
    ctx.findings.unmet("intentional", { file: INTENTIONAL_CONFIG, message: "does not exist; no release data or changelog" });
    return undefined;
  }
  try {
    return parseIntentionalConfig(new TextDecoder().decode(bytes));
  } catch (error) {
    if (!(error instanceof IntentionalConfigError)) throw error;
    ctx.findings.error({ file: INTENTIONAL_CONFIG, message: error.message });
    return undefined;
  }
}

// --- products ---------------------------------------------------------------

async function productOutput(ctx: Context, tree: Tree, key: string, entry: ProductEntry): Promise<ProductOutput | undefined> {
  const files = new Map<string, Uint8Array>();
  const unitId = releaseUnitOf(key, entry);
  const unit = codeUnit(ctx, key, unitId);
  if (ctx.config !== undefined && !ctx.config.has(`${key}-docs`)) {
    ctx.findings.unmet("docs unit", { key, file: INTENTIONAL_CONFIG, message: `has no docs unit ${key}-docs` });
  }

  const changelog = unit === undefined ? undefined : await codeChangelog(ctx, key, unit);
  if (changelog !== undefined) files.set(CODE_CHANGELOG, changelog);
  const release = unit === undefined ? undefined : await productRelease(ctx, key, unit, entry.version, changelog);

  // content/<key>/docs/ mirrors the product's docs folder.
  const folder = productDocsFolder(key, tree.files.keys());
  const productPages = [...tree.pages].filter(([, page]) => page.product === key).map(([path]) => path);
  for (const path of productPages) {
    if (path.startsWith(folder)) files.set(`docs/${path.slice(folder.length)}`, tree.files.get(path)!);
    else ctx.findings.error({ key, file: DOCS_ROOT + path, message: `is outside the docs folder of product ${key}, ${DOCS_ROOT}${folder}` });
  }
  for (const path of usedAssets(ctx, tree, key, entry, folder, productPages)) files.set(`docs/${path.slice(folder.length)}`, tree.files.get(path)!);
  const docsChangelog = tree.files.get(folder + DOCS_CHANGELOG);
  if (docsChangelog !== undefined) files.set(`docs/${DOCS_CHANGELOG}`, docsChangelog);

  const kinds = await Promise.all(entry.kinds.map((block) => (block.kind === "devcontainer-image" ? imageKind(ctx, key, entry, unit, block, files) : block)));
  const tool = {
    ...entry,
    kinds,
    "release-unit": unitId,
    owner: ctx.ownerRepo,
    "docs-path": docsPathOf(folder),
    ...(release === undefined ? {} : { release: releaseYaml(release) }),
  };
  return validated(ctx, key, tool, files, false);
}

/**
 * The listed assets a product uses, by path relative to docs/user/: the ones
 * its fields name (relative to its docs folder), and the ones its pages link
 * to. A linked asset outside the product's docs folder is not published with
 * it, so it gets a warning.
 */
function usedAssets(ctx: Context, tree: Tree, key: string, entry: ProductEntry, folder: string, pages: string[]): string[] {
  const fields = [entry.logo, entry["logo-dark"], entry.favicon, entry["social-image"], ...entry.media.map((item) => item.src)];
  const named = new Set(fields.flatMap((path) => (path === undefined ? [] : [folder + path])));
  const texts = pages.map((path) => ({ dir: posix.dirname(path), text: new TextDecoder().decode(tree.files.get(path)) }));
  const linked = (asset: string) => texts.some(({ dir, text }) => text.includes(posix.relative(dir, asset)));
  return tree.docs.assets.filter((asset) => {
    if (!tree.files.has(asset) || !(named.has(asset) || linked(asset))) return false;
    if (asset.startsWith(folder)) return true;
    ctx.findings.warning({ key, message: `a page links to ${DOCS_ROOT}${asset}, outside the docs folder ${DOCS_ROOT}${folder}; it is not published with ${key}` });
    return false;
  });
}

async function imageKind(
  ctx: Context,
  key: string,
  entry: ProductEntry,
  unit: ReleaseUnit | undefined,
  block: Extract<ProductEntry["kinds"][number], { kind: "devcontainer-image" }>,
  files: Map<string, Uint8Array>,
) {
  const path = unit?.projections.find((projection) => projection.adapter === "json" && posix.basename(projection.file) === IMAGE_MANIFEST)?.file;
  const bytes = path === undefined ? undefined : await ctx.files.read(path);
  if (path === undefined || bytes === undefined) {
    ctx.findings.unmet("generated data", {
      key,
      message: `no ${IMAGE_MANIFEST} found through a json projection of release unit ${releaseUnitOf(key, entry)}`,
    });
    return block;
  }
  files.set(IMAGE_MANIFEST, bytes);
  let manifest: { version?: unknown; variants?: unknown; architectures?: unknown };
  try {
    manifest = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    ctx.findings.error({ key, file: path, message: "is not JSON" });
    return block;
  }
  if (manifest.version !== entry.version) {
    ctx.findings.warning({ key, file: path, message: `has version ${String(manifest.version)}; docs.yml has ${entry.version}` });
  }
  if (block.tags !== undefined || !isStringList(manifest.variants)) return block;
  const architectures = isStringList(manifest.architectures) ? { architectures: manifest.architectures } : {};
  return { ...block, tags: manifest.variants.map((tag) => ({ tag, ...architectures })) };
}

const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string" && item !== "");

// --- feature entries --------------------------------------------------------

async function featureOutput(ctx: Context, tree: Tree, key: string, entry: FeatureEntry): Promise<ProductOutput | undefined> {
  const files = new Map<string, Uint8Array>();
  const jsonPath = `${entry.source}/${FEATURE_JSON}`;
  const readmePath = `${entry.source}/${FEATURE_README}`;
  const [jsonBytes, readme] = [await ctx.files.read(jsonPath), await ctx.files.read(readmePath)];
  for (const [path, bytes] of [[jsonPath, jsonBytes], [readmePath, readme]] as const) {
    if (bytes === undefined) ctx.findings.error({ key, file: path, message: `does not exist; feature entry ${key} names source ${entry.source}` });
  }
  if (jsonBytes === undefined || readme === undefined) return undefined;
  const feature = parseFeatureJson(ctx, key, jsonPath, jsonBytes);
  if (feature === undefined) return undefined;
  files.set(FEATURE_JSON, jsonBytes);
  files.set(FEATURE_README, readme);

  const difference = optionDifference(new TextDecoder().decode(readme), feature);
  if (difference !== undefined) {
    const parts = [
      difference.onlyReadme.length > 0 ? `README only: ${difference.onlyReadme.join(", ")}` : "",
      difference.onlyJson.length > 0 ? `${FEATURE_JSON} only: ${difference.onlyJson.join(", ")}` : "",
    ].filter(Boolean);
    ctx.findings.warning({ key, file: readmePath, message: `option names differ from ${FEATURE_JSON} (${parts.join("; ")})` });
  }

  const unitId = releaseUnitOf(key, entry);
  const unit = codeUnit(ctx, key, unitId);
  const changelog = unit === undefined ? undefined : await codeChangelog(ctx, key, unit);
  if (changelog !== undefined) files.set(CODE_CHANGELOG, changelog);
  const release = unit === undefined ? undefined : await tagRelease(ctx, key, unit, feature.version, changelog);
  const logo = entry.logo === undefined ? undefined : tree.files.get(productDocsFolder(key, tree.files.keys()) + entry.logo);
  if (logo !== undefined) files.set(`docs/${entry.logo}`, logo);

  const tool = {
    ...entry,
    kinds: [{ kind: "devcontainer-feature", ref: entry.kinds[0].ref ?? featureRef(ctx.ownerRepo, feature) }],
    "release-unit": unitId,
    owner: ctx.ownerRepo,
    ...(release === undefined ? {} : { release: releaseYaml(release) }),
    name: feature.name,
    description: feature.description,
    version: feature.version,
  };
  return validated(ctx, key, tool, files, true);
}

function parseFeatureJson(ctx: Context, key: string, path: string, bytes: Uint8Array): FeatureJson | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    ctx.findings.error({ key, file: path, message: "is not JSON" });
    return undefined;
  }
  const result = parseWith(featureJsonSchema, raw, path);
  if (result.ok) return result.data;
  reportIssues(ctx.findings, result.issues, key);
  return undefined;
}

// --- release data -----------------------------------------------------------

function codeUnit(ctx: Context, key: string, unitId: string): ReleaseUnit | undefined {
  if (ctx.config === undefined) return undefined;
  const unit = ctx.config.get(unitId);
  if (unit === undefined) ctx.findings.unmet("release unit", { key, file: INTENTIONAL_CONFIG, message: `has no release unit ${unitId}` });
  return unit;
}

async function codeChangelog(ctx: Context, key: string, unit: ReleaseUnit): Promise<Uint8Array | undefined> {
  const path = unitFile(unit, CODE_CHANGELOG);
  const bytes = await ctx.files.read(path);
  if (bytes === undefined) ctx.findings.unmet("changelog", { key, file: path, message: `does not exist; release unit ${unit.id} has no changelog` });
  return bytes;
}

/** A product's release: its GitHub Release, else (local mode) its local tag. */
async function productRelease(
  ctx: Context,
  key: string,
  unit: ReleaseUnit,
  version: string,
  changelog: Uint8Array | undefined,
): Promise<ReleaseData | undefined> {
  const tag = tagName(unit.primaryTag, unit.id, version);
  if (ctx.releases !== undefined) {
    try {
      return { version, ...(await ctx.releases.release(ctx.ownerRepo, tag)) };
    } catch (error) {
      if (!(error instanceof ReleaseLookupError)) throw error;
      ctx.findings.unmet("GitHub Release", { key, message: error.message });
      if (ctx.strict) return undefined;
    }
  }
  return tagRelease(ctx, key, unit, version, changelog);
}

/** Release data from the unit's local tag and changelog. */
async function tagRelease(
  ctx: Context,
  key: string,
  unit: ReleaseUnit,
  version: string,
  changelog: Uint8Array | undefined,
): Promise<ReleaseData | undefined> {
  const name = tagName(unit.primaryTag, unit.id, version);
  const tag = await ctx.tags.read(name);
  if (tag === undefined) {
    ctx.findings.unmet("release tag", { key, message: `tag ${name} of release unit ${unit.id} does not exist` });
    return undefined;
  }
  if (!tag.annotated) ctx.findings.warning({ key, message: `tag ${name} is not annotated; the release date is its commit date` });
  return releaseFromTag(tag, version, changelog === undefined ? undefined : new TextDecoder().decode(changelog));
}

function releaseYaml(release: ReleaseData): Record<string, unknown> {
  return { ...release, date: release.date.toISOString() };
}

// --- helpers ----------------------------------------------------------------

function validated(ctx: Context, key: string, tool: Record<string, unknown>, files: Map<string, Uint8Array>, feature: boolean): ProductOutput | undefined {
  const result = parseWith(feature ? toolFeatureSchema : toolProductSchema, tool, `content/${key}/tool.yaml`);
  if (!result.ok) {
    reportIssues(ctx.findings, result.issues, key);
    return undefined;
  }
  return { key, feature, tool, files };
}

function reportIssues(findings: Findings, issues: ContractIssue[], key?: string) {
  for (const issue of issues) findings.error({ ...(key === undefined ? {} : { key }), message: formatIssue(issue) });
}

function parseYaml(ctx: Context, file: string, bytes: Uint8Array): unknown {
  try {
    return parse(new TextDecoder().decode(bytes));
  } catch (error) {
    ctx.findings.error({ file, message: `is not YAML: ${(error as Error).message}` });
    return undefined;
  }
}

/** The YAML between the opening `---` and the closing `---`, or undefined when there is none. */
function frontMatter(source: string): string | undefined {
  return /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source)?.[1];
}
