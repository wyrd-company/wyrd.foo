// relationships: implements publishing
import Ajv2020 from "ajv/dist/2020.js";
import { docsJsonSchema } from "../../src/schema/index.ts";
import assert from "node:assert/strict";
import { it } from "node:test";
import { codingHarnessPluginKind, docsFileSchema, toolFileSchema } from "../../src/schema/index.ts";
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
