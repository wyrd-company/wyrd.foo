This is a Astro website repo.

Skills can be found in `.agents/skills`

Discover additional skills by running `npx skills list -g`. Use relevant skills (front-end design, astro, tailwind, favicon, etc.).

## Dependency exceptions

- `@astrojs/check` runs on TypeScript 6 (`.pnpmfile.cjs`), because TypeScript 7 has no programmatic API yet. The rest of the project uses TypeScript 7. Remove the hook when `@astrojs/check` supports TypeScript 7.

## Lint exceptions

- `.github/actionlint.yaml` ignores actionlint's "invalid format" message for the `$/.github/actions/publish-docs` call in `.github/workflows/publish-docs.yml`, because actionlint does not know the `$/` self-repository syntax yet (rhysd/actionlint#760). `test/publisher/workflow.test.ts` checks that call's inputs against the action. Remove the ignore when actionlint supports `$/`.

## Tests

Three runners own the tests (vitest runs two projects). Each row names the config it is read from.

| Runner | Owns | Command | Read from |
| --- | --- | --- | --- |
| node:test | `test/schema/**/*.test.ts` | `pnpm test:schema` | `package.json:15` |
| node:test | `test/publisher/**/*.test.ts` | `pnpm test:publisher` | `package.json:16` |
| vitest `unit` | `test/**/*.test.ts`, minus `test/schema/**` and `test/publisher/**` | `pnpm test:site` | `vitest.config.ts:8` (exclude), `vitest.config.ts:11` (include), `package.json:17` |
| vitest `dist` | `test/**/*.dist.ts` | `pnpm test:dist` (builds the fixtures first) | `vitest.config.ts:13`, `package.json:22` |
| Playwright | `test/browser/**/*.spec.ts` | `pnpm test:browser` (builds the home, docs and product fixtures first) | `package.json:23`, `test/browser/config.ts:66` (`testDir`, `testMatch` defaults) |

`pnpm test` runs the first three rows; `pnpm check` runs all of them.

A new node:test folder must be added to the `exclude` list in `vitest.config.ts`
(and given its own `pnpm test:*` script that `pnpm test` runs), or vitest
collects its `*.test.ts` files and fails on `node:test` imports.
