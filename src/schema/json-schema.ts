import { z } from "zod";
import { docsFileSchema } from "./docs-file.ts";
import { pageSchema } from "./page.ts";

export const DOCS_SCHEMA_URL = "https://wyrd.foo/schemas/docs/v1.json";

/**
 * The published JSON Schema for docs.yml, served at /schemas/docs/v1.json.
 * Page front matter is `$defs.page`. Checks that read more than one file are
 * not in it; the publisher runs them.
 */
export function docsJsonSchema(): Record<string, unknown> {
  const options = { target: "draft-2020-12", io: "input" } as const;
  const root = z.toJSONSchema(docsFileSchema, options) as Record<string, unknown>;
  const { $schema: _pageDialect, ...page } = z.toJSONSchema(pageSchema, options) as Record<string, unknown>;
  const defs = (root.$defs as Record<string, unknown> | undefined) ?? {};
  return {
    $schema: root.$schema,
    $id: DOCS_SCHEMA_URL,
    title: "wyrd.foo docs.yml",
    ...root,
    $defs: { ...defs, page },
  };
}
