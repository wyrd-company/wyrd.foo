// relationships: implements site
import { expect, it } from "vitest";
import { catalogRows, getItCommand, kindTabs } from "../src/lib/home";
import { primaryInstall } from "../src/lib/docs-pages";
import { heroInstall } from "../src/lib/install-blocks";
import { indexedKinds } from "../src/lib/kinds";
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
