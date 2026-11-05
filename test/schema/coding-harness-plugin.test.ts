// relationships: implements publishing
import Ajv2020 from "ajv/dist/2020.js";
import { docsJsonSchema } from "../../src/schema/index.ts";
import assert from "node:assert/strict";
import { it } from "node:test";
import { codingHarnessPluginKind, docsFileSchema, formatIssue, parseWith, toolFileSchema } from "../../src/schema/index.ts";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { readRawDocs } from "./load-tree.ts";

const plugin = () => ({
  kind: "coding-harness-plugin",
  install: [
    {
      harness: "Example harness",
      command: "/plugin marketplace add example-org/plugins\n/plugin install sample@examples",
    },
    {
      harness: "Another harness",
      command: "Follow the setup guide",
      default: true,
    },
  ],
});

it("admits a standalone plugin and a plugin alongside another kind through both contracts", () => {
  for (const mixed of [false, true]) {
    const raw = readRawDocs("cli");
    const product = raw.products.widget;
    product.kinds = mixed ? [plugin(), ...product.kinds] : [plugin()];
    assert.ok(docsFileSchema.safeParse(raw).success);
    const validate = new Ajv2020({ strict: false }).compile(docsJsonSchema());
    assert.ok(validate(raw), JSON.stringify(validate.errors));
    assert.ok(toolFileSchema.safeParse({ ...product, "release-unit": "widget", owner: "example-org/sample" }).success);
  }
});

it("requires install instructions and harness labels, and accepts only one default", () => {
  assert.ok(codingHarnessPluginKind.safeParse(plugin()).success);
  const invalid = [
    { ...plugin(), install: [] },
    { ...plugin(), install: [{ command: "setup" }] },
    { ...plugin(), install: [{ harness: "two\nlines", command: "setup" }] },
    { ...plugin(), install: [{ harness: "Example", command: "   " }] },
    {
      ...plugin(),
      install: plugin().install.map((entry) => ({ ...entry, default: true })),
    },
    { ...plugin(), tools: [] },
  ];
  for (const input of invalid) assert.equal(codingHarnessPluginKind.safeParse(input).success, false, JSON.stringify(input));
});

const provides = () => [
  { element: "hook", name: "SessionStart", description: "Runs when a session starts." },
  { element: "skill", name: "review", description: "Reviews a change.", harnesses: ["Another harness"] },
];

const issues = (input: unknown) => {
  const result = codingHarnessPluginKind.safeParse(input);
  assert.equal(result.success, false);
  return result.success ? [] : result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
};

it("accepts a provides table with every element and optional harnesses", () => {
  const elements = ["hook", "skill", "command", "agent", "mcp-server", "lsp-server", "output-style"];
  const all = elements.map((element) => ({ element, name: "x", description: "y" }));
  assert.ok(codingHarnessPluginKind.safeParse({ ...plugin(), provides: provides() }).success);
  assert.ok(codingHarnessPluginKind.safeParse({ ...plugin(), provides: all }).success);
  assert.ok(codingHarnessPluginKind.safeParse({ ...plugin(), provides: [{ ...all[0], name: "x" }, { ...all[0], element: "skill" }] }).success);
  const validate = new Ajv2020({ strict: false }).compile(docsJsonSchema());
  const raw = readRawDocs("cli");
  raw.products.widget.kinds = [{ ...plugin(), provides: provides() }];
  assert.ok(validate(raw), JSON.stringify(validate.errors));
});

it("rejects an unknown element, extra fields, empty lists and multi-line text", () => {
  const bad = [
    [{ element: "plugin", name: "x", description: "y" }],
    [{ element: "hook", name: "x", description: "y", extra: 1 }],
    [{ element: "hook", name: "x" }],
    [{ element: "hook", name: "two\nlines", description: "y" }],
    [{ element: "hook", name: "x", description: "y", harnesses: [] }],
    [{ element: "hook", name: "x", description: "y", harnesses: ["a\nb"] }],
    [],
  ];
  for (const list of bad) assert.equal(codingHarnessPluginKind.safeParse({ ...plugin(), provides: list }).success, false, JSON.stringify(list));
});

it("rejects a harness label that is not an install label, with its path", () => {
  const list = provides();
  list[1].harnesses = ["Another harness", "Missing harness"];
  assert.deepEqual(issues({ ...plugin(), provides: list }), [
    "provides.1.harnesses.1: Missing harness is not the harness label of an install entry",
  ]);
});

it("rejects a duplicate element and name pair, with its path", () => {
  const list = [...provides(), { element: "hook", name: "SessionStart", description: "Again." }];
  assert.deepEqual(issues({ ...plugin(), provides: list }), [
    "provides.2.name: hook SessionStart is listed more than once",
  ]);
});

const withMedia = (kinds: unknown[], media: boolean) => {
  const raw = readRawDocs("cli");
  const product = raw.products.widget;
  product.kinds = kinds;
  if (!media) delete product.media;
  return raw;
};

it("accepts a product whose primary kind is a plugin without media", () => {
  const raw = withMedia([plugin()], false);
  assert.ok(docsFileSchema.safeParse(raw).success);
  const validate = new Ajv2020({ strict: false }).compile(docsJsonSchema());
  assert.ok(validate(raw), JSON.stringify(validate.errors));
  const tool = { ...raw.products.widget, "release-unit": "widget", owner: "example-org/sample" };
  assert.ok(toolFileSchema.safeParse(tool).success);
  const other = readRawDocs("cli").products.widget.kinds;
  assert.ok(docsFileSchema.safeParse(withMedia([plugin(), ...other], false)).success);
});

it("still checks media that a plugin product has", () => {
  const raw = withMedia([plugin()], true);
  raw.products.widget.media = [];
  assert.equal(docsFileSchema.safeParse(raw).success, false);
});

it("requires media for a product whose primary kind is not a plugin", () => {
  const other = readRawDocs("cli").products.widget.kinds;
  for (const kinds of [other, [...other, plugin()]]) {
    const result = parseWith(docsFileSchema, withMedia(kinds, false), "docs.yml");
    assert.equal(result.ok, false);
    assert.ok(!result.ok && result.issues.map(formatIssue).some((line) => line.includes("products.widget.media") && line.includes("coding-harness-plugin")));
    const tool = { ...withMedia(kinds, false).products.widget, "release-unit": "widget", owner: "example-org/sample" };
    assert.equal(toolFileSchema.safeParse(tool).success, false);
  }
});

it("validates the plugin-install example of the publishing design", () => {
  const design = readFileSync(new URL("../../docs/technical-designs/publishing.yml", import.meta.url), "utf8");
  const blocks = [...design.matchAll(/```yaml\n([\s\S]*?)```/g)].map((match) => parse(match[1]));
  const examples = blocks.filter((block) => block?.kinds?.[0]?.kind === "coding-harness-plugin");
  assert.equal(examples.length, 1);
  assert.ok(codingHarnessPluginKind.safeParse(examples[0].kinds[0]).success);
  assert.ok(examples[0].kinds[0].provides.length > 0);
});
