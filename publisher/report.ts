// What a run reports for one repo: warnings, which never stop the repo, and
// errors, which fail it. A requirement that a repo does not meet yet is a
// warning in local mode and an error in publish mode.

export type Severity = "warning" | "error";

export interface Finding {
  severity: Severity;
  /** Product key the finding is about, when it is about one. */
  key?: string;
  /** Path of the file the finding is about, relative to the repo root. */
  file?: string;
  message: string;
  /** Set when the finding is an unmet publishing requirement. */
  requirement?: Requirement;
}

/** The publishing requirements a repo can fail to meet yet. */
export type Requirement =
  | "wyrd-foo-v2 branch"
  | "intentional"
  | "release unit"
  | "docs unit"
  | "GitHub Release"
  | "release tag"
  | "changelog"
  | "generated data";

export class Findings {
  readonly list: Finding[] = [];
  readonly strict: boolean;

  /** `strict` is publish mode: unmet requirements are errors. */
  constructor(strict: boolean) {
    this.strict = strict;
  }

  error(finding: Omit<Finding, "severity">): void {
    this.list.push({ severity: "error", ...finding });
  }

  warning(finding: Omit<Finding, "severity">): void {
    this.list.push({ severity: "warning", ...finding });
  }

  /** An unmet publishing requirement: an error in publish mode, else a warning. */
  unmet(requirement: Requirement, finding: Omit<Finding, "severity" | "requirement">): void {
    this.list.push({ severity: this.strict ? "error" : "warning", requirement, ...finding });
  }

  get failed(): boolean {
    return this.list.some((finding) => finding.severity === "error");
  }
}

/** `severity: [key] file: message (requirement)`. */
export function formatFinding(finding: Finding): string {
  const parts: string[] = [finding.severity];
  if (finding.key !== undefined) parts.push(`[${finding.key}]`);
  const where = finding.file === undefined ? "" : `${finding.file}: `;
  const requirement = finding.requirement === undefined ? "" : ` (requirement: ${finding.requirement})`;
  return `${parts.join(" ")} ${where}${finding.message}${requirement}`;
}
