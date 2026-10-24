# Publishing: `publish-docs@v2`

This document is the design of how a tool repo publishes its products and
docs to wyrd.foo v2: the data contract in `docs/user/`, the publishing
requirements, the publisher and the content it writes. The site design is in
[`REDESIGN.md`](REDESIGN.md). [`PUBLISHING.md`](PUBLISHING.md) describes
`publish-docs@v1`, which the live site uses.

## Goals

- Stand up a new tool without changing wyrd.foo.
- Keep validation, the schema and the content layout in one place
  (wyrd.foo): the site and the publisher import the same Zod schema.
- Record release information for every product, so the site shows recent
  releases, a featured product and a changelog.
- Hold many products in one repo and many kinds in one product: CLIs, MCP
  servers, apps, dev container features and dev container images.

## Overview

The tool repo pushes. Its publishing workflow calls a reusable workflow in
wyrd.foo, which runs the `publish-docs@v2` action. The action runs the
publisher core inside the tool repo's workflow, validates, and commits the
result to wyrd.foo `main`.

```text
tool repo                                     wyrd.foo
─────────                                     ────────
push of a code tag or a docs tag,
or a manual run
  └─ calling workflow
       └─ reusable workflow (wyrd.foo) @v2
            └─ publish-docs@v2 (publisher core)
                 1. read docs/user/ and .intentional/config.yml at the ref
                 2. validate against the site schema
                 3. resolve release data for every product
                 4. check key ownership
                 5. write content/<key>/ for every product ──push──▶ main
                                                                     └─ deploy (cd.yml)
```

The publisher core is one TypeScript module. The action runs it in publish
mode; the dev server runs it in local mode (see "Local mode").

## Publishing requirements

A repo that publishes to wyrd.foo meets all of these:

- The repo uses intentional, at version 0.1.7 or later.
- Each product names one release unit in `release-unit:`. The default is the
  product key.
- Each release of a code unit has a GitHub Release on the unit's primary
  tag. Feature entries are the exception: see "Feature entries".
- Each product, except a feature entry, has a docs unit, `<key>-docs`. Docs
  units are tag-only: they have no GitHub Release, so the repo's Releases list shows
  only what users install.

## What a tool repo provides

### `docs/user/`

Public docs live in `docs/user/`: `docs/user/docs.yml` and
`docs/user/**/*.md`. Everything under `docs/user/` is published. Nothing
outside it is published, except the `README.md` of each feature entry, which
the publisher reads through the entry's `source:`. Other `docs/` folders are
private.

```text
docs/
├── user/
│   ├── docs.yml           # the repo's products
│   ├── getting-started.md # a page (front matter names its product)
│   ├── guides/
│   │   └── authoring.md   # pages may be at any depth
│   └── assets/
│       ├── demo.gif
│       └── logo.svg
└── design/                # private
```

A repo with several products may keep one folder per product under
`docs/user/` (t3code-client keeps one folder per package).

### `docs/user/docs.yml`

One file per repo. Top-level fields:

| Field | Required | Meaning |
| --- | --- | --- |
| `schemaVersion` | yes | The site schema version the file targets: `1`. |
| `assets` | no | Exact file paths, relative to `docs/user/`, that are published. |
| `products` | yes | A map keyed by product key. |
| `relationships` | no | Artifact metadata. The schema allows it; the publisher ignores it. |

`products` is a map, not an array, so that intentional's yaml projection can
write each product's version by key path (`/products/<key>/version`). The
map also makes keys unique within the repo. The product key is the folder
`content/<key>/`, the route `/tools/<key>` and the value of `product:` on
each of the product's pages.

```yaml
# yaml-language-server: $schema=https://wyrd.foo/schemas/docs/v1.json
schemaVersion: 1
assets:
  - assets/demo.gif
  - assets/logo.svg
products:
  trowel:
    name: trowel
    version: 0.2.0               # code unit `trowel`, written by intentional
    docs-version: 0.2.3          # docs unit `trowel-docs`, written by intentional
    release-unit: trowel         # default = key
    logo: assets/logo.svg
    tagline: Relay webhooks into NATS JetStream, and JetStream messages back out.
    blurb: >-
      A small Go service that verifies and transforms incoming webhooks …
    status: preview
    category: Agent Infrastructure
    order: 8
    highlights:
      - Verifies and transforms incoming webhooks before they reach JetStream.
    media:
      - src: assets/demo.gif
        caption: Relaying a webhook into JetStream.
    kinds:
      - kind: app                # first = primary
        install:
          - method: apt
            os: [linux]
            command: sudo apt install trowel
          - method: docker
            command: docker run --rm -it ghcr.io/wyrd-company/trowel
      - kind: devcontainer-feature
        ref: ghcr.io/wyrd-company/trowel/trowel:1
```

### Product fields

| Field | Required | Meaning |
| --- | --- | --- |
| `name` | yes | Display name. |
| `version` | yes | The installed version, from the product's code unit. Written by intentional. |
| `docs-version` | yes | The docs version, from the docs unit `<key>-docs`. Written by intentional. |
| `release-unit` | no | The product's code release unit. Default: the product key. |
| `tagline`, `blurb` | yes | One line, and the description in the hero. |
| `status` | yes | `stable`, `preview` or `planned`. |
| `category` | yes | One of the categories (see "Categories"). |
| `order` | no | Integer catalog position, lower first. Products without `order` sort after the products with it, by `name`. |
| `kinds` | yes | One or more kind blocks; the first is the primary kind. |
| `highlights` | yes | Up to six one-line statements for "What it does". |
| `media` | yes | Hero media; each `src` is listed in `assets`. |
| `nav` | no | Docs sections, groups and page order. |
| `logo`, `logo-dark` | no | Square SVG marks, listed in `assets`. |
| `favicon` | no | SVG or PNG, listed in `assets`. |
| `social-image` | no | PNG or JPEG, 1200×630, listed in `assets`. |

`owner`, `release` and `featured` are owned by the publisher; `docs.yml`
does not set them. `docs.yml` has no `repo` field: the site builds the
GitHub link from `owner`. Every other field is rejected.

### Kinds

`kinds` is an array of kind blocks. `kind` is one of `cli`, `mcp-server`,
`app`, `devcontainer-feature` and `devcontainer-image`. `app` means a thing
you run. Each kind block holds the data for that kind's install block on
the product page:

| Kind | Block |
| --- | --- |
| `cli`, `app` | `install`: the install methods (below). |
| `mcp-server` | `install`: the client methods (see "MCP install"). `tools`: the tools table, as `{ name, description, effect }` entries; `effect` is a short text such as "Read-only" or "Writes". |
| `devcontainer-feature` | `ref`: the feature's OCI reference. |
| `devcontainer-image` | `ref`: the image reference. `tags`: optional, the tags table as `{ tag, base, architectures }` entries, for an image whose tags the publisher cannot read from the image build config. |

A product lists each kind once.

The first kind is the primary kind: its badge and its "get it" command show
in the catalog row, and its default install command shows in the hero.

### `install`

Each install method is described once. The site builds the product page's
install block and the hero's default command from it.

```yaml
install:
  - method: homebrew
    os: [macos, linux]
    command: brew install wyrd-company/tools/toha
  - method: apt
    os: [linux]
    label: Debian, Ubuntu
    command: sudo apt install toha
  - method: cargo
    os: [macos, linux, windows]
    command: cargo install toha
  - method: docker
    command: docker run --rm -it ghcr.io/wyrd-company/toha
```

| Field     | Required | Meaning |
| --------- | -------- | ------- |
| `method`  | yes      | One of `homebrew`, `apt`, `rpm`, `aur`, `nix`, `cargo`, `npm`, `npx`, `pipx`, `go`, `winget`, `scoop`, `docker`, `archive`, `script`, `other`. The site owns each method's display name and icon. |
| `os`      | yes, except `docker` | Any of `macos`, `linux`, `windows`, each once. |
| `command` | yes      | One line, or several (YAML block scalar). Shown as one code block with one Copy button. |
| `label`   | yes for `other`, else no | Short qualifier, for example "Debian, Ubuntu" or "From Git". |
| `default` | no       | `true` on at most one entry: the command shown in the hero. Otherwise the first entry. |

- `npx` is a command that runs the tool without installing it.
- A method that installs from another place keeps its method and adds a `label`
  (`cargo` with `label: From Git`). `docker` covers `docker run` and
  `docker pull`.
- `other` is for an install with no method in the list; its `label` names
  it.

For `method: apt` and `method: rpm`, `command` is only the install line: one
command, with no line break, `;`, `|` or `&&`. The site owns the repository
setup (signing key and source list from repo.wyrd.foo) and shows it above
the install line, so the setup has one source.

The site derives the platform tabs from `os` (macOS, Linux, Windows, plus
Docker when a `docker` entry exists). A method listed for several systems
appears under each. A method may appear more than once with different `os`
values when the command differs per system.

### MCP install

The `install` list of an `mcp-server` kind has the same `label`, `default`
and `command` fields, and no `os`. Its `method` is an MCP client or a plugin
marketplace:

| Method | Tab |
| --- | --- |
| `claude-code`, `claude-desktop`, `cursor`, `vscode` | The client's own tab. `command` is its add command or configuration. |
| `json` | The generic JSON configuration. |
| `plugin` | A plugin marketplace. `label` names the marketplace and is required. |
| `other` | A client with no method in the list. `label` names it and is required. |

The site makes one client tab for each entry present.

```yaml
kinds:
  - kind: mcp-server
    install:
      - method: claude-code
        command: claude mcp add <name> -- <server command>
      - method: plugin
        label: Claude plugin marketplace
        command: /plugin install t3code-mcp
    tools:
      - { name: <tool>, description: <what it does>, effect: Read-only }
```

### Categories

`category` is one of a closed list. The list is in catalog order: the
catalog groups products by category in this order.

1. Git & Review
2. Release & Versioning
3. Templates & Scaffolding
4. Dev Containers
5. Agent Tooling
6. Agent Infrastructure
7. Code Intelligence
8. Knowledge & Planning

A feature entry without `category` is in Dev Containers.

### `nav`

```yaml
nav:
  - section: Authoring
    groups:
      - group: The interview
        pages: [template-interviews, template-flow, template-jinja]
```

`nav` belongs to one product and lists that product's page slugs; every
slug it lists is a page of that product. Published pages that `nav` does not
list go into a trailing "More" group.

### Feature entries

A dev container feature that keeps its own `README.md` and versioned
`devcontainer-feature.json` in the repo has a short entry:

```yaml
products:
  caddy:
    kinds: [{ kind: devcontainer-feature }]
    source: src/features/caddy      # devcontainer-feature.json + README.md
    category: Dev Containers        # optional; the default
    logo: assets/caddy.svg          # optional
  heddle:
    kinds: [{ kind: devcontainer-feature }]
    source: src/features/heddle
    release-unit: heddle-feature    # optional; default = key
```

- The entry holds only the key, `kinds` (one `devcontainer-feature` block),
  `source`, and an optional `category`, `logo` and `release-unit`. Each
  feature is listed by its own entry; `docs.yml` has no glob.
- `source` is the path of the feature's folder in the repo. It has no other
  meaning in `docs.yml`.
- The feature's release unit is `release-unit`, or the key.
- The publisher derives the feature's OCI reference as
  `ghcr.io/<owner>/<repo>/<feature id>:<major>`, from the repo, the `id` and
  the major version in `devcontainer-feature.json`. An optional `ref` in the
  kind block overrides it.
- Name, description, version and options come from
  `devcontainer-feature.json` at `source`.
- The page is the abbreviated feature page: the `devcontainer.json` snippet,
  then `README.md` as it is. The README is inside the feature's release unit
  (`src/features/<id>`), so a docs fix is a patch release of that feature.
  Feature entries have no docs unit and no docs pages.
- A feature entry needs no highlights and no media.
- A feature entry needs no GitHub Release. Its release data comes from the
  annotated intentional tag of its unit and the unit's changelog.
- A feature entry is not listed in Recent releases and is never featured.
- The publisher warns when the option names in `README.md` differ from the
  options in `devcontainer-feature.json`.

A dev container image has a full product entry, a docs unit and GitHub
Releases, like any other product.

### Pages

Pages are Markdown files at any depth under `docs/user/`. The folder is the
gate: every `.md` under it is published.

```markdown
---
title: Getting started # sidebar and heading label (required)
product: trowel        # product key in docs.yml (required)
order: 1               # page order where nav does not decide it
install: true          # optional: render the install block at the top
---

Markdown body.
```

- `product:` names the product the page belongs to. It is a key in
  `products`, and not a feature entry: feature entries have no docs pages.
- Front matter holds only `title`, `product`, `order`, `install` and the
  optional `relationships`.
- The slug is the file name without `.md`. It is unique within a product, so
  two products in one repo can each have `getting-started.md`.
- A page's URL is `/docs/<key>/<slug>`.

## Release units

intentional writes both versions into `docs.yml` as committed yaml
projections. The code unit is the product's release unit; it projects
`version`. The docs unit, `<key>-docs`, projects `docs-version`.

```yaml
# .intentional/config.yml
release-units:
  trowel:                          # code unit
    path: .
    projections:
      - adapter: yaml
        file: docs/user/docs.yml
        mode: committed
        pointer: /products/trowel/version
  trowel-docs:                     # docs unit
    path: docs/user
    depends-on: [ trowel ]
    projections:
      - adapter: yaml
        file: docs.yml
        mode: committed
        pointer: /products/trowel/docs-version
    tags:
      primary: { role: primary, template: "{id}@{version}" }
```

- `version` is the code unit's version: the version a user installs.
- `docs-version` is the docs unit's version. The docs unit is
  `<key>-docs`, at path `docs/user`, with `depends-on: [<code unit>]` and the
  tag `<key>-docs@{version}`. Projection file paths are relative to the unit
  path. A docs-only intent moves only `docs-version`, so docs release on
  their own, with their own intents, changelog and tags.
- The docs footer shows both: "Docs 0.2.3 · for trowel 0.2.0".

### devcontainers tags

intentional owns each dev container feature's release tag, `{id}@{version}`
(for example `caddy@1.0.1`), as an annotated tag. The lightweight tag that
`devcontainers/action` makes for the same release (`feature_caddy_1.0.1`) is
a side effect and is not read. An image's date build tags (for example
`20261018.123-noble`) are registry tags for the image's tags table, not
release versions.

## Generated data

Data produced at build time is a file in the tool repo's workspace when the
publisher runs, not a release asset:

| Kind | Data | File |
| --- | --- | --- |
| `devcontainer-feature` | Name, description, version, options | `devcontainer-feature.json` |
| `devcontainer-image` | Image version | `manifest.json` |
| `devcontainer-image` | Registry tags | The image build config, when the publisher can read it; otherwise the kind block's `tags` |

An MCP server's tools table is the `tools` list in its kind block.

## The calling workflow

A tool repo calls the reusable workflow in wyrd.foo, not the action. The
reusable workflow wraps the action, so the action's inputs and mechanism can
change without editing tool repos.

```yaml
name: Publish to wyrd.foo

on:
  push:
    tags:
      - "[0-9]*"            # code unit tags ({version})
      - "trowel-docs@*"     # docs unit tags
  workflow_dispatch:
    inputs:
      ref:
        description: Tag or commit to publish
        required: true
      feature:
        description: Feature this release on the front page
        type: boolean
        default: false
      feature-days:
        description: How long the feature lasts
        default: "14"
      feature-reason:
        description: For example "New MCP server"; default "New release"
        default: ""

jobs:
  publish:
    uses: wyrd-company/wyrd.foo/.github/workflows/publish-docs.yml@v2
    with:
      ref: ${{ inputs.ref || github.ref_name }}
      feature: ${{ inputs.feature || false }}
      feature-days: ${{ inputs.feature-days || '14' }}
      feature-reason: ${{ inputs.feature-reason || '' }}
    secrets: inherit
```

- The trigger is a push of a code tag or a docs tag, plus a manual run. The
  tag patterns follow the repo's tag templates in `.intentional/config.yml`.
- A plain push to `main` does not publish.

## The publisher

Every run computes all of the repo's products from the files at the ref, so
the result is the same for every trigger. The trigger only chooses the ref.

1. **Read** `docs/user/docs.yml`, the pages under `docs/user/`, each feature
   entry's `source` folder and `.intentional/config.yml` at the ref. From the
   intentional config the publisher reads only release-unit configuration
   (contract 1: each unit's primary tag template). It does not read
   intentional's generated workflows.
2. **Validate** `docs.yml` and every page against the site's Zod schema. A
   `schemaVersion` other than `1` fails validation. Then the publisher runs
   the checks the schema cannot express:
   - every page's `product:` is a key in `products`;
   - every slug is unique within its product;
   - every `nav` page exists for that product;
   - no page names a feature entry;
   - every `media.src`, `logo`, `logo-dark`, `favicon` and `social-image` is
     listed in `assets`, and every listed asset exists inside `docs/user/`;
   - `logo` and `logo-dark` are SVG; `favicon` is SVG or PNG;
     `social-image` is PNG or JPEG at 1200×630. The file extension and the
     file content must both match;
   - for each feature entry, `devcontainer-feature.json` and `README.md`
     exist at `source`.
3. **Resolve release data** for each product. The publisher takes `version`
   and `docs-version` from `docs.yml` at the ref, reads the code unit's
   primary tag template, and builds the tag from `version`.
   - For a product, the publisher fails if that tag has no GitHub Release.
     From the release it reads version, date, URL and notes.
   - For a feature entry, the publisher reads the version from
     `devcontainer-feature.json`, and the date and notes from the annotated
     tag.
   - For both, it reads the changelog from the unit.
4. **Check key ownership.** Each `content/<key>/tool.yaml` records its owner
   in `owner: <owner/repo>`. The publisher rejects a key that another repo
   owns.
5. **Write** `content/<key>/` for every product in the map (see "Content
   written to wyrd.foo"). It carries
   `featured` forward from the existing `tool.yaml` and applies the run's
   `feature` inputs. It deletes every `content/<key>/` folder that this repo
   owns and that is not in its map, so removing or renaming a product
   needs no hand edits.
6. **Push.** The publisher commits as the publisher App bot and pushes to
   wyrd.foo `main`, with fetch, rebase and retry when another publish has
   pushed first. The push starts `cd.yml`.

### Local mode

The dev server runs the same publisher core in local mode. For each tool
repo, local mode reads the repo's `wyrd-foo-v2` branch from its local clone.
It does not check out a branch in the clone's working tree, and it makes no
commit and no push. It writes into a dev content folder in the wyrd.foo
checkout, and the dev server serves the site from that folder.

- When no GitHub Release is reachable, release data comes from the local
  tags.
- A requirement that a repo does not meet yet (for example, no intentional)
  is a warning, not a failure. A repo without intentional sets `version` and
  `docs-version` by hand on its `wyrd-foo-v2` branch.

## Content written to wyrd.foo

`content/<key>/` holds `tool.yaml`, the product's pages as
`docs/<slug>.md`, the listed assets the product uses, the unit changelog,
and the generated data for the product's kinds. A feature entry's folder
holds its `README.md` as the page body.

`tool.yaml` holds the validated product entry, with `release-unit` filled
in, plus three fields that only the publisher writes:

```yaml
owner: wyrd-company/trowel
release:
  version: 0.2.0
  date: 2026-10-01
  url: https://github.com/wyrd-company/trowel/releases/tag/0.2.0
  notes: …
featured:
  from: 2026-10-01
  until: 2026-10-15
  reason: New MCP server
  version: 0.2.0
```

A feature entry's `tool.yaml` holds the entry with `release-unit` and the
kind block's `ref` filled in, `name`, `description` and `version` from
`devcontainer-feature.json`, `owner`, and `release` from the annotated tag
(no `url`). It has no `featured`.

The site reads `tool.yaml` and the pages with the same module's schemas.

## Release and featured data

The front page chooses its featured product in the browser, so a feature
expires on time without a rebuild:

1. An active feature (`from ≤ now < until`); if several, the latest `from`
   wins.
2. Otherwise the newest release in the last 14 days.
3. Otherwise a weekly rotation (UTC week number modulo the pool) through
   stable products that have media, sorted by key.

Feature entries are never in the pool. The build writes its own pick into
the HTML as the default; the script swaps it only when its result differs.

## Schemas

The site publishes its JSON Schema at
`https://wyrd.foo/schemas/docs/v1.json`.

- The Zod schemas in `src/schema/` are the single source of truth for
  `docs.yml`, page front matter and `tool.yaml`, and for the closed lists
  (kinds, categories, install methods). The module has no Astro imports and
  runs under plain Node; the site and the publisher import it.
- The module also holds the cross-check (`crossCheck`): the checks in step 2
  of "The publisher" that read the `docs/user/` tree. The publisher checks
  each feature entry's `source` folder itself.
- `/schemas/docs/v1.json` is generated from it at build time
  (`z.toJSONSchema`, Zod 4) by a static Astro endpoint, so the published
  schema and the site's own validation cannot drift. Page front matter is
  in the schema as `$defs.page`. The cross-checks are not in it.
- The schema's `$id` is its URL.
- The schema has one version, `1`. Every `docs.yml` declares
  `schemaVersion: 1`. The site and the publisher validate against that one
  schema and reject any other `schemaVersion`.

## Permissions and setup

| Holder | Credential | Scope |
| --- | --- | --- |
| Publisher GitHub App `WYRD_TOOLS_DOCS_PUBLISHER` | Installation on wyrd.foo | Contents: read/write |
| Tool repos | Org secrets `WYRD_TOOLS_DOCS_PUBLISHER_APP_ID`, `WYRD_TOOLS_DOCS_PUBLISHER_PRIVATE_KEY` | Mint the App token inside the reusable workflow |

The reusable workflow mints the App token scoped to wyrd.foo, so the tool
repo's own `GITHUB_TOKEN` needs no access to wyrd.foo. The App token push is
a real actor, so it starts `cd.yml`.
