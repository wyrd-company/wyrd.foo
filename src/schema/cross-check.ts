import { isFeatureEntry, type DocsFile, type FeatureEntry, type ProductEntry } from "./docs-file.ts";
import { readImageHeader, type ImageType } from "./image-header.ts";
import { fieldPath, type ContractIssue } from "./issues.ts";
import { pageSlugOf, type PageFrontMatter } from "./page.ts";

// The checks of a repo's docs/user/ tree that the schema cannot express,
// because they read more than one file.

export interface DocsTree {
  /** Path of docs.yml, as it is named in messages (for example `docs/user/docs.yml`). */
  docsFile: string;
  /** docs.yml, parsed with docsFileSchema. */
  docs: DocsFile;
  /** Every page, parsed with pageSchema. `path` is named in messages; its file name is the slug. */
  pages: readonly { path: string; data: PageFrontMatter }[];
  /** The files under docs/user/, keyed by their path relative to docs/user/. */
  files: ReadonlyMap<string, Uint8Array>;
}

type Entry = ProductEntry | FeatureEntry;

interface AssetRef {
  field: (string | number)[];
  path: string;
  /** File types the field accepts, when it is restricted. */
  types?: readonly ImageType[];
  /** Pixel size the field requires. */
  size?: { width: number; height: number };
}

const SOCIAL_IMAGE_SIZE = { width: 1200, height: 630 };

const EXTENSION_TYPES: Record<string, ImageType> = { svg: "svg", png: "png", jpg: "jpeg", jpeg: "jpeg" };

const TYPE_NAMES: Record<ImageType, string> = { svg: "SVG", png: "PNG", jpeg: "JPEG" };

/** Every cross-file contract violation in the tree. An empty list means the tree passes. */
export function crossCheck(tree: DocsTree): ContractIssue[] {
  return [...checkPages(tree), ...checkNav(tree), ...checkAssets(tree)];
}

function checkPages({ docs, pages }: DocsTree): ContractIssue[] {
  const issues: ContractIssue[] = [];
  const slugOwners = new Map<string, string>();
  for (const page of pages) {
    const key = page.data.product;
    const entry: Entry | undefined = docs.products[key];
    if (entry === undefined) {
      issues.push({ file: page.path, field: "product", message: `names product ${key}, which docs.yml does not list` });
      continue;
    }
    if (isFeatureEntry(entry)) {
      issues.push({ file: page.path, field: "product", message: `names feature entry ${key}; feature entries have no docs pages` });
      continue;
    }
    const slug = pageSlugOf(page.path);
    const owner = slugOwners.get(`${key}/${slug}`);
    if (owner !== undefined) {
      issues.push({ file: page.path, field: "slug", message: `${slug} is also the slug of ${owner} in product ${key}` });
    } else {
      slugOwners.set(`${key}/${slug}`, page.path);
    }
  }
  return issues;
}

function checkNav({ docsFile, docs, pages }: DocsTree): ContractIssue[] {
  const issues: ContractIssue[] = [];
  for (const [key, entry] of Object.entries(docs.products) as [string, Entry][]) {
    if (isFeatureEntry(entry) || entry.nav === undefined) continue;
    const slugs = new Set(pages.filter((page) => page.data.product === key).map((page) => pageSlugOf(page.path)));
    entry.nav.forEach((section, s) =>
      section.groups.forEach((group, g) =>
        group.pages.forEach((slug, p) => {
          if (!slugs.has(slug)) {
            issues.push({
              file: docsFile,
              field: fieldPath(["products", key, "nav", s, "groups", g, "pages", p]),
              message: `names page ${slug}, which product ${key} does not have`,
            });
          }
        }),
      ),
    );
  }
  return issues;
}

function checkAssets({ docsFile, docs, files }: DocsTree): ContractIssue[] {
  const issues: ContractIssue[] = [];
  docs.assets.forEach((path, index) => {
    if (!files.has(path)) {
      issues.push({ file: docsFile, field: fieldPath(["assets", index]), message: `${path} does not exist under docs/user/` });
    }
  });
  const listed = new Set(docs.assets);
  for (const [key, entry] of Object.entries(docs.products) as [string, Entry][]) {
    for (const ref of assetRefs(key, entry)) {
      const field = fieldPath(ref.field);
      if (!listed.has(ref.path)) {
        issues.push({ file: docsFile, field, message: `${ref.path} is not listed in assets` });
      }
      const problem = imageProblem(ref, files.get(ref.path));
      if (problem !== undefined) issues.push({ file: docsFile, field, message: problem });
    }
  }
  return issues;
}

function assetRefs(key: string, entry: Entry): AssetRef[] {
  const at = (...field: (string | number)[]) => ["products", key, ...field];
  const refs: AssetRef[] = [];
  if (entry.logo !== undefined) refs.push({ field: at("logo"), path: entry.logo, types: ["svg"] });
  if (isFeatureEntry(entry)) return refs;
  if (entry["logo-dark"] !== undefined) refs.push({ field: at("logo-dark"), path: entry["logo-dark"], types: ["svg"] });
  if (entry.favicon !== undefined) refs.push({ field: at("favicon"), path: entry.favicon, types: ["svg", "png"] });
  if (entry["social-image"] !== undefined) {
    refs.push({ field: at("social-image"), path: entry["social-image"], types: ["png", "jpeg"], size: SOCIAL_IMAGE_SIZE });
  }
  entry.media.forEach((item, index) => refs.push({ field: at("media", index, "src"), path: item.src }));
  return refs;
}

// The file's name and content must both be one of the accepted types, and a
// raster image must have the required size. A missing file is reported by the
// assets check.
function imageProblem(ref: AssetRef, bytes: Uint8Array | undefined): string | undefined {
  if (ref.types === undefined) return undefined;
  const expected = ref.types.map((type) => TYPE_NAMES[type]).join(" or ");
  const extension = ref.path.split(".").pop()?.toLowerCase() ?? "";
  const named = EXTENSION_TYPES[extension];
  if (named === undefined || !ref.types.includes(named)) return `${ref.path} must be ${expected}; its file extension is .${extension}`;
  if (bytes === undefined) return undefined;
  const header = readImageHeader(bytes);
  if (header === undefined || header.type !== named) return `${ref.path} must be ${expected}; its content is not ${TYPE_NAMES[named]}`;
  if (ref.size !== undefined && (header.width !== ref.size.width || header.height !== ref.size.height)) {
    return `${ref.path} must be ${ref.size.width}x${ref.size.height}; it is ${header.width}x${header.height}`;
  }
  return undefined;
}
