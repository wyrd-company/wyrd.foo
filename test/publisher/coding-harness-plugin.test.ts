// relationships: implements publishing
import assert from "node:assert/strict";
import { it } from "node:test";
import { parse, stringify } from "yaml";
import { runLocal } from "../../publisher/index.ts";
import { Workspace } from "./fixture-repo.ts";
import { alphaFiles, ALPHA_TAGS } from "./fixtures.ts";
import { toolFileSchema } from "../../src/schema/index.ts";

it("publishes a plugin from repo metadata with docs, release data and install instructions intact", async () => {
  const ws = new Workspace();
  try {
    const files = alphaFiles({ withApp: false });
    const manifest = parse(files["docs/user/docs.yml"] as string);
    const plugin = {
      kind: "coding-harness-plugin",
      install: [
        {
          harness: "Example harness",
          command: "/plugin marketplace add example-org/plugins\n/plugin install sample@examples",
        },
      ],
    };
    manifest.products["alpha-cli"].kinds = [plugin];
    files["docs/user/docs.yml"] = stringify(manifest);
    ws.repo("alpha", files, { tags: ALPHA_TAGS });
    const [report] = await runLocal({
      config: { branch: "wyrd-foo-v2", repos: [{ name: "alpha" }] },
      toolsDir: ws.toolsDir,
      contentDir: ws.contentDir,
      fetch: false,
    });
    assert.equal(report.outcome, "published", JSON.stringify(report.findings));
    const tool = toolFileSchema.parse(parse(ws.text("alpha-cli", "tool.yaml")));
    assert.deepEqual(tool.kinds, [plugin]);
    assert.equal(tool.release?.version, "1.2.0");
    assert.match(ws.text("alpha-cli", "docs/getting-started.md"), /Getting started/);
    assert.match(ws.text("alpha-cli", "CHANGELOG.md"), /1.2.0/);
  } finally {
    ws.remove();
  }
});
