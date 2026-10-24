# wyrd.foo

The landing and documentation site for [Wyrd Company](https://wyrd.company)'s
public command-line tools. Built with [Astro](https://astro.build) and Tailwind.

The site is a single front page cataloguing every tool, plus per-tool
documentation. It is a static build with no backend.

## Content model

Product metadata and documentation are **data, not code**. Each product has a
self-contained folder under `content/<key>/`, in the layout the publisher
(`publisher/`) writes from the tool repository's `docs/user/` folder:

```
content/<key>/
├── tool.yaml        # catalog metadata: name, tagline, category, status, kinds, highlights, media, version
├── README.md        # feature entries only: the page body
├── CHANGELOG.md     # the code changelog
└── docs/            # pages at any depth (front matter: title, product, order, install),
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

## Structure

```
content/                     # one folder per product (metadata + docs)
src/
├── content.config.ts        # content collections (products, pages, changelogs, feature READMEs)
├── schema/                  # the docs contract, shared with the publisher
├── lib/                     # read/query helpers
├── layouts/SiteLayout.astro # base document shell
├── components/              # shared, home, product and docs components
└── pages/
    ├── index.astro          # front-page catalog
    ├── tools/[key].astro    # product pages
    └── docs/[key]/          # docs pages
publisher/                   # the publisher core: local mode and validation
```

## Develop

```sh
pnpm install
pnpm dev        # or: task dev  (binds 0.0.0.0 for the devcontainer)
pnpm build      # static build to dist/
pnpm preview
```

## v2 dev server

`task dev:v2` builds the v2 content from each tool repo's `wyrd-foo-v2`
branch and serves the site on it:

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
   writes nothing and the run goes on.
3. `astro dev` starts with `WYRD_CONTENT_DIR` set to that folder.

Arguments after `--` go to the publisher; `ASTRO_ARGS` goes to `astro dev`.

```sh
task dev:v2               # reads GitHub Releases (GITHUB_TOKEN or GH_TOKEN if set)
task dev:v2 -- --offline  # no fetch; release data from local tags only
task dev:v2 ASTRO_ARGS="--port 4417"                # options for astro dev
task dev:v2 ASTRO_ARGS="--port 4417 --host" -- --offline  # both
task publish:local        # the publisher step only
task validate:repo -- ../gitpr                    # one checkout's working tree
task validate:repo -- ../gitpr --ref wyrd-foo-v2  # one ref of a checkout
```

## Browser tests

Behaviour that only a real browser shows (the theme before the first paint, the
toggle, the system preference, the home page's tabs, filter, Copy and featured
card, the product page's sections for each kind, and the docs pages' sticky
header and "On this page") is checked with
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
