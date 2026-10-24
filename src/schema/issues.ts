import type { z } from "zod";

/** One contract violation, named by the file and the field it is in. */
export interface ContractIssue {
  file: string;
  /** Field path, for example `products.trowel.kinds[0].install`. Empty for the whole file. */
  field: string;
  message: string;
}

export type ParseResult<T> = { ok: true; data: T } | { ok: false; issues: ContractIssue[] };

/** `file: field: message`. */
export function formatIssue(issue: ContractIssue): string {
  return issue.field ? `${issue.file}: ${issue.field}: ${issue.message}` : `${issue.file}: ${issue.message}`;
}

export function fieldPath(path: readonly PropertyKey[]): string {
  return path
    .map((segment, index) =>
      typeof segment === "number" ? `[${segment}]` : index === 0 ? String(segment) : `.${String(segment)}`,
    )
    .join("");
}

/** Parse `input` with `schema`; on failure, name `file` and the field of each issue. */
export function parseWith<S extends z.ZodType>(
  schema: S,
  input: unknown,
  file: string,
): ParseResult<z.output<S>> {
  const result = schema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, issues: result.error.issues.flatMap((issue) => toContractIssues(issue, [], file)) };
}

// A union issue holds one issue list per branch. Report the branch that came
// closest (fewest issues): for docs.yml that is the entry form the author
// meant, product entry or feature entry.
function toContractIssues(issue: z.core.$ZodIssue, prefix: PropertyKey[], file: string): ContractIssue[] {
  const path = [...prefix, ...issue.path];
  if (issue.code === "invalid_union" && issue.errors.length > 0) {
    const closest = issue.errors.reduce((best, branch) => (branch.length < best.length ? branch : best));
    return closest.flatMap((nested) => toContractIssues(nested, path, file));
  }
  if (issue.code === "unrecognized_keys") {
    return issue.keys.map((key) => ({ file, field: fieldPath([...path, key]), message: "is not an allowed field" }));
  }
  return [{ file, field: fieldPath(path), message: messageOf(issue) }];
}

function messageOf(issue: z.core.$ZodIssue): string {
  if (issue.code === "invalid_union" && "discriminator" in issue && issue.discriminator) {
    return `is not a known ${String(issue.discriminator)}`;
  }
  if (issue.code === "invalid_key") return `is not a valid key: ${issue.issues.map((nested) => nested.message).join("; ")}`;
  return issue.message;
}
