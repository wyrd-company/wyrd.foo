# Proposal: pull-based publishing

Status: **proposed** — not implemented. [`PUBLISHING.md`](PUBLISHING.md)
describes the current push-based flow and stays authoritative until this lands.

## Goals

- Stand up a new tool without changing wyrd.foo.
- Keep validation, the schema, and the content layout in one place (wyrd.foo),
  so they can change without retagging an action or editing tool repos.
- Record release information so the site can show recent releases and a
  featured product.
- Support more than CLIs: MCP servers, dev container features and images, and
  apps with a web console.

## Overview

The tool repo no longer pushes into wyrd.foo. It asks wyrd.foo to pull.

```text
tool repo (release)                      wyrd.foo
───────────────────                      ────────
release published
  └─ request-publish ── repository_dispatch ──▶ ingest workflow
     (repo, ref, release,                       1. repo is in the org and opted in?
      feature options)                          2. check out repo @ ref
                                                3. download release asset (generated data)
                                                4. validate against the site schema
                                                5. carry forward release / featured
                                                6. rewrite content/<slug>/, commit
                                                7. report status back to the tool repo
                                              ──▶ deploy (cd.yml)
```

## Opting a repository in

Opt-in is an **organization custom repository property**, not a file in
wyrd.foo.

| Property           | Type    | Meaning                                  |
| ------------------ | ------- | ---------------------------------------- |
| `wyrd-foo-publish` | boolean | `true` lets wyrd.foo ingest this repo.   |

- Define it once at the org level with **"Allow repository actors to set this
  property" turned off**, so only org owners (or a role granted to manage
  properties) can opt a repo in. Repo admins cannot publish to the site on
  their own.
- Setting it to `false` (or removing it) opts the repo out. The next full
  resync removes its `content/<slug>/`.

Adding a tool is then:

1. Set `wyrd-foo-publish: true` on the repo.
2. Add the `request-publish` workflow call to its release workflow.
3. Commit `docs/docs.yml` and pages.

## What a tool repo provides

### Committed: `docs/`

Unchanged from today in shape: `docs/docs.yml`, Markdown pages gated by
`docs: true`, and listed assets. New fields in `docs.yml`:

- `kind` — `cli` | `mcp-server` | `devcontainer-feature` | `devcontainer-image` | `app`.
- `install` — every install method, with the operating systems it supports
  (see below). Replaces today's `install: [{label, command}]`.
- `highlights` — up to six one-line statements for "What it does".
- `nav` — sections, groups and page order for the docs sidebar (see below).
- `media` — the product's hero media (each `src` must be listed in `assets`).
- A kind-specific block, including the primary "get it" command shown in the
  catalog (install command, `claude mcp add …`, `devcontainer.json` reference,
  or run command).
- `schemaVersion` — the major version of the site schema the file targets.

Language is no longer shown on the site and is dropped from the schema.

`install` describes each method once; the site generates the product page's
install section and the hero's default command from it:

```yaml
install:
  - method: homebrew
    os: [macos, linux]
    command: brew install wyrd-company/tools/toha
  - method: apt
    os: [linux]
    label: Debian, Ubuntu        # optional; shown beside the method
    command: |
      curl -fsSL https://[APT HOST]/key.gpg | sudo gpg --dearmor -o /etc/apt/keyrings/wyrd.gpg
      echo "deb [signed-by=/etc/apt/keyrings/wyrd.gpg] https://[APT HOST] stable main" | sudo tee /etc/apt/sources.list.d/wyrd.list
      sudo apt update && sudo apt install toha
  - method: cargo
    os: [macos, linux, windows]
    command: cargo install toha
  - method: docker
    command: docker run --rm -it ghcr.io/wyrd-company/toha
```

| Field     | Required | Meaning |
| --------- | -------- | ------- |
| `method`  | yes      | One of `homebrew`, `apt`, `rpm`, `aur`, `nix`, `cargo`, `npm`, `pipx`, `go`, `winget`, `scoop`, `docker`, `archive`, `script`. The site owns each method's display name and icon. |
| `os`      | yes, except `docker` | Any of `macos`, `linux`, `windows`. |
| `command` | yes      | One line, or several (YAML block scalar). Shown as one code block with one Copy button. |
| `label`   | no       | Short qualifier, e.g. "Debian, Ubuntu". |
| `default` | no       | `true` on at most one entry: the command shown in the hero. Otherwise the first entry. |

The site derives the platform tabs from `os` (macOS, Linux, Windows, plus
Docker when a `docker` entry exists); a method listed for several systems
appears under each. A method may appear more than once with different `os`
values when the command differs per system.

`install` is for products you install and run (CLIs, MCP servers, apps).
Dev container features and images get their own kind-specific block instead
(`devcontainer.json` reference, options, tags), not a Docker tab.

`nav` lives in `docs.yml` (no second config file):

```yaml
nav:
  - section: Authoring
    groups:
      - group: The interview
        pages: [template-interviews, template-flow, template-jinja]
```

Pages that are published but not listed in `nav` fall into a trailing "More"
group, so a page never silently disappears.

Editors get completion and inline errors from the published schema:

```yaml
# yaml-language-server: $schema=https://wyrd.foo/schemas/docs/v1.json
```

### Generated: release asset `wyrd-manifest.json`

Data produced at build time — an MCP server's tools, resources and prompts; a
feature's options from `devcontainer-feature.json`; an image's tags — is
generated by the tool repo and attached to the GitHub release as
`wyrd-manifest.json`. It is never hand-edited and never committed. wyrd.foo
downloads it from the release named by `ref`.

### Workflow call

Tool repos call a reusable workflow hosted in wyrd.foo. It is called two ways:

- **On release** — passes the release (tag, version, date, URL) and optional
  feature options.
- **Manually** (`workflow_dispatch`) — republishes docs at a ref without a new
  release. Existing `release` and `featured` values are kept.

```yaml
name: Publish to wyrd.foo

on:
  release:
    types: [published]
  workflow_dispatch:
    inputs:
      ref:
        description: Tag or commit to publish
        required: true

jobs:
  publish:
    uses: wyrd-company/wyrd.foo/.github/workflows/request-publish.yml@v1
    with:
      ref: ${{ github.event.release.tag_name || inputs.ref }}
      feature: false          # true to feature this release on the front page
      feature-days: 14        # how long the feature lasts
      feature-reason: ""      # e.g. "New MCP server"; default "New release"
    secrets: inherit
```

## The dispatch

`request-publish` mints a token from the publisher App scoped to wyrd.foo and
sends a `repository_dispatch` with `event_type: wyrd-foo-publish`:

```json
{
  "repo": "wyrd-company/<tool>",
  "ref": "v1.4.0",
  "release": { "version": "1.4.0", "date": "2026-10-01", "url": "https://github.com/…" },
  "feature": { "days": 14, "reason": "New MCP server" }
}
```

`release` is omitted on a manual publish. `feature` is omitted unless
requested. (GitHub limits `client_payload` to 10 top-level keys.)

## The ingest workflow (wyrd.foo)

Runs on `repository_dispatch: wyrd-foo-publish` and on `workflow_dispatch` (for a
full resync). It runs in a single `concurrency` group, so ingests are
serialized and the old push-retry loop goes away.

1. **Authorize.** Read the repo's custom property values via the API. Reject
   unless the repo is in the org and `wyrd-foo-publish` is `true`. The payload's
   `repo` is caller-supplied; this check is what makes it safe to trust.
2. **Check out** the tool repo at `ref`.
3. **Download** `wyrd-manifest.json` from the release, if present.
4. **Validate** `docs.yml` and the manifest against the site schema for the
   declared `schemaVersion`, then run checks JSON Schema cannot express:
   every `nav` page exists and is marked `docs: true`; every `media.src` is in
   `assets`; listed assets exist inside `docs/`.
5. **Carry forward** `release` and `featured` from the existing
   `content/<slug>/tool.yaml`, then apply the dispatch's `release` and
   `feature`. These fields are owned by ingest; `docs.yml` may not set them.
6. **Write** `content/<slug>/` (pages, assets, `tool.yaml`, manifest data),
   commit as the App bot, and push. The push triggers `cd.yml`.
7. **Report** success or failure as a commit status on the tool repo's tagged
   commit, so a rejected publish is visible where the release was made.

### Full resync

`workflow_dispatch` on the ingest workflow with no repo re-ingests every
opted-in repo at its latest release. The list comes from searching the org
for repos with `wyrd-foo-publish` set to `true`; repos with content but no longer
opted in are removed. Use it after schema or layout changes, and to clean up
after a tool is renamed.

## Release and featured data

Written by ingest into `tool.yaml`:

```yaml
release:  { version: 1.4.0, date: 2026-10-01, url: … }
featured: { from: 2026-10-01, until: 2026-10-15, reason: New MCP server, version: 1.4.0 }
```

The front page chooses its hero in the browser, so features expire on time
without a rebuild:

1. An active feature (`from ≤ now < until`); if several, the latest `from` wins.
2. Otherwise the newest release in the last 14 days.
3. Otherwise a weekly rotation (UTC week number modulo the pool) through
   stable products that have media, sorted by slug.

The build renders its own pick as the no-JavaScript default; the script swaps
it only if the result differs.

## Schemas

The site publishes JSON Schemas at stable, versioned URLs, for example
`https://wyrd.foo/schemas/docs/v1.json`.

- Generated at build time from the site's Zod schema (`z.toJSONSchema`, Zod 4)
  via a static Astro endpoint, so the published schema and the site's own
  content validation cannot drift.
- Each schema's `$id` is its URL. A published version never changes; additive
  changes go into the current version, breaking changes into a new one.
- Ingest validates against the version a repo declares, so a repo is never
  broken by a later site change.

## Permissions and setup

Publisher GitHub App:

| Scope                  | Permission                                   |
| ---------------------- | -------------------------------------------- |
| wyrd.foo               | Contents: read/write (push, receive dispatch) |
| Tool repos             | Contents: read; Commit statuses: read/write  |
| Organization           | Custom properties: read                      |

Org secrets `WYRD_TOOLS_DOCS_PUBLISHER_APP_ID` and
`WYRD_TOOLS_DOCS_PUBLISHER_PRIVATE_KEY` remain, made available to tool repos
so `request-publish` can mint its dispatch token.

## Migration

1. Ship the schema endpoint and the ingest workflow alongside the existing
   `publish-docs` action.
2. Set `wyrd-foo-publish: true` on the current tool repos.
3. Switch each tool repo from `publish-docs` to `request-publish`; existing
   `docs.yml` files are valid once `language` is dropped and `kind` added.
4. Run a full resync, then retire the `publish-docs` action.

## Open questions

- **Stronger caller identity.** Optionally include the caller's GitHub OIDC
  token in the dispatch and verify its signed `repository` and `ref` claims,
  instead of relying on the property check alone.
- **Products without docs pages.** Today a repo with no `docs: true` page is a
  no-op. Apps or images may want a product page before they have docs.
