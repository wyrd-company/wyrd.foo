/*
 * A product's code changelog, `<key>/CHANGELOG.md`, in intentional's format:
 * a `# Changelog` title, then one `## <version>` section per release, newest
 * first, with `### Breaking/Features/Fixes` subsections, and an optional
 * "Earlier releases" line after the last section. Each `## ` section is one
 * release entry; `###` and deeper headings stay in their entry.
 */

export interface ChangelogEntry {
  /** The heading text after `## `, as written: for example `0.4.0` or `1.3.1 - 2026-08-12`. */
  version: string;
  /** The Markdown under the heading, up to the next entry. */
  body: string;
}

export interface Changelog {
  /** The Markdown before the first entry: the title and any intro. */
  preamble: string;
  /** Newest first, in file order. */
  entries: ChangelogEntry[];
  /** The trailing "Earlier releases" paragraph, or "". */
  trailer: string;
}

/** An ATX `## ` heading: up to three spaces of indent, then `##`, a space, the text and optional closing hashes. */
const ENTRY_HEADING = /^ {0,3}##[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const TRAILER = /^Earlier releases\b/;

const trimBlankLines = (lines: string[]) => lines.join("\n").replace(/^(?:[ \t]*\n)+/, "").trimEnd();

export function splitChangelog(markdown: string): Changelog {
  const preamble: string[] = [];
  const sections: { version: string; lines: string[] }[] = [];
  let fence: string | undefined;
  for (const line of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    const open = FENCE.exec(line)?.[1];
    if (fence) {
      // A fence closes on a run of its own character at least as long, with nothing after it.
      if (open && open[0] === fence[0] && open.length >= fence.length && line.trim() === open) fence = undefined;
    } else if (open) {
      fence = open;
    } else {
      const heading = ENTRY_HEADING.exec(line);
      if (heading && heading[1] !== "") {
        sections.push({ version: heading[1], lines: [] });
        continue;
      }
    }
    (sections.at(-1)?.lines ?? preamble).push(line);
  }

  const entries = sections.map((section) => ({ version: section.version, body: trimBlankLines(section.lines) }));
  let trailer = "";
  const last = entries.at(-1);
  if (last) {
    const at = last.body.lastIndexOf("\n\n");
    const paragraph = last.body.slice(at + 2);
    if (TRAILER.test(paragraph)) {
      trailer = paragraph;
      last.body = at === -1 ? "" : last.body.slice(0, at).trimEnd();
    }
  }
  return { preamble: trimBlankLines(preamble), entries, trailer };
}

/** The newest release entry: the first `## ` section. */
export function latestEntry(markdown: string): ChangelogEntry | undefined {
  return splitChangelog(markdown).entries[0];
}
