# wyrd.foo

The catalog and documentation site for [Wyrd Company](https://wyrd.company)'s
public tools: CLIs, MCP servers, apps, dev container features and dev container
images. Built with [Astro](https://astro.build) and Tailwind.

The site is a static build with no backend. The front page holds the featured
product, recent releases and the catalog. Each product has a product page, a
releases page and, when it ships pages, a docs site. `/releases` lists every
product's latest release, and Pagefind indexes the product, releases and docs
pages.

## Design

- [`docs/concepts/wyrd-foo.yml`](docs/concepts/wyrd-foo.yml): the concept:
  what the site is for and what it does.
- [`DESIGN.md`](DESIGN.md): the visual design system, in the
  [DESIGN.md](https://github.com/google-labs-code/design.md) format: colour
  tokens for both themes, type, spacing, shapes and components.
- [`docs/technical-designs/site.yml`](docs/technical-designs/site.yml): the
  pages and their behaviour: home page, product page, install blocks, releases,
  docs, the 404 page, search, sitemap and `/llms.txt`.
- [`docs/technical-designs/publishing.yml`](docs/technical-designs/publishing.yml):
  how a tool repo publishes: the `docs/user/` contract, the publishing
  requirements, the publisher core, local mode, the reusable workflow and the
  JSON Schema.

## Content model

Product metadata and documentation are **data, not code**. Each product has a
self-contained folder under `content/<key>/`, in the layout the publisher
(`publisher/`) writes from the tool repository's `docs/user/` folder
(`publishing.yml`, `content`):

```text
content/<key>/
├── tool.yaml        # catalog metadata: name, tagline, category, status, kinds,
│                    # highlights, media, version, owner, release, featured
├── README.md        # feature entries only: the page body
├── CHANGELOG.md     # the code changelog
├── manifest.json    # dev container image products only: the image manifest
└── docs/            # pages at any depth (title, product, order, install),
                     # assets, and the docs changelog CHANGELOG.md
```

A product self-registers by adding its folder: it then appears in the
front-page catalog, gets a product page at `/tools/<key>` and, if it ships
pages, a docs section at `/docs/<key>`. No page code changes are required.
The docs contract in `src/schema/` validates `tool.yaml` and page front matter,
and the Astro content collections (`src/content.config.ts`) read the folders
through it, so a product that breaks the contract fails the build.

The collections read `content/` unless `WYRD_CONTENT_DIR` names another
folder, such as the dev content folder or a test fixture.

## Publishing

A tool repo publishes its products from its own release tags: its workflow
calls the reusable workflow `.github/workflows/publish-docs.yml@v2` on a push
of a code tag or a docs tag, or on a manual run. The workflow runs the
`publish-docs@v2` action, which validates the repo's `docs/user/` against the
shared schema, records release data and pushes `content/<key>/` for each
product to `main`. The push starts the deploy. The contract, the calling
workflow and the requirements are in
[`docs/technical-designs/publishing.yml`](docs/technical-designs/publishing.yml).

To onboard a tool repo, apply the Toha template in
[`templates/tool-docs/`](templates/tool-docs/README.md) from
`gh:wyrd-company/wyrd.foo@main#templates/tool-docs`. It writes the
`docs/user/` starter, the calling workflow and the Intentional docs unit, and
`toha apply --update` brings later template changes into the repo.

The JSON Schema for `docs/user/docs.yml` is served at
`https://wyrd.foo/schemas/docs/v1.json`.

## Structure

```text
DESIGN.md                    # the visual design system
docs/technical-designs/      # the site and publishing designs
content/                     # one folder per product (metadata + docs)
src/
├── content.config.ts        # collections: products, pages, changelogs, READMEs
├── schema/                  # the docs contract, shared with the publisher
├── lib/                     # read/query helpers
├── layouts/SiteLayout.astro # base document shell
├── components/              # shared, home, product and docs components
└── pages/
    ├── index.astro          # front-page catalog
    ├── releases.astro       # every product's latest release
    ├── 404.astro            # the page for every URL that has no page
    ├── tools/[key].astro    # product pages
    ├── tools/[key]/releases.astro  # each product's full changelog
    └── docs/[key]/          # docs pages
publisher/                   # the publisher core: publish, local and validate
templates/tool-docs/         # the Toha template that onboards a tool repo
.github/actions/publish-docs # the publish-docs@v2 action
.github/workflows/publish-docs.yml  # the reusable workflow tool repos call
```

## Develop

Use Node.js 22.23.4 or later and the pnpm version declared in `package.json`.
The Markdown renderer requires this Node minimum. The devcontainer installs
Node's current LTS version; the publishing action provisions Node 24.

```sh
pnpm install
pnpm dev        # or: task dev  (binds 0.0.0.0 for the devcontainer)
pnpm build      # static build to dist/
pnpm preview
```

## Dev server over the tool repos

`task dev:v2` builds the content from each tool repo's `wyrd-foo-v2` branch,
builds the site on it and serves the build, so search works:

1. The publisher (`publisher/`) runs in local mode over the repos in
   `publisher/local-repos.yml`. For the clone at `/workspaces/tools/<name>`,
   it fetches `wyrd-foo-v2` from origin into `origin/wyrd-foo-v2` only, then
   reads `origin/wyrd-foo-v2` (else the local branch) through git objects:
   no checkout, no commit, no push. Set `WYRD_TOOLS_DIR` for another clone
   folder.
2. It writes `.content-v2/<key>/` for every product (`WYRD_CONTENT_DIR` sets
   another folder) and prints each repo's warnings and errors. An unmet
   publishing requirement (no `.intentional/`, no GitHub Release, no
   `wyrd-foo-v2` branch) is a warning. A repo with a schema or check error
   writes nothing and the run goes on (`publishing.yml`, `local-mode`).
3. `pnpm build` builds the site and its Pagefind search index into `dist/`
   with `WYRD_CONTENT_DIR` set to that folder, and `astro preview` serves
   `dist/`. Run `task dev:v2` again to see a content change. For live reload
   while working on the site itself, use `task dev` (no search index).

Arguments after `--` go to the publisher; `ASTRO_ARGS` goes to `astro preview`.

```sh
task dev:v2               # reads GitHub Releases (GITHUB_TOKEN or GH_TOKEN if set)
task dev:v2 -- --offline  # no fetch; release data from local tags only
task dev:v2 ASTRO_ARGS="--port 4417"                # options for astro preview
task dev:v2 ASTRO_ARGS="--port 4417 --host" -- --offline  # both
task publish:local        # the publisher step only
task validate:repo -- ../gitpr                    # one checkout's working tree
task validate:repo -- ../gitpr --ref wyrd-foo-v2  # one ref of a checkout
task validate:repo -- ../gitpr --strict           # fail on what publish fails on
```

`validate:repo` reports a publishing requirement that the repo does not meet
yet (no GitHub Release, no release tag, no changelog) as a warning, so a repo
that does not publish yet can still be checked. Publish fails on the same
finding. For a repo that already publishes, add `--strict`: it uses publish's
severities, so the run fails before the tag push, not after it. `--strict`
reads GitHub Releases, so it does not go with `--offline`.

`validate:repo` also checks scalar and array `workflow_run.workflows` filters
in `.github/workflows/`. It uses each workflow's `name:`, or its
repository-relative file path when `name:` is omitted. Matching is
case-sensitive and supports `*`, alphanumeric bracket classes, and escaped
special characters. An unmatched inclusion filter is a warning, or an error
with `--strict`. For example, `Release*` matches `Release package`, while
`Release` does not match `release`. Both `.yml` and `.yaml` files are read;
`--ref` checks the workflows at that ref.

This is an existence check, not full GitHub Actions validation. Exclusion
filters do not need to match a workflow. Filters containing unescaped `?`,
`+`, or `**` are left unchecked: GitHub's semantics differ from the matching
library. Names with dot path segments and patterns beyond the library's size
limit are also left unchecked. Glob filters are left unchecked when a workflow
name ends in `/`; literal names still use exact string matching. These forms remain valid inputs to the
publisher, including with `--strict`. This check does not evaluate whether
ordered exclusions leave any workflow enabled. See
[GitHub's workflow filter contract](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_runworkflows).

## Browser tests

Behaviour that only a real browser shows (the theme before the first paint, the
toggle, the system preference, the home page's tabs, filter, Copy and featured
card, the product page's sections for each kind, the releases pages in each
theme, the docs pages' sticky header and "On this page", and the 404 status
and links of an unknown URL) is checked with
[Playwright Test](https://playwright.dev/docs/test-intro) in `test/browser/`.
The suite serves the built site (`dist/`) with `astro preview` on a free port,
and stops the server when the run ends, however it ends. The home, docs and
product page specs each run against a server of their own on a fixture build
(`dist-fixtures/home`, `dist-fixtures/docs` and `dist-fixtures/products`, built
from `test/fixtures/*-content` by `pnpm test:browser`, so the suite has no build
step beyond `pnpm build`). The run fails when a fixture has no server port, so
its specs cannot be skipped unnoticed.

```sh
pnpm exec playwright install chromium   # once; the version is pinned by @playwright/test
pnpm build                              # the suite reads dist/
pnpm test:browser                       # or: task test:browser
```

With the browser missing, the run fails and names the install step. `pnpm check`
includes the suite.

## Deploy

Deployment runs from `.github/workflows/cd.yml` on push to `main`. The target is
selected by the `DEPLOY_TARGET` repository variable (`cf_pages` for Cloudflare
Pages or `gh_pages` for GitHub Pages); leaving it unset skips deployment.

## Releases

The repo is one [Intentional](https://wyrd.foo/docs/intentional/overview)
release unit, `wyrd-foo`. Its version is the version of the `publish-docs`
contract that tool repos call, and `CHANGELOG.md` records each release. A
change that tool repos or site users see adds an intent with
`intentional add`. The PR build runs `intentional check`.

To release:

1. Run `intentional status` and confirm the next version.
2. Run `intentional plan > release-plan.json`, then `intentional apply`.
   Commit the result as `chore(release): X.Y.Z`, alone in its release PR.
3. When the release commit is on `main`, check it out and run
   `intentional tag --plan release-plan.json`. This makes the `X.Y.Z` tag.
4. Push the tag: `git push origin X.Y.Z`. The push runs
   `.github/workflows/major-tag.yml`, which publishes the GitHub Release
   with that version's notes from the tagged `CHANGELOG.md`, then moves
   `vX` to the release when it is the highest `X.y.z`.

The workflow uses its own `contents: write` token. A rerun preserves an
existing published GitHub Release and retries the major-tag move. A failure
to publish prevents the major-tag move; fix the failure and rerun the
workflow. An existing unpublished release requires operator attention.

Release tags are bare versions, such as `2.0.0`. The major tag keeps its `v`,
such as `v2`, because tool repos call `publish-docs.yml@v2`. Intentional does
not manage the major tag; the major-tag workflow does.
