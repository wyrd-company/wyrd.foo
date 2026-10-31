// @ts-check
import { unified } from "@astrojs/markdown-remark";
import sitemap from "@astrojs/sitemap";
import { defineConfig, passthroughImageService } from "astro/config";

import tailwindcss from "@tailwindcss/vite";
import { CONTENT_ROOT } from "./src/lib/content-root.ts";
import { rehypeEmbeddedHeadings } from "./src/lib/embedded-headings.ts";
import { inSitemap } from "./src/lib/sitemap.ts";

// https://astro.build/config
export default defineConfig({
  site: "https://wyrd.foo",
  // Preserve HTML-aware whitespace between inline elements on Astro 7.
  compressHTML: true,
  image: {
    service: passthroughImageService(),
  },
  server: {
    host: "0.0.0.0",
  },
  markdown: {
    // The README and changelog of a product page nest under its sections; docs pages are untouched.
    processor: unified({ rehypePlugins: [[rehypeEmbeddedHeadings, { contentRoot: CONTENT_ROOT }]] }),
  },
  integrations: [sitemap({ filter: inSitemap })],
  vite: {
    plugins: [tailwindcss()],
  },
});
