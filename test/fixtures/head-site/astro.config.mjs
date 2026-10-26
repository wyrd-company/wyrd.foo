// @ts-check
// A fixture site that builds pages through the real SiteLayout with product
// assets, so the built-output checks can read what the shared head emits.
import { defineConfig, passthroughImageService } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://wyrd.foo",
  image: { service: passthroughImageService() },
  vite: { plugins: [tailwindcss()] },
});
