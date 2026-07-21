// @ts-check
import { defineConfig, passthroughImageService } from "astro/config";

import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
  image: {
    service: passthroughImageService(),
  },
  server: {
    host: "0.0.0.0",
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
