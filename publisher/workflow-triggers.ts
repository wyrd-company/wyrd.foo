// ---
// relationships:
//   implements: docs/technical-designs/publishing.yml
// ---
import { minimatch } from "minimatch";
import { parse } from "yaml";
import { z } from "zod";
import { Findings } from "./report.ts";
import type { RepoFiles } from "./repo-files.ts";

const workflowSchema = z.looseObject({
  name: z.string().optional(),
  on: z.unknown().optional(),
});
const runSchema = z.looseObject({
  workflows: z
    .union([z.string(), z.array(z.string())])
    .transform((value) => (typeof value === "string" ? [value] : value)),
});

/** Only diagnose patterns whose semantics agree with GitHub's filter contract.
 * GitHub's ?/+ repeat the preceding character; minimatch uses shell semantics.
 * Embedded ** also differs. Abstain rather than reject a valid Actions filter.
 * Negations remove earlier matches; they need not name an existing workflow.
 */
function canCheck(pattern: string): boolean {
  const unescaped = pattern.replace(/\\./gs, "");
  return (
    !pattern.startsWith("!") &&
    !/[?+]/.test(unescaped) &&
    !unescaped.includes("**")
  );
}

function matches(name: string, pattern: string): boolean {
  if (!hasGlob(pattern)) return name === pattern.replace(/\\(.)/gs, "$1");
  return minimatch(name, pattern, {
    dot: true,
    nocase: false,
    nocomment: true,
    nonegate: true,
    nobrace: true,
    noext: true,
    platform: "linux",
    preserveMultipleSlashes: true,
    optimizationLevel: 0,
  });
}

function hasGlob(pattern: string): boolean {
  return /[\[*]/.test(pattern.replace(/\\./gs, ""));
}

/** Check workflow_run names against the same tree that validate reads. */
export async function workflowTriggerFindings(
  files: RepoFiles,
  strict: boolean,
): Promise<Findings> {
  const findings = new Findings(strict);
  const workflows: { file: string; name?: string; on?: unknown }[] = [];
  for (const file of await files.list(".github/workflows/")) {
    if (!/^\.github\/workflows\/[^/]+\.ya?ml$/.test(file)) continue;
    const bytes = await files.read(file);
    if (bytes === undefined) continue;
    try {
      const result = workflowSchema.safeParse(
        parse(new TextDecoder().decode(bytes)),
      );
      if (result.success) workflows.push({ file, ...result.data });
    } catch {
      findings.unmet("workflow trigger", {
        file,
        message: "is not valid YAML; cannot check workflow_run names",
      });
    }
  }
  const names = workflows.map((workflow) => workflow.name ?? workflow.file);
  for (const workflow of workflows) {
    const on = workflow.on;
    if (typeof on !== "object" || on === null || !("workflow_run" in on))
      continue;
    const run = runSchema.safeParse(on.workflow_run);
    if (!run.success) continue;
    for (const name of new Set(run.data.workflows)) {
      if (!canCheck(name)) continue;
      // minimatch reserves dot path segments and limits pattern size. These
      // are not workflow-name restrictions in GitHub's contract.
      if (
        name.length > 64 * 1024 ||
        (hasGlob(name) && names.some((value) => value.endsWith("/"))) ||
        names.some((value) =>
          value.split("/").some((part) => part === "." || part === ".."),
        )
      )
        continue;
      if (names.some((value) => matches(value, name))) continue;
      findings.unmet("workflow trigger", {
        file: workflow.file,
        message: `workflow_run.workflows names ${JSON.stringify(name)}, but no workflow in .github/workflows/ matches that filter; use a case-sensitive workflow name: value or its default repository-relative path`,
      });
    }
  }
  return findings;
}
