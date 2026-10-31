// ---
// relationships:
//   implements: publishing
// ---
import mit from "spdx-license-list/licenses/MIT.json" with { type: "json" };
import apache from "spdx-license-list/licenses/Apache-2.0.json" with { type: "json" };
import { licenceSchema } from "../src/schema/licence.ts";
import type { RepoFiles } from "./repo-files.ts";
import type { Findings } from "./report.ts";

// Only the two canonical placeholder slots vary. In particular, never delete
// copyright lines: a notice can carry an added condition on the same line.
const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
const year = String.raw`\d{4}(?:[-–]\d{4})?(?:, \d{4}(?:[-–]\d{4})?)*`;
// Conservatively accept name tokens, plus common connecting/suffix words.
// These are identifiers, not a free-form sentence slot. Unusual notices warn.
const nameToken = String.raw`(?:[\p{Lu}][\p{L}\p{M}'’–-]*|contributors|and|of|the|&)`;
const holderName = new RegExp(`^${nameToken}(?:[ \t]+${nameToken})*$`, "u");
const terms = /\b(?:no|not|only|use|commercial|noncommercial|prohibit\w*|restrict\w*|permission\w*|condition\w*|licen[cs]\w*|must|shall|may|require\w*|except\w*|subject|allow\w*|permit\w*|forbid\w*)\b/i;
const matches = (source: string, canonical: string): boolean => {
  const yearSlot = canonical === mit.licenseText ? "<year>" : "[yyyy]";
  const holderSlot = canonical === mit.licenseText ? "<copyright holders>" : "[name of copyright owner]";
  const [before, rest] = canonical.split(yearSlot);
  const [between, after] = rest.split(holderSlot);
  const pattern = new RegExp(`^${literal(before)}(?:${literal(yearSlot)}|${year})${literal(between)}(${literal(holderSlot)}|[^\\r\\n]+?)${literal(after)}$`, "u");
  const match = pattern.exec(source.trim());
  if (match === null) return false;
  const holder = match[1];
  return holder === holderSlot || (holderName.test(holder) && !terms.test(holder));
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
  // Parse one physical line at a time so an empty declaration cannot consume
  // the first line of accompanying terms. All other content remains checked.
  const lines = source.split(/\r?\n/);
  const declarationLine = /^[ \t]*SPDX-License-Identifier:[ \t]*(.*)$/;
  const declarations = lines.flatMap((line) => {
    const match = declarationLine.exec(line);
    return match ? [match[1].trim()] : [];
  });
  const body = lines.filter((line) => !declarationLine.test(line)).join("\n");
  if (declarations.length > 0) {
    const unique = [...new Set(declarations)];
    if (unique.length === 1 && licenceSchema.safeParse(unique[0]).success) {
      // A declaration-only expression states the relationship without guessing.
      // A body must be one complete supported text with the same simple ID;
      // we cannot establish compound/exception semantics from partial texts.
      if (["", "See LICENSES/ for texts."].includes(normalize(body))) return unique[0];
      if (known.some(([id, text]) => id === unique[0] && matches(body, text))) return unique[0];
    }
  } else {
    const match = known.find(([, text]) => matches(source, text));
    if (match !== undefined) return match[0];
  }
  findings.warning({ file: "LICENSE", message: "licence is unidentifiable or ambiguous; declaration and any accompanying terms must agree with a supported canonical text; no licence recorded" });
  return undefined;
}
