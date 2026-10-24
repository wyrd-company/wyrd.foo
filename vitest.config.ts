/// <reference types="vitest/config" />
import { getViteConfig } from "astro/config";
import { configDefaults } from "vitest/config";

export default getViteConfig({
  test: {
    // test/schema/ runs on node:test (`pnpm test:schema`).
    exclude: [...configDefaults.exclude, "test/schema/**"],
    projects: [
      // Render components through the Astro container.
      { extends: true, test: { name: "unit", include: ["test/**/*.test.ts"] } },
    ],
  },
});
