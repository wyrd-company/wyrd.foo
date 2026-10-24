// The wyrd.foo docs contract: the single source of truth for docs/user/docs.yml,
// page front matter and the ingested content/<key>/tool.yaml. The site and the
// publisher import this module; it has no Astro imports and runs under plain Node.

export * from "./vocabulary.ts";
export * from "./docs-file.ts";
export * from "./page.ts";
export * from "./tool-file.ts";
export * from "./cross-check.ts";
export * from "./image-header.ts";
export { formatIssue, parseWith, type ContractIssue, type ParseResult } from "./issues.ts";
