This is a Astro website repo.

Skills can be found in `.agents/skills`

Discover additional skills by running `npx skills list -g`. Use relevant skills (front-end design, astro, tailwind, favicon, etc.).

## Dependency exceptions

- `@astrojs/check` runs on TypeScript 6 (`.pnpmfile.cjs`), because TypeScript 7 has no programmatic API yet. The rest of the project uses TypeScript 7. Remove the hook when `@astrojs/check` supports TypeScript 7.

## Lint exceptions

- `.github/actionlint.yaml` ignores actionlint's "invalid format" message for the `$/.github/actions/publish-docs` call in `.github/workflows/publish-docs.yml`, because actionlint does not know the `$/` self-repository syntax yet (rhysd/actionlint#760). `test/publisher/workflow.test.ts` checks that call's inputs against the action. Remove the ignore when actionlint supports `$/`.
