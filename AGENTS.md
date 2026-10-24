This is a Astro website repo.

Skills can be found in `.agents/skills`

Discover additional skills by running `npx skills list -g`. Use relevant skills (front-end design, astro, tailwind, favicon, etc.).

## Dependency exceptions

- `@astrojs/check` runs on TypeScript 6 (`.pnpmfile.cjs`), because TypeScript 7 has no programmatic API yet. The rest of the project uses TypeScript 7. Remove the hook when `@astrojs/check` supports TypeScript 7.
