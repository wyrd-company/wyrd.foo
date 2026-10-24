/// <reference types="vitest/config" />
import { getViteConfig } from "astro/config";
import { configDefaults } from "vitest/config";

export default getViteConfig({
  test: {
    // test/schema/ and test/publisher/ run on node:test (`pnpm test:schema`, `pnpm test:publisher`).
    exclude: [...configDefaults.exclude, "test/schema/**", "test/publisher/**"],
    projects: [
      // Render components through the Astro container.
      { extends: true, test: { name: "unit", include: ["test/**/*.test.ts"] } },
      // Read the built site in dist/; run after `pnpm build`.
      { extends: true, test: { name: "dist", include: ["test/**/*.dist.ts"] } },
    ],
  },
});
