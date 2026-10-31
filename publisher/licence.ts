// ---
// relationships:
//   implements: publishing
// ---
import mit from "spdx-license-list/licenses/MIT.json" with { type: "json" };
import apache from "spdx-license-list/licenses/Apache-2.0.json" with { type: "json" };
import { licenceSchema } from "../src/schema/licence.ts";
import type { RepoFiles } from "./repo-files.ts";
import type { Findings } from "./report.ts";

// Never erase source text: a copyright-prefixed line can contain conditions.
// Only the canonical template's year slot varies; free-form holder text cannot
// safely be distinguished from terms. Such files need an explicit declaration.
const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
const matches = (source: string, canonical: string): boolean => {
  const text = normalize(source);
  const template = normalize(canonical);
  if (text === template) return true;
  const yearSlot = canonical === mit.licenseText ? "<year>" : "[yyyy]";
  const [before, after] = template.split(yearSlot);
  if (!text.startsWith(before) || !text.endsWith(after)) return false;
  const year = text.slice(before.length, text.length - after.length);
  return /^\d{4}(?:[-–]\d{4})?(?:, \d{4}(?:[-–]\d{4})?)*$/.test(year);
};
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
    const match = known.find(([, text]) => matches(source, text));
    if (match !== undefined) return match[0];
  }
  findings.warning({ file: "LICENSE", message: "licence is unidentifiable or ambiguous; use one SPDX-License-Identifier expression in LICENSE; no licence recorded" });
  return undefined;
}
