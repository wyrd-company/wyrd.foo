# wyrd.foo

The landing and documentation site for [Wyrd Company](https://wyrd.company)'s
public command-line tools. Built with [Astro](https://astro.build) and Tailwind.

The site is a single front page cataloguing every tool, plus per-tool
documentation. It is a static build with no backend.

## Content model

Tool metadata and documentation are **data, not code**. Each tool ships a
self-contained folder under `content/<tool>/`:

```
content/<tool>/
├── tool.yaml        # catalog metadata: name, tagline, category, status, install, repo
└── docs/*.md        # documentation pages (frontmatter: title, order, install)
```

A tool self-registers by adding its folder — it then appears on the front-page
catalogue and, if it ships `docs/`, in the documentation navigation. No page
code changes are required. Content is read through Astro content collections
(`src/content.config.ts`) via helpers in `src/lib/catalog.ts`.

In production this `content/` tree is a "tap": each tool repository publishes its
`tool.yaml` and `docs/` into it, and a push triggers a rebuild. The collection
loader is the only thing that knows where content comes from, so the source can
change without touching pages or styles.

## Structure

```
content/                     # the tool tap (metadata + docs)
src/
├── content.config.ts        # content collections (tools, docs)
├── lib/catalog.ts           # read/query helpers
├── layouts/SiteLayout.astro # base document shell
├── components/icons/        # shared icons
└── pages/
    ├── index.astro          # front-page catalogue
    └── docs/[tool]/[...page].astro
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
   `publisher/local-repos.yml`. It reads each repo's `wyrd-foo-v2` branch
   (local, else `origin/wyrd-foo-v2`) from the clone at
   `/workspaces/tools/<name>` through git objects only: no checkout, no
   commit, no fetch, no push. Set `WYRD_TOOLS_DIR` for another clone folder.
2. It writes `.content-v2/<key>/` for every product (`WYRD_CONTENT_DIR` sets
   another folder) and prints each repo's warnings and errors. An unmet
   publishing requirement (no `.intentional/`, no GitHub Release, no
   `wyrd-foo-v2` branch) is a warning. A repo with a schema or check error
   writes nothing and the run goes on.
3. `astro dev` starts with `WYRD_CONTENT_DIR` set to that folder.

```sh
task dev:v2                   # GitHub Releases read with GITHUB_TOKEN or GH_TOKEN when set
task dev:v2 -- --offline      # release data from local tags only
task publish:local            # the publisher step only
task validate:repo -- ../gitpr --ref wyrd-foo-v2   # check one checkout; working tree without --ref
```

## Deploy

Deployment runs from `.github/workflows/cd.yml` on push to `main`. The target is
selected by the `DEPLOY_TARGET` repository variable (`cf_pages` for Cloudflare
Pages or `gh_pages` for GitHub Pages); leaving it unset skips deployment.
