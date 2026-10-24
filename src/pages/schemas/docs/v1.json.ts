import type { APIRoute } from "astro";
import { docsJsonSchema } from "../../../schema/index.ts";

// The published JSON Schema for docs/user/docs.yml, generated from the shared
// Zod schema at build time.
export const GET: APIRoute = () =>
  new Response(`${JSON.stringify(docsJsonSchema(), null, 2)}\n`, {
    headers: { "Content-Type": "application/schema+json" },
  });
