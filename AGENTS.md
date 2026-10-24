This is a Astro website repo.

Skills can be found in `.agents/skills`

Discover additional skills by running `npx skills list -g`. Use relevant skills (front-end design, astro, tailwind, favicon, etc.).

## Dependency exceptions

- `@astrojs/check` runs on TypeScript 6 (`.pnpmfile.cjs`), because TypeScript 7 has no programmatic API yet. The rest of the project uses TypeScript 7. Remove the hook when `@astrojs/check` supports TypeScript 7.

## Workflow lint

After a change under `.github/`, run both linters from the repo root:

```sh
actionlint
uvx zizmor@1.31.1 .github/
```

zizmor reads `.github/zizmor.yml`; add `--offline` when there is no network.

## Lint exceptions

- `.github/actionlint.yaml` ignores actionlint's "invalid format" message for the `$/.github/actions/publish-docs` call in `.github/workflows/publish-docs.yml`, because actionlint does not know the `$/` self-repository syntax yet (rhysd/actionlint#760). `test/publisher/workflow.test.ts` checks that call's inputs against the action. Remove the ignore when actionlint supports `$/`.

## Tests

Three runners own the tests (vitest runs two projects). Each row names the config it is read from, by script, project or key name.

| Runner | Owns | Command | Read from |
| --- | --- | --- | --- |
| node:test | `test/schema/**/*.test.ts` | `pnpm test:schema` | `package.json` script `test:schema` |
| node:test | `test/publisher/**/*.test.ts` | `pnpm test:publisher` | `package.json` script `test:publisher` |
| vitest `unit` | `test/**/*.test.ts`, minus `test/schema/**`, `test/publisher/**` and `test/build/**` | `pnpm test:site` | `vitest.config.ts` key `exclude`, `vitest.config.ts` project `unit`, `package.json` script `test:site` |
| node:test | `test/build/**/*.test.ts` | `pnpm test:build` | `package.json` script `test:build` |
| vitest `dist` | `test/**/*.dist.ts` | `pnpm test:dist` (builds the fixtures first) | `vitest.config.ts` project `dist`, `package.json` script `test:dist` |
| Playwright | `test/browser/**/*.spec.ts` | `pnpm test:browser` (builds the home, docs and product fixtures first) | `package.json` script `test:browser`, `test/browser/config.ts` key `testMatch` (the `testDir` and `testMatch` defaults) |

`pnpm test` runs the first four rows; `pnpm check` runs all of them.

A new node:test folder must be added to the `exclude` list in `vitest.config.ts`
(and given its own `pnpm test:*` script that `pnpm test` runs), or vitest
collects its `*.test.ts` files and fails on `node:test` imports.
