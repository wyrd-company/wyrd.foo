import { featuredSchema, formatIssue, parseWith } from "../src/schema/index.ts";
import type { RepoResult } from "./compute.ts";
import { Findings } from "./report.ts";

// The `feature` inputs of a manual run: they put one product on the front
// page from now for a number of days. A tag push sets none, so the existing
// `featured` block is carried forward (content.ts).

export const DEFAULT_FEATURE_REASON = "New release";

export interface FeatureRequest {
  /** The product to feature. Optional when the repo has one full product. */
  product?: string;
  /** How long the feature lasts, in whole days. */
  days: number;
  /** Why it is featured. Default `New release`. */
  reason?: string;
}

/**
 * Set `featured` on the requested product of a computed repo. The result
 * fails, with nothing to write, when the request names no product it can
 * feature or its block is not valid.
 */
export function applyFeature(result: RepoResult, request: FeatureRequest, now: Date): RepoResult {
  if (result.failed) return result;
  const findings = new Findings(true);
  const full = result.products.filter((product) => !product.feature);
  const key = request.product ?? (full.length === 1 ? full[0].key : undefined);
  const target = result.products.find((product) => product.key === key);

  if (key === undefined) {
    findings.error({ message: `the repo has ${full.length} products that can be featured (${full.map((product) => product.key).join(", ") || "none"}); name one in feature-product` });
  } else if (target === undefined) {
    findings.error({ key, message: `feature-product ${key} is not a product of this repo` });
  } else if (target.feature) {
    findings.error({ key, message: `${key} is a feature entry; a feature entry is never featured` });
  } else if (!Number.isInteger(request.days) || request.days < 1) {
    findings.error({ key, message: `feature-days must be a whole number of days, 1 or more; it is ${request.days}` });
  } else {
    const featured = {
      from: now.toISOString(),
      until: new Date(now.getTime() + request.days * 86_400_000).toISOString(),
      reason: request.reason === undefined || request.reason.trim() === "" ? DEFAULT_FEATURE_REASON : request.reason.trim(),
      version: target.tool.version,
    };
    const parsed = parseWith(featuredSchema, featured, `content/${key}/tool.yaml featured`);
    if (!parsed.ok) {
      for (const issue of parsed.issues) findings.error({ key, message: formatIssue(issue) });
    } else {
      const products = result.products.map((product) => (product === target ? { ...product, tool: { ...product.tool, featured } } : product));
      return { ...result, products };
    }
  }
  return { ...result, products: [], findings: [...result.findings, ...findings.list], failed: true };
}
