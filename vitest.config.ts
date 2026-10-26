/// <reference types="vitest/config" />
import { getViteConfig } from "astro/config";
import { configDefaults } from "vitest/config";

export default getViteConfig({
  test: {
    // test/schema/, test/publisher/, test/build/ and test/template/ run on
    // node:test (`pnpm test:schema`, `pnpm test:publisher`, `pnpm test:build`,
    // `pnpm test:template`).
    exclude: [...configDefaults.exclude, "test/schema/**", "test/publisher/**", "test/build/**", "test/template/**"],
    projects: [
      // Render components through the Astro container.
      { extends: true, test: { name: "unit", include: ["test/**/*.test.ts"] } },
      // Read the built site in dist/; run after `pnpm build`.
      { extends: true, test: { name: "dist", include: ["test/**/*.dist.ts"] } },
    ],
  },
});
