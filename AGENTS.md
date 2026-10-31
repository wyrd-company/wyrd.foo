# wyrd.foo

This is an Astro website repo.

Skills can be found in `.agents/skills`

Discover additional skills by running `npx skills list -g`. Use relevant
skills (front-end design, astro, tailwind, favicon, etc.).

## Design documents

- `DESIGN.md`: the visual design system (tokens and rationale). The tokens
  mirror `src/styles/global.css`; change both together.
- `docs/technical-designs/site.yml`: the pages and their behaviour.
- `docs/technical-designs/publishing.yml`: the `docs/user/` contract, the
  publisher, local mode and the reusable workflow.
  `test/schema/design-examples.test.ts` validates its `docs.yml` examples
  against the schema.

## Runtime and build-tool minimums

Wyrd Company is the sole deployer of this website. Raising its supported
runtime and build-tool minimum versions is pre-approved. Make the matching
documentation, configuration and validation changes without another approval
request. This authorization is scoped to this website's deployment; the
reusable publishing contract's compatibility and release rules still apply.

## Dependency exceptions

- `@astrojs/check` runs on TypeScript 6 (`.pnpmfile.cjs`), because
  TypeScript 7 has no programmatic API yet. The rest of the project uses
  TypeScript 7. `scripts/typecheck-site.ts` syncs types and calls the checker
  API directly; Astro 7's `astro check` command rejects project TypeScript 7
  before it loads the checker. Remove the hook when `@astrojs/check` supports
  TypeScript 7.

## Workflow lint

After a change under `.github/`, run both linters from the repo root:

```sh
actionlint
uvx zizmor@1.31.1 .github/
```

zizmor reads `.github/zizmor.yml`; add `--offline` when there is no network.

## Lint exceptions

- `.github/actionlint.yaml` ignores actionlint's "invalid format" message
  for the `$/.github/actions/publish-docs` call in
  `.github/workflows/publish-docs.yml`, because actionlint does not know the
  `$/` self-repository syntax yet (rhysd/actionlint#760).
  `test/publisher/workflow.test.ts` checks that call's inputs against the
  action. Remove the ignore when actionlint supports `$/`.

## Tests

Three runners own the tests (vitest runs two projects). Each row names the
config it is read from, by script, project or key name.

| Runner | Owns | Command | Read from |
| --- | --- | --- | --- |
| node:test | `test/schema/**/*.test.ts` | `pnpm test:schema` | `package.json` script `test:schema` |
| node:test | `test/publisher/**/*.test.ts` | `pnpm test:publisher` | `package.json` script `test:publisher` |
| vitest `unit` | `test/**/*.test.ts`, minus `test/schema/**`, `test/publisher/**`, `test/build/**` and `test/template/**` | `pnpm test:site` | `vitest.config.ts` key `exclude`, `vitest.config.ts` project `unit`, `package.json` script `test:site` |
| node:test | `test/build/**/*.test.ts` | `pnpm test:build` | `package.json` script `test:build` |
| node:test | `test/template/**/*.test.ts` | `pnpm test:template` | `package.json` script `test:template` |
| vitest `dist` | `test/**/*.dist.ts` | `pnpm test:dist` (builds the fixtures first) | `vitest.config.ts` project `dist`, `package.json` script `test:dist` |
| Playwright | `test/browser/**/*.spec.ts` | `pnpm test:browser` (builds the home, docs and product fixtures first) | `package.json` script `test:browser`, `test/browser/config.ts` key `testMatch` (the `testDir` and `testMatch` defaults) |

`pnpm test` runs the first four rows; `pnpm check` runs all of them except
`pnpm test:template`. That suite runs the Toha template in
`templates/tool-docs/` with the real Toha 0.4.0 and Intentional 0.2.1, which
hosted CI does not have; run it after a change to the template
(`templates/tool-docs/README.md`, "Test").

A new node:test folder must be added to the `exclude` list in `vitest.config.ts`
(and given its own `pnpm test:*` script that `pnpm test` runs), or vitest
collects its `*.test.ts` files and fails on `node:test` imports.

## Releases

The repo is one Intentional release unit, `wyrd-foo`
(`.intentional/config.yml`). Its version is the version of the `publish-docs`
contract.

- Add an intent with
  `intentional add --release-unit wyrd-foo:<bump> --message "..."` for each
  change that tool repos or site users see. A change to the `publish-docs`
  inputs, the docs contract or the content layout that breaks a tool repo is
  `major`.
- Do not edit `CHANGELOG.md` or the `package.json` version by hand.
- Do not run `intentional apply` or `intentional tag`, or push a release tag,
  unless the release is approved. README.md, "Releases", gives the steps.
- Do not move the `v<major>` tag by hand. A push of a release tag `X.Y.Z` runs
  `.github/workflows/major-tag.yml`, which moves `vX` to the highest `X.y.z`.
