# Changelog

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
