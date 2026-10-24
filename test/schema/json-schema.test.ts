import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import { GET } from "../../src/pages/schemas/docs/v1.json.ts";
import { DOCS_SCHEMA_URL, docsJsonSchema } from "../../src/schema/index.ts";
import { FIXTURES, frontMatter, KIND_FIXTURES, readRawDocs } from "./load-tree.ts";

// The published JSON Schema must accept what the Zod schema accepts, and
// reject the shapes it can express (for example a wrong schemaVersion).

const ajv = new Ajv2020({ strict: false, allErrors: true });
const validateDocs = ajv.compile(docsJsonSchema());
const validatePage = ajv.getSchema(`${DOCS_SCHEMA_URL}#/$defs/page`)!;

describe("docs JSON Schema", () => {
  it("is identified by its URL and holds the page schema", () => {
    const schema = docsJsonSchema();
    assert.equal(schema.$id, "https://wyrd.foo/schemas/docs/v1.json");
    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.ok((schema.$defs as Record<string, unknown>).page);
  });

  it("is what /schemas/docs/v1.json serves", async () => {
    const response = await GET({} as Parameters<typeof GET>[0]);
    assert.equal(response.headers.get("Content-Type"), "application/schema+json");
    assert.deepEqual(await response.json(), docsJsonSchema());
  });

  for (const name of KIND_FIXTURES) {
    it(`accepts the ${name} fixture and its pages`, () => {
      assert.ok(validateDocs(readRawDocs(name)), ajv.errorsText(validateDocs.errors));
      const dir = join(FIXTURES, name);
      const pages = readdirSync(dir, { recursive: true }).map(String).filter((path) => path.endsWith(".md"));
      for (const path of pages) {
        const data = frontMatter(readFileSync(join(dir, path), "utf8"));
        assert.ok(validatePage(data), `${path}: ${ajv.errorsText(validatePage.errors)}`);
      }
    });
  }

  it("rejects a wrong schemaVersion, an unknown field and an unknown kind", () => {
    const cases: ((raw: Record<string, any>) => void)[] = [
      (raw) => (raw.schemaVersion = 2),
      (raw) => (raw.products.widget.language = "Go"),
      (raw) => (raw.products.widget.kinds[0].kind = "devcontainer-template"),
      (raw) => (raw.products.widget.category = "Developer Tools"),
    ];
    for (const edit of cases) {
      const raw = readRawDocs("cli");
      edit(raw);
      assert.equal(validateDocs(raw), false, edit.toString());
    }
    assert.equal(validatePage({ title: "T", product: "widget", docs: true }), false);
  });
});
