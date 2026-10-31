// ---
// relationships:
//   implements: docs/technical-designs/publishing.yml
// ---
import { parse } from "yaml";
import { z } from "zod";
import { Findings } from "./report.ts";
import type { RepoFiles } from "./repo-files.ts";

const workflowSchema = z.looseObject({
  name: z.string().optional(),
  on: z.unknown().optional(),
});
const runSchema = z.looseObject({ workflows: z.array(z.string()) });

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
  const names = new Set(workflows.map((workflow) => workflow.name));
  for (const workflow of workflows) {
    const on = workflow.on;
    if (typeof on !== "object" || on === null || !("workflow_run" in on))
      continue;
    const run = runSchema.safeParse(on.workflow_run);
    if (!run.success) continue;
    for (const name of new Set(run.data.workflows)) {
      if (names.has(name)) continue;
      findings.unmet("workflow trigger", {
        file: workflow.file,
        message: `workflow_run.workflows names ${JSON.stringify(name)}, but no workflow in .github/workflows/ has that name; use the workflow's exact name: value`,
      });
    }
  }
  return findings;
}
