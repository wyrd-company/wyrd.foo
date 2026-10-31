// ---
// relationships:
//   implements: publishing
// ---
import mit from "spdx-license-list/licenses/MIT.json" with { type: "json" };
import apache from "spdx-license-list/licenses/Apache-2.0.json" with { type: "json" };
import { licenceSchema } from "../src/schema/licence.ts";
import type { RepoFiles } from "./repo-files.ts";
import type { Findings } from "./report.ts";

// Exact matching tolerates wrapping and variable copyright notices, never
// changed terms. Explicit SPDX declarations carry compound licence semantics.
const normalize = (text: string) => text.replace(/^\s*Copyright[^\n]*$/gim, "").replace(/\s+/g, " ").trim();
const known = [["MIT", mit.licenseText], ["Apache-2.0", apache.licenseText]] as const;

/** The root LICENSE governs the repo; LICENSES/ alone cannot say AND or OR. */
export async function repoLicence(files: RepoFiles, findings: Findings): Promise<string | undefined> {
  const bytes = await files.read("LICENSE");
  if (bytes === undefined) {
    findings.warning({ file: "LICENSE", message: "does not exist; no licence recorded" });
    return undefined;
  }
  const source = new TextDecoder().decode(bytes);
  const declarations = [...source.matchAll(/^\s*SPDX-License-Identifier:\s*(.+)$/gm)].map((match) => match[1].trim());
  if (declarations.length > 0) {
    const unique = [...new Set(declarations)];
    if (unique.length === 1 && licenceSchema.safeParse(unique[0]).success) return unique[0];
  } else {
    const match = known.find(([, text]) => normalize(source) === normalize(text));
    if (match !== undefined) return match[0];
  }
  findings.warning({ file: "LICENSE", message: "licence is unidentifiable or ambiguous; use one SPDX-License-Identifier expression in LICENSE; no licence recorded" });
  return undefined;
}
