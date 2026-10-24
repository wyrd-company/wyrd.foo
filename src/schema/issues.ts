import { z } from "zod";

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

/** One issue of the branch that came closest, with its path from the parsed value. */
export interface ClosestIssue {
  path: PropertyKey[];
  message: string;
}

// A union issue holds one issue list per branch. Report the branch that came
// closest (fewest issues): for docs.yml that is the entry form the author
// meant, product entry or feature entry.
export function closestIssues(issues: readonly z.core.$ZodIssue[], prefix: PropertyKey[] = []): ClosestIssue[] {
  return issues.flatMap((issue): ClosestIssue[] => {
    const path = [...prefix, ...issue.path];
    if (issue.code === "invalid_union" && issue.errors.length > 0) {
      const closest = issue.errors.reduce((best, branch) => (branch.length < best.length ? branch : best));
      return closestIssues(closest, path);
    }
    if (issue.code === "unrecognized_keys") return issue.keys.map((key) => ({ path: [...path, key], message: "is not an allowed field" }));
    return [{ path, message: messageOf(issue) }];
  });
}

function toContractIssues(issue: z.core.$ZodIssue, prefix: PropertyKey[], file: string): ContractIssue[] {
  return closestIssues([issue], prefix).map(({ path, message }) => ({ file, field: fieldPath(path), message }));
}

function messageOf(issue: z.core.$ZodIssue): string {
  if (issue.code === "invalid_union" && "discriminator" in issue && issue.discriminator) {
    return `is not a known ${String(issue.discriminator)}`;
  }
  if (issue.code === "invalid_key") return `is not a valid key: ${issue.issues.map((nested) => nested.message).join("; ")}`;
  return issue.message;
}

/** Marks a value that `schema` refused, with the refusal's issues. */
const REFUSED = Symbol("refused");

/**
 * `schema`, with a failure reported as the closest union branch's issues, each
 * at its field. A plain union fails with one "did not match union" issue at
 * the root, which names no field. The site's content collections use it.
 * Its input side is `schema` itself, so the JSON Schema Astro generates for a
 * collection from the input shape is unchanged.
 */
export function withClosestIssues<S extends z.ZodType>(schema: S) {
  return schema
    .catch((ctx) => ({ [REFUSED]: ctx.error.issues }) as unknown as z.output<S>)
    .pipe(
      z.custom<z.output<S>>().transform((value, ctx): z.output<S> => {
        const refused = (value as { [REFUSED]?: z.core.$ZodIssue[] } | null)?.[REFUSED];
        if (refused === undefined) return value;
        for (const { path, message } of closestIssues(refused)) ctx.addIssue({ code: "custom", message, path });
        return z.NEVER;
      }),
    );
}
