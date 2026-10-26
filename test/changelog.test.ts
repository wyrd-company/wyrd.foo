import { describe, expect, it } from "vitest";
import { latestEntry, splitChangelog } from "../src/lib/changelog";

const CHANGELOG = `# Changelog

Each released version has a section here.

## 2.0.0

### Breaking

- Drop the \`--legacy\` flag.

### Features

- Add the \`plan\` command.

## 1.1.0 - 2026-08-12

### Fixes

- Keep the input order.

Earlier releases: see git tags.
`;

describe("splitChangelog", () => {
  it("makes one entry for each ## heading, newest first, and keeps the version text", () => {
    const { entries } = splitChangelog(CHANGELOG);
    expect(entries.map((entry) => entry.version)).toEqual(["2.0.0", "1.1.0 - 2026-08-12"]);
  });

  it("keeps the ### subsections in their entry's body, not as entries", () => {
    const [first, second] = splitChangelog(CHANGELOG).entries;
    expect(first.body).toBe("### Breaking\n\n- Drop the `--legacy` flag.\n\n### Features\n\n- Add the `plan` command.");
    expect(second.body).toBe("### Fixes\n\n- Keep the input order.");
  });

  it("keeps the title and the text before the first entry out of every entry", () => {
    expect(splitChangelog(CHANGELOG).preamble).toBe("# Changelog\n\nEach released version has a section here.");
  });

  it("keeps the trailing Earlier releases line out of the last entry", () => {
    const changelog = splitChangelog(CHANGELOG);
    expect(changelog.trailer).toBe("Earlier releases: see git tags.");
    expect(changelog.entries[1].body).not.toContain("Earlier releases");
  });

  it("has no trailer when the last paragraph is not the Earlier releases line", () => {
    const changelog = splitChangelog("# Changelog\n\n## 1.0.0\n\n- First release.\n");
    expect(changelog.trailer).toBe("");
    expect(changelog.entries[0].body).toBe("- First release.");
  });

  it("does not split at a ## line inside a fenced code block", () => {
    const markdown = "## 1.0.0\n\n```md\n## not a release\n```\n\n~~~\n## nor this\n~~~\n\n## 0.9.0\n\n- Older.\n";
    expect(splitChangelog(markdown).entries.map((entry) => entry.version)).toEqual(["1.0.0", "0.9.0"]);
  });

  it("drops the closing hashes of a heading from the version text", () => {
    expect(splitChangelog("## 1.0.0 ##\n").entries[0].version).toBe("1.0.0");
  });

  it("treats only ## followed by a space as an entry heading", () => {
    const markdown = "## 1.0.0\n\n### Fixes\n\n#### Detail\n\n##not-a-heading\n";
    const { entries } = splitChangelog(markdown);
    expect(entries.map((entry) => entry.version)).toEqual(["1.0.0"]);
    expect(entries[0].body).toBe("### Fixes\n\n#### Detail\n\n##not-a-heading");
  });

  it("reads Windows line endings", () => {
    expect(splitChangelog("# Changelog\r\n\r\n## 1.0.0\r\n\r\n- Fix.\r\n").entries).toEqual([{ version: "1.0.0", body: "- Fix." }]);
  });

  it("has no entries when the changelog has no ## heading", () => {
    expect(splitChangelog("# Changelog\n\nNothing yet.\n")).toEqual({ preamble: "# Changelog\n\nNothing yet.", entries: [], trailer: "" });
  });
});

describe("latestEntry", () => {
  it("is the first entry", () => {
    expect(latestEntry(CHANGELOG)?.version).toBe("2.0.0");
  });

  it("is undefined for a changelog with no entries", () => {
    expect(latestEntry("# Changelog\n")).toBeUndefined();
  });
});
