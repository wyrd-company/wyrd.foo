// relationships: implements site
import { expect, it } from "vitest";
import { catalogRows, getItCommand, kindTabs } from "../src/lib/home";
import { primaryInstall } from "../src/lib/docs-pages";
import { heroInstall, providesRows } from "../src/lib/install-blocks";
import { indexedKinds } from "../src/lib/kinds";
import { productMarkdown } from "../src/lib/product-markdown";
import { toolFileSchema } from "../src/schema/index";
import { readFileSync } from "node:fs";
import { parse } from "yaml";

it("uses the chosen plugin instructions in the hero and catalog and exposes the kind filter", () => {
  const data = toolFileSchema.parse(parse(readFileSync("test/fixtures/product-content/compass/tool.yaml", "utf8")));
  const rows = catalogRows([{ key: "compass", data, hasDocs: true }]);
  expect(rows[0]).toMatchObject({
    primaryKind: "coding-harness-plugin",
    getIt: "Follow the setup guide",
    copyText: "Follow the setup guide",
  });
  expect(kindTabs(rows)).toContainEqual({
    id: "coding-harness-plugin",
    label: "Coding harness plugins",
    count: 1,
  });
  expect(indexedKinds({ "coding-harness-plugin": 1 })).toEqual(["coding-harness-plugin"]);
  expect(heroInstall(data.kinds[0])).toEqual({
    label: "Install in Another harness",
    command: "Follow the setup guide",
    prompt: false,
  });
  const first = {
    kind: "coding-harness-plugin" as const,
    install: [
      { harness: "Example", command: "first" },
      { harness: "Another", command: "second" },
    ],
  };
  expect(primaryInstall(first)).toEqual({ label: "Example", command: "first" });
  expect(heroInstall(first).command).toBe("first");
  expect(getItCommand(first)).toBe("first");
});

it("lists provides rows with the site's element names and All for omitted harnesses", () => {
  const data = toolFileSchema.parse(parse(readFileSync("test/fixtures/product-content/compass/tool.yaml", "utf8")));
  const block = data.kinds[0];
  if (block.kind !== "coding-harness-plugin") throw new Error("fixture");
  expect(providesRows(block)).toEqual([
    { element: "Hook", name: "SessionStart", description: "Loads the sample instructions when a session starts.", harnesses: "All" },
    { element: "Skill", name: "sample-review", description: "Reviews a change against the sample conventions.", harnesses: "Example harness" },
  ]);
  expect(providesRows({ ...block, provides: undefined })).toEqual([]);
});

it("writes the provides table and a plugin without media into the product Markdown", () => {
  const compass = toolFileSchema.parse(parse(readFileSync("test/fixtures/product-content/compass/tool.yaml", "utf8")));
  const md = productMarkdown("compass", compass, []);
  expect(md).toContain("#### What the plugin provides");
  expect(md).toContain("| Hook | SessionStart | Loads the sample instructions when a session starts. | All |");
  expect(md).toContain("| Skill | sample-review | Reviews a change against the sample conventions. | Example harness |");
  expect(md).toContain("## Media");
  const quill = toolFileSchema.parse(parse(readFileSync("test/fixtures/product-content/quill/tool.yaml", "utf8")));
  const bare = productMarkdown("quill", quill, []);
  expect(bare).not.toContain("## Media");
  expect(bare).toContain("## What it does");
  expect(productMarkdown("quill", { ...quill, provides: undefined } as never, [])).toContain("## Install");
});
