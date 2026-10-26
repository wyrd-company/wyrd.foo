import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeRepo, type RepoResult } from "./compute.ts";
import { applyRepo } from "./content.ts";
import { applyFeature, type FeatureRequest } from "./featured.ts";
import { DEFAULT_RELEASE_WAIT, waitForReleases, type ReleaseLookup, type ReleaseWait } from "./releases.ts";
import type { Finding } from "./report.ts";
import { gitFiles, gitTags, resolveCommit } from "./repo-files.ts";
import { cloneSite, commitFolder, PushRejected, pushSite, remoteTip, type Identity, type SiteRemote } from "./site-repo.ts";

// Publish mode: run the publisher core over a tool repo checkout at one ref,
// with every publishing requirement enforced, write the result into a fresh
// clone of the site repo, commit it and push it. When another publish pushed
// first, the push is refused; the run then clones the new tip, writes the
// same result again (key ownership is checked again on the new content) and
// pushes, up to `attempts` times. A refused push with no new tip is not
// retried: it is a refusal, not a race. A product's GitHub Release that is not
// found yet is asked for again, within `releaseWait`, before the run fails.

export const SITE_CONTENT = "content";
export const DEFAULT_ATTEMPTS = 5;

export interface PublishOptions {
  /** The tool repo checkout, with its tags. */
  source: string;
  /** The tag or commit to publish. */
  ref: string;
  /** `owner/repo` of the tool repo. */
  ownerRepo: string;
  releases: ReleaseLookup;
  /** How long to wait for a GitHub Release that is not found yet. Default DEFAULT_RELEASE_WAIT. */
  releaseWait?: ReleaseWait;
  site: SiteRemote;
  /** The commit author and committer: the publisher App bot. */
  author: Identity;
  /** A manual run's feature inputs. A tag push has none. */
  feature?: FeatureRequest;
  /** Compute and write into a clone of the site, but do not push. */
  dryRun?: boolean;
  /** The folder that holds the run's site clones (one per attempt), removed at the end. Default the OS temp folder. */
  tempDir?: string;
  attempts?: number;
  now?: Date;
}

/**
 * `published`: a commit was pushed. `unchanged`: the site already held this
 * result. `dry-run`: computed, not pushed. `failed`: nothing was pushed.
 */
export type PublishOutcome = "published" | "unchanged" | "dry-run" | "failed";

export interface PublishReport {
  outcome: PublishOutcome;
  ownerRepo: string;
  ref: string;
  /** The tool repo commit the ref names. */
  oid?: string;
  findings: Finding[];
  products: string[];
  written: string[];
  deleted: string[];
  /** Files changed under the site's content folder. */
  changed: string[];
  /** The site commit made (pushed unless dry-run). */
  commit?: string;
  /** Push attempts made. */
  attempts: number;
}

export async function publish(options: PublishOptions): Promise<PublishReport> {
  const report: PublishReport = {
    outcome: "failed",
    ownerRepo: options.ownerRepo,
    ref: options.ref,
    findings: [],
    products: [],
    written: [],
    deleted: [],
    changed: [],
    attempts: 0,
  };
  const oid = await resolveCommit(options.source, options.ref);
  if (oid === undefined) {
    report.findings.push({ severity: "error", message: `${options.source} has no commit ${options.ref}` });
    return report;
  }
  report.oid = oid;

  let result: RepoResult = await computeRepo({
    ownerRepo: options.ownerRepo,
    files: gitFiles(options.source, oid),
    tags: gitTags(options.source),
    releases: waitForReleases(options.releases, options.releaseWait ?? DEFAULT_RELEASE_WAIT),
    strict: true,
  });
  if (options.feature !== undefined) result = applyFeature(result, options.feature, options.now ?? new Date());
  report.findings.push(...result.findings);
  if (result.failed) return report;
  report.products = result.products.map((product) => product.key).sort();

  const workDir = mkdtempSync(join(options.tempDir ?? tmpdir(), "publish-site-"));
  const limit = options.attempts ?? DEFAULT_ATTEMPTS;
  const message = `docs: publish ${options.ownerRepo.split("/")[1]} (${options.ownerRepo}@${oid.slice(0, 7)})`;
  try {
    while (report.attempts < limit) {
      report.attempts += 1;
      const dir = join(workDir, `attempt-${report.attempts}`);
      const base = await cloneSite(options.site, dir);
      const applied = applyRepo(join(dir, SITE_CONTENT), result);
      if (applied.failed) {
        report.findings.push(...applied.findings);
        return report;
      }
      const committed = await commitFolder(dir, SITE_CONTENT, message, options.author);
      report.findings.push(...applied.findings);
      Object.assign(report, { written: applied.written, deleted: applied.deleted, changed: committed.changed, commit: committed.commit });
      if (committed.commit === undefined) return { ...report, outcome: "unchanged" };
      if (options.dryRun) return { ...report, outcome: "dry-run" };
      try {
        await pushSite(options.site, dir);
        return { ...report, outcome: "published" };
      } catch (error) {
        if (!(error instanceof PushRejected)) throw error;
        const tip = await remoteTip(options.site);
        if (tip === base) {
          report.findings.push({ severity: "error", message: `${error.message}; ${options.site.branch} did not move, so it is not retried` });
          return { ...report, commit: undefined };
        }
        report.findings.push({ severity: "warning", message: `${error.message}; ${options.site.branch} moved to ${tip?.slice(0, 7) ?? "nothing"}, retrying` });
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
    report.findings.push({ severity: "error", message: `push rejected ${limit} times: ${options.site.branch} kept moving` });
    return { ...report, commit: undefined };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}
