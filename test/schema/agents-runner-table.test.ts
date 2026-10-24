import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

// AGENTS.md names each test runner's config by name: a package.json script, a
// vitest project or a config key. Each name must exist in its file and hold
// what its row says the runner owns.

const REPO = new URL("../../", import.meta.url).pathname;
const read = (path: string) => readFileSync(`${REPO}${path}`, "utf8");

const agents = read("AGENTS.md");
const start = agents.indexOf("## Tests");
const end = agents.indexOf("\n## ", start);
const table = agents.slice(start, end === -1 ? undefined : end);
const rows = table
  .split("\n")
  .filter((line) => /^\| (node:test|vitest|Playwright)/.test(line))
  .map((line) => line.split(" | ").map((cell) => cell.replace(/^\| |\s*\|$/g, "")));

type Kind = "script" | "project" | "key";
interface Citation {
  file: string;
  kind: Kind;
  name: string;
}

/** The citations of a "Read from" cell: `` `<file>` script|project|key `<name>` ``. */
function citationsOf(cell: string): Citation[] {
  return [...cell.matchAll(/`([\w./-]+)` (script|project|key) `([\w:.-]+)`/g)].map(([, file, kind, name]) => ({ file, kind: kind as Kind, name }));
}

const scripts = JSON.parse(read("package.json")).scripts as Record<string, string>;
const quote = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Why `citation` does not hold `row`, or undefined when it does. */
function check(row: string[], citation: Citation): string | undefined {
  const [runner, owns] = row;
  const globs = [...owns.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
  const { file, kind, name } = citation;
  if (file === "package.json" && kind === "script") {
    const script = scripts[name];
    if (script === undefined) return `package.json has no script ${name}`;
    const project = /vitest `(\w+)`/.exec(runner)?.[1];
    const runs =
      runner === "node:test"
        ? script.startsWith("node --test") && script.includes(`'${globs[0]}'`)
        : project !== undefined
          ? script.includes(`vitest run --project ${project}`)
          : script.includes("playwright test");
    return runs ? undefined : `script ${name} does not run ${runner} over ${globs[0]}: ${script}`;
  }
  if (file === "vitest.config.ts" && kind === "project") {
    const project = new RegExp(`name: "${quote(name)}", include: \\["${quote(globs[0])}"\\]`);
    if (!runner.includes(`\`${name}\``)) return `the row is ${runner}, not project ${name}`;
    return project.test(read(file)) ? undefined : `vitest.config.ts has no project ${name} that includes ${globs[0]}`;
  }
  if (file === "vitest.config.ts" && kind === "key" && name === "exclude") {
    const line = read(file).split("\n").find((text) => /^\s*exclude:/.test(text));
    if (line === undefined) return "vitest.config.ts has no exclude key";
    const missing = globs.slice(1).filter((glob) => !line.includes(`"${glob}"`));
    return missing.length === 0 ? undefined : `vitest.config.ts exclude lacks ${missing.join(", ")}`;
  }
  if (file === "test/browser/config.ts" && kind === "key" && name === "testMatch") {
    const glob = globs[0].replace(/^test\/browser\//, "");
    return read(file).includes(`testMatch = "${glob}"`) ? undefined : `test/browser/config.ts has no testMatch default ${glob}`;
  }
  return `no rule for ${file} ${kind} ${name}`;
}

describe("the AGENTS.md runner table", () => {
  it("has a row for each test folder and runner", () => {
    assert.equal(rows.length, 6);
  });

  it("cites no config by file and line number", () => {
    assert.deepEqual([...table.matchAll(/`[\w./-]+:\d+`/g)].map((match) => match[0]), []);
  });

  for (const row of rows) {
    it(`${row[0]} ${row[1]}: every named script, project or key exists and holds what the row names`, () => {
      const citations = citationsOf(row[3]);
      assert.ok(citations.length > 0, `the row names its config: ${row[3]}`);
      // The row's own command is among its citations.
      const command = /`pnpm ([\w:]+)`/.exec(row[2])![1];
      assert.ok(citations.some((c) => c.kind === "script" && c.name === command), `the row cites script ${command}`);
      for (const citation of citations) assert.equal(check(row, citation), undefined);
    });
  }
});

describe("citationsOf", () => {
  it("reads each `file` kind `name` citation of a cell", () => {
    assert.deepEqual(citationsOf("`vitest.config.ts` key `exclude`, `package.json` script `test:site` (note)"), [
      { file: "vitest.config.ts", kind: "key", name: "exclude" },
      { file: "package.json", kind: "script", name: "test:site" },
    ]);
  });
});
