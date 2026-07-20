# Publishing tool docs to wyrd.foo

wyrd.foo renders its catalogue and documentation from a `content/` tap: one
self-contained folder per tool. Each tool **repository** owns its own docs and
publishes them here on release, via a reusable GitHub Action provided by this
repo. The tool repo is the single source of truth; the tap is a generated
projection.

## What a tool repo ships

A `docs/` directory containing a manifest and one Markdown file per page:

```
docs/
├── docs.yml          # catalogue metadata for the tool
├── overview.md       # a page (frontmatter: title, order, docs: true)
├── install.md        # …
└── internal-notes.md # NOT published (no `docs: true`)
```

Only pages whose frontmatter sets `docs: true` are published — anything else in
`docs/` is ignored, so a repo can keep internal notes alongside public pages.

### `docs/docs.yml`

```yaml
name: gitpr                 # URL-safe slug (lowercase, digits, hyphens) — the docs path
tagline: Review worktree branches as local pull requests.
blurb: >-
  A local Go CLI and TUI that turns worktree branches into lightweight pull
  requests against your local default branch — no server, no remote, no forge.
category: Git & Review      # groups the tool on the front page
language: Go
status: stable              # stable | preview | planned
repo: https://github.com/wyrd-company/gitpr
order: 1                    # sort position in the catalogue (optional; defaults last)
install:
  - label: Homebrew
    command: brew install wyrd-company/tools/gitpr
```

### A page — `docs/overview.md`

```markdown
---
title: Overview        # sidebar + heading label (required)
order: 1               # page order within this tool; lowest is the default page (required)
docs: true             # publish gate — omit and the page stays private
install: true          # optional: render the install block at the top of this page
---

Markdown body. Code fences get syntax highlighting; ordered lists, tables, and
inline code are all styled.
```

The `docs: true` line is stripped when the page lands in the tap.

## Wiring it up in a tool repo

Add one workflow (release-triggered). Copy
[`examples/publish-docs.yml`](examples/publish-docs.yml):

```yaml
name: Publish docs

on:
  release:
    types: [published]
  workflow_dispatch: {}

permissions:
  contents: read

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: wyrd-company/wyrd.foo/.github/actions/publish-docs@v1
        with:
          app-id: ${{ secrets.WYRD_TOOLS_DOCS_PUBLISHER_APP_ID }}
          private-key: ${{ secrets.WYRD_TOOLS_DOCS_PUBLISHER_PRIVATE_KEY }}
```

Pin to a released tag (`@v1`), not `@main`.

## What the Action does

1. **No-ops** if `docs/docs.yml` is absent or no page is marked `docs: true`.
2. Validates the manifest (slug-safe `name`, `status` enum, `tagline`,
   `category`) and each page (`title`, `order`) — failing in the tool repo
   rather than breaking the site build.
3. Mints a token from the publisher GitHub App scoped to wyrd.foo, checks it out,
   then **deletes and recreates** `content/<name>/` — so adds, edits, and page
   removals all sync on every publish.
4. Commits as the App bot and pushes (with fetch-rebase-retry for concurrent
   publishes). If nothing changed, it skips the commit.

The push to `main` triggers wyrd.foo's deploy workflow automatically — the App
token push is a real actor, so it starts the downstream build (unlike a
`GITHUB_TOKEN` push). No `repository_dispatch` needed.

Renaming a tool's `name` orphans the old `content/<oldname>/` folder; delete it
by hand. That's the accepted cost of a rename.

## One-time org setup

- **GitHub App** `WYRD_TOOLS_DOCS_PUBLISHER` installed on **wyrd.foo** with
  **Contents: read/write**.
- **Org secrets** `WYRD_TOOLS_DOCS_PUBLISHER_APP_ID` and
  `WYRD_TOOLS_DOCS_PUBLISHER_PRIVATE_KEY`, granted to the tool repos.
- In **wyrd.foo → Settings → Actions → General → Access**, allow the repo's
  actions to be used by other repositories in the organization (so tool repos
  can reference `wyrd-company/wyrd.foo/.github/actions/publish-docs`).
