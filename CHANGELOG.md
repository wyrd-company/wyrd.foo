# Changelog

## 2.3.0

### Features

- Provide a releases RSS feed with subscription links and stable release identities.
- Show repository licence expressions on product pages
- Add page problem reports to the site and product repositories with page and source context.
- Support coding harness plugins in the catalog, docs publisher and harness install tabs.
- Serve product pages as Markdown at /tools/<key>.md
- Accept optional tool-authored Compose and Kubernetes YAML paths on app and CLI Docker install entries and dev container image kinds and render, download and copy their published content in install tabs.

### Fixes

- Open docs edit links in GitHub.dev, with a footer link on narrow screens and docs changelogs.
- Run the publishing action and site build on Node 26.
- Warn during validate when workflow_run names no workflow in the repo; fail with --strict.
- Require Node.js 22.23.4 or later to build the site with the Markdown renderer's security and escaping fixes.
- Align the page-title design token with the regular weight of releases, docs index and 404 titles.
- Build the site with Astro 7 and Vite 8 while preserving Markdown and HTML whitespace behavior.
- Update Markdown rendering with safer Prism code escaping and current highlighting support.
- Update the Markdown renderer and site build dependencies.

## 2.2.1

### Fixes

- The docs publisher accepts an Intentional `contract-2` configuration as well as `contract-1`, so that a tool repo can publish its docs after it upgrades with `intentional init` (Intentional 0.4.0).

## 2.2.0

### Features

- A Toha template, `gh:wyrd-company/wyrd.foo@main#templates/tool-docs`, onboards a tool repo to wyrd.foo publishing: it writes the `docs/user/` starter, the workflow that calls `publish-docs.yml@v2` and the Intentional docs unit, and `toha apply --update` brings later template changes into the repo.

### Fixes

- Release tag pushes automatically publish a GitHub Release using the tagged changelog before moving the major tag. Reruns preserve an existing published Release.

## 2.1.0

### Features

- Publish now waits for the GitHub Release of a product's code tag when it is not found yet, at most 10 minutes, with a log line on each wait. A docs tag pushed together with a code tag no longer fails while the code release is still running.
- `task validate:repo -- <repo path> --strict` reports an unmet publishing requirement as an error, as publish does, so a repo that already publishes finds the failure before it pushes a tag. Without `--strict` it stays a warning.

### Fixes

- The publisher now reads a tool repo checked out as a linked git worktree: `task validate:repo` names the owner from `origin` without `--owner`, and `--ref` finds a commit there.
- An unknown URL now answers with status 404 and a 404 page that links to the catalog, search and home, in place of the home page with status 200.

## 2.0.0

### Breaking

- wyrd.foo v2. The site has a new design with dark and light themes and site
  search. The home page shows a featured product, recent releases and a catalog
  filtered by kind. Each product has a page at `/tools/<key>` with install
  commands for each kind, its media and its latest release, and docs pages at
  `/docs/<key>/<slug>`. `/releases` lists the latest release of every product,
  and the site serves `/llms.txt` and a sitemap. Tool repos publish from
  `docs/user/`, with a `docs.yml` that follows the v2 docs contract, and call the
  reusable workflow `wyrd-company/wyrd.foo/.github/workflows/publish-docs.yml@v2`
  on a tag push or a manual run. A manual run can feature a product on the home
  page. The site builds only v2 content, so tool repos must move from
  `publish-docs@v1` to `publish-docs@v2`.

## 1.0.0

### Features

- The wyrd.foo site: a front page that catalogues Wyrd Company's public tools,
  and a docs section for each tool, built from the tool folders in `content/`.
- `publish-docs@v1`: a composite action that a tool repo runs to publish its
  `docs/` folder to wyrd.foo. It reads `docs/docs.yml` (`name`, `tagline`,
  `category`, `status`), the `docs/*.md` pages marked `docs: true` with a
  `title` and an `order`, and the files listed in `assets`, and replaces the
  tool's folder in `content/` on each run.
