import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import type { FeatureRequest } from "./featured.ts";
import { publish, type PublishReport } from "./publish.ts";
import { gitHubReleases } from "./releases.ts";
import { formatFinding, type Finding } from "./report.ts";

// The publish-docs@v2 action entry (.github/actions/publish-docs/action.yml).
// It reads the action's inputs from PUBLISH_* environment variables, runs
// publish mode, prints each finding as an annotation and writes the step
// outputs. Exit 1 when nothing was published because of an error.

const INPUTS = [
  "PUBLISH_SOURCE",
  "PUBLISH_REF",
  "PUBLISH_OWNER",
  "PUBLISH_SITE_URL",
  "PUBLISH_SITE_BRANCH",
  "PUBLISH_SITE_TOKEN",
  "PUBLISH_RELEASE_TOKEN",
  "PUBLISH_API_URL",
  "PUBLISH_AUTHOR_NAME",
  "PUBLISH_AUTHOR_EMAIL",
  "PUBLISH_FEATURE",
  "PUBLISH_FEATURE_PRODUCT",
  "PUBLISH_FEATURE_DAYS",
  "PUBLISH_FEATURE_REASON",
  "PUBLISH_DRY_RUN",
] as const;

type Input = (typeof INPUTS)[number];

class InputError extends Error {}

function input(name: Input, required = true): string | undefined {
  const value = process.env[name]?.trim();
  if (value === undefined || value === "") {
    if (required) throw new InputError(`${name} is required`);
    return undefined;
  }
  return value;
}

function flag(name: Input): boolean {
  const value = input(name, false) ?? "false";
  if (value !== "true" && value !== "false") throw new InputError(`${name} must be true or false; it is ${value}`);
  return value === "true";
}

function featureRequest(): FeatureRequest | undefined {
  if (!flag("PUBLISH_FEATURE")) return undefined;
  const days = input("PUBLISH_FEATURE_DAYS") as string;
  if (!/^\d+$/.test(days)) throw new InputError(`PUBLISH_FEATURE_DAYS must be a whole number of days; it is ${days}`);
  return { product: input("PUBLISH_FEATURE_PRODUCT", false), days: Number.parseInt(days, 10), reason: input("PUBLISH_FEATURE_REASON", false) };
}

/** A workflow command value: `%`, CR and LF escaped; in properties also `:` and `,`. */
function escape(value: string, property = false): string {
  const data = value.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
  return property ? data.replaceAll(":", "%3A").replaceAll(",", "%2C") : data;
}

function annotation(finding: Finding): string {
  const file = finding.file === undefined ? "" : ` file=${escape(finding.file, true)}`;
  return `::${finding.severity}${file}::${escape(formatFinding(finding))}`;
}

function summary(report: PublishReport): string {
  const lines = [`${report.ownerRepo} @ ${report.ref} ${report.oid?.slice(0, 12) ?? ""}: ${report.outcome}`];
  if (report.products.length > 0) lines.push(`products: ${report.products.join(", ")}`);
  if (report.deleted.length > 0) lines.push(`deleted: ${report.deleted.join(", ")}`);
  if (report.changed.length > 0) lines.push(`changed: ${report.changed.length} files`);
  if (report.commit !== undefined) lines.push(`commit: ${report.commit}`);
  if (report.attempts > 0) lines.push(`push attempts: ${report.attempts}`);
  return lines.join("\n");
}

async function main(): Promise<number> {
  let report: PublishReport;
  try {
    report = await publish({
      source: resolve(input("PUBLISH_SOURCE") as string),
      ref: input("PUBLISH_REF") as string,
      ownerRepo: input("PUBLISH_OWNER") as string,
      releases: gitHubReleases({ token: input("PUBLISH_RELEASE_TOKEN", false), apiUrl: input("PUBLISH_API_URL", false) }),
      site: { url: input("PUBLISH_SITE_URL") as string, branch: input("PUBLISH_SITE_BRANCH") as string, token: input("PUBLISH_SITE_TOKEN", false) },
      author: { name: input("PUBLISH_AUTHOR_NAME") as string, email: input("PUBLISH_AUTHOR_EMAIL") as string },
      feature: featureRequest(),
      dryRun: flag("PUBLISH_DRY_RUN"),
      tempDir: process.env.RUNNER_TEMP || undefined,
    });
  } catch (error) {
    const message = error instanceof InputError ? `input: ${error.message}` : `failed: ${(error as Error).message}`;
    console.log(`::error::${escape(message)}`);
    return 1;
  }
  for (const finding of report.findings) console.log(annotation(finding));
  const text = summary(report);
  console.log(text);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `outcome=${report.outcome}\ncommit=${report.outcome === "published" ? report.commit : ""}\n`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### publish-docs\n\n\`\`\`text\n${text}\n\`\`\`\n`);
  return report.outcome === "failed" ? 1 : 0;
}

process.exitCode = await main();
