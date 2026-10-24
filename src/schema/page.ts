import { z } from "zod";
import { oneLine, productKey, relationships } from "./fields.ts";

/** The front matter of a docs page: any `.md` file under `docs/user/`. */
export const pageSchema = z
  .strictObject({
    title: oneLine.describe("Sidebar and heading label."),
    product: productKey.describe("The product key in docs.yml that the page belongs to."),
    order: z.number().int().optional().describe("Page order where nav does not decide it."),
    install: z.boolean().default(false).describe("Render the install block at the top."),
    relationships: relationships.optional(),
  })
  .describe("Front matter of a page under docs/user/.");

export type PageFrontMatter = z.output<typeof pageSchema>;

/** A page's slug: its file name without `.md`. Unique within a product. */
export function pageSlugOf(path: string): string {
  const name = path.split("/").pop() ?? path;
  return name.replace(/\.md$/i, "");
}
