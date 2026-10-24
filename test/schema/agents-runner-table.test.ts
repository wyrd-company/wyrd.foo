import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

// AGENTS.md names each test runner's config by file and line. Each key must
// still point at the line that holds what its row names.

const REPO = new URL("../../", import.meta.url).pathname;
const read = (path: string) => readFileSync(`${REPO}${path}`, "utf8");

const table = read("AGENTS.md").slice(read("AGENTS.md").indexOf("## Tests"));
const rows = table
  .split("\n")
  .filter((line) => /^\| (node:test|vitest|Playwright)/.test(line))
  .map((line) => line.split(" | ").map((cell) => cell.replace(/^\| |\s*\|$/g, "")));

/** The text the line a key names must contain, for one row. */
function expected(row: string[], file: string, note: string | undefined): string {
  const [runner, , command] = row;
  if (file === "package.json") return `"${/`pnpm (test:\w+)`/.exec(command)![1]}":`;
  if (file === "vitest.config.ts") return note === "exclude" ? "exclude:" : `name: "${/vitest `(\w+)`/.exec(runner)![1]}"`;
  if (file === "test/browser/config.ts") return "testMatch =";
  throw new Error(`no rule for ${file}`);
}

describe("the AGENTS.md runner table", () => {
  it("has a row for each test folder and runner", () => {
    assert.equal(rows.length, 6);
  });

  for (const row of rows) {
    it(`${row[0]} ${row[1]}: every file:line key holds what the row names`, () => {
      const keys = [...row[3].matchAll(/`([\w./-]+):(\d+)`(?: \((\w+)\))?/g)];
      assert.ok(keys.length > 0, "the row names a config line");
      for (const [, file, line, note] of keys) {
        const text = read(file).split("\n")[Number(line) - 1] ?? "";
        assert.ok(text.includes(expected(row, file, note)), `${file}:${line} is "${text.trim()}"`);
      }
    });
  }
});
