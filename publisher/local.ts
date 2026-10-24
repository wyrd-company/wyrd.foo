import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { computeRepo } from "./compute.ts";
import { applyRepo } from "./content.ts";
import type { ReleaseLookup } from "./releases.ts";
import { formatFinding, type Finding } from "./report.ts";
import {
  gitFiles,
  gitTags,
  originUrl,
  ownerRepoOf,
  resolveBranch,
  resolveCommit,
  workingTreeFiles,
  type RepoFiles,
  type RepoTags,
} from "./repo-files.ts";

// Local mode: for each configured tool repo, read its wyrd-foo-v2 branch from
// the local clone through git objects only, run the publisher core, and write
// into a dev content folder. Unmet publishing requirements are warnings. A
// repo that fails writes nothing; the run goes on with the next repo.

const repoEntry = z.strictObject({
  name: z.string().min(1),
  path: z.string().min(1).optional(),
  owner: z.string().regex(/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/, "must be owner/repo").optional(),
});

export const localConfigSchema = z.strictObject({
  branch: z.string().min(1),
  repos: z.array(repoEntry).min(1),
});

export type LocalConfig = z.output<typeof localConfigSchema>;

export interface LocalOptions {
  config: LocalConfig;
  /** Folder that holds the clones named in the config. */
  toolsDir: string;
  /** The dev content folder. */
  contentDir: string;
  /** GitHub Releases; without it, release data comes from local tags. */
  releases?: ReleaseLookup;
}

/** `passed` is validate's outcome for a repo that would publish. */
export type RepoOutcome = "published" | "passed" | "failed" | "skipped";

export interface RepoReport {
  name: string;
  outcome: RepoOutcome;
  /** `owner/repo`, when known. */
  ownerRepo?: string;
  /** The ref and commit read, when the branch exists. */
  ref?: string;
  oid?: string;
  findings: Finding[];
  /** The products validate computed. */
  products?: string[];
  written: string[];
  deleted: string[];
}

/** Run local mode over every configured repo, in order. */
export async function runLocal(options: LocalOptions): Promise<RepoReport[]> {
  const reports: RepoReport[] = [];
  for (const repo of options.config.repos) reports.push(await runRepo(options, repo));
  return reports;
}

async function runRepo(options: LocalOptions, repo: LocalConfig["repos"][number]): Promise<RepoReport> {
  const report: RepoReport = { name: repo.name, outcome: "failed", findings: [], written: [], deleted: [] };
  const dir = resolve(options.toolsDir, repo.path ?? repo.name);
  if (!existsSync(join(dir, ".git"))) {
    report.outcome = "skipped";
    report.findings.push({ severity: "warning", message: `no local clone at ${dir}` });
    return report;
  }
  try {
    const branch = await resolveBranch(dir, options.config.branch);
    if (branch === undefined) {
      report.outcome = "skipped";
      report.findings.push({
        severity: "warning",
        requirement: "wyrd-foo-v2 branch",
        message: `${dir} has no branch ${options.config.branch} (local or origin)`,
      });
      return report;
    }
    report.ref = branch.ref;
    report.oid = branch.oid;
    const result = await compute(report, dir, repo.owner, gitFiles(dir, branch.oid), options.releases);
    if (result === undefined) return report;
    const applied = applyRepo(options.contentDir, result);
    report.findings.push(...result.findings, ...applied.findings);
    report.outcome = applied.failed ? "failed" : "published";
    report.written = applied.written;
    report.deleted = applied.deleted;
  } catch (error) {
    report.findings.push({ severity: "error", message: `failed: ${(error as Error).message}` });
    report.outcome = "failed";
  }
  return report;
}

export interface ValidateOptions {
  /** The tool repo checkout. */
  dir: string;
  /** A ref to read through git objects. Without it, the working tree is read as it is on disk. */
  ref?: string;
  /** `owner/repo`; default from the clone's origin remote. */
  owner?: string;
  releases?: ReleaseLookup;
}

/**
 * Run local mode's checks on one checkout and report the findings. Nothing is
 * written, so key ownership is not checked. The outcome is `passed` when the
 * repo would publish.
 */
export async function validateRepo(options: ValidateOptions): Promise<RepoReport> {
  const dir = resolve(options.dir);
  const report: RepoReport = { name: dir, outcome: "failed", findings: [], products: [], written: [], deleted: [] };
  try {
    let files: RepoFiles = workingTreeFiles(dir);
    if (options.ref !== undefined) {
      const oid = await resolveCommit(dir, options.ref);
      if (oid === undefined) {
        report.findings.push({ severity: "error", message: `${dir} has no commit ${options.ref}` });
        return report;
      }
      report.ref = options.ref;
      report.oid = oid;
      files = gitFiles(dir, oid);
    }
    const result = await compute(report, dir, options.owner, files, options.releases);
    if (result === undefined) return report;
    report.findings.push(...result.findings);
    report.outcome = result.failed ? "failed" : "passed";
    report.products = result.products.map((product) => product.key).sort();
  } catch (error) {
    report.findings.push({ severity: "error", message: `failed: ${(error as Error).message}` });
  }
  return report;
}

// The shared path of local mode and validate: name the owner, then run the core.
async function compute(report: RepoReport, dir: string, owner: string | undefined, files: RepoFiles, releases: ReleaseLookup | undefined) {
  const hasGit = existsSync(join(dir, ".git"));
  const url = hasGit ? await originUrl(dir) : undefined;
  const ownerRepo = owner ?? (url === undefined ? undefined : ownerRepoOf(url));
  if (ownerRepo === undefined) {
    report.findings.push({ severity: "error", message: `cannot tell owner/repo: origin is ${url ?? "not set"}; name the owner` });
    return undefined;
  }
  report.ownerRepo = ownerRepo;
  const tags: RepoTags = hasGit ? gitTags(dir) : { read: async () => undefined };
  return computeRepo({ ownerRepo, files, tags, releases, strict: false });
}

/** The report as printed: one block per repo, then a summary line. */
export function formatReports(reports: RepoReport[]): string {
  const lines: string[] = [];
  for (const report of reports) {
    const at = report.ref === undefined ? "" : ` @ ${report.ref} ${report.oid?.slice(0, 12)}`;
    lines.push(`== ${report.name}${report.ownerRepo === undefined ? "" : ` (${report.ownerRepo})`}${at}: ${report.outcome}`);
    for (const finding of report.findings) lines.push(`  ${formatFinding(finding)}`);
    if (report.products !== undefined) lines.push(`  products: ${report.products.join(", ") || "none"}`);
    if (report.written.length > 0) lines.push(`  wrote: ${report.written.join(", ")}`);
    if (report.deleted.length > 0) lines.push(`  deleted: ${report.deleted.join(", ")}`);
    if (report.outcome === "failed" && report.products === undefined) lines.push("  nothing written");
  }
  const count = (outcome: RepoOutcome) => reports.filter((report) => report.outcome === outcome).length;
  const warnings = reports.flatMap((report) => report.findings).filter((finding) => finding.severity === "warning").length;
  lines.push(
    `${reports.length} repos: ${count("published")} published, ${count("passed")} passed, ${count("failed")} failed, ${count("skipped")} skipped; ${warnings} warnings`,
  );
  return lines.join("\n");
}

export function readLocalConfig(path: string): LocalConfig {
  return localConfigSchema.parse(parse(readFileSync(path, "utf8")));
}
