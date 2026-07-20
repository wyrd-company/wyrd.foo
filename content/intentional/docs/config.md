---
title: Configuration
order: 4
---

intentional keeps all of its state in one directory, `.intentional/`, at the
workspace root:

| Path | Purpose |
| --- | --- |
| `.intentional/config.yml` | Package inventory and release settings. |
| `.intentional/intents/` | Pending change-intent Markdown files. |

`intentional init` scans for supported manifests and writes both. There are no
environment variables and no other config file. The only global command-line
option is `-C` / `--directory`, which sets the workspace root (default `.`).

## Configuration file

`.intentional/config.yml` uses kebab-case keys and rejects unknown keys. Its
top-level shape is:

```yaml
$schema: https://intentional.foo/schemas/config.yml
settings:
  global-tag: false
  internal-dependency-bump: patch
packages:
  sample-runtime:
    path: packages/runtime
    projections:
      - adapter: npm
        file: package.json
        mode: committed
      - adapter: pub
        file: pubspec.yaml
        mode: committed
    tag: "{id}@{version}"
  sample-application:
    path: packages/application
    projections:
      - adapter: npm
        file: package.json
        mode: committed
    depends-on: [sample-runtime]
```

### Top-level keys

| Key | Required | Default | Meaning |
| --- | --- | --- | --- |
| `$schema` | No | — | Schema URL for editor validation. |
| `settings` | No | see below | Workspace-wide release behavior. |
| `packages` | Yes | — | Logical package inventory; at least one entry. |

### `settings`

| Key | Type | Default | Meaning |
| --- | --- | --- | --- |
| `global-tag` | boolean | `false` | Also create a plain `X.Y.Z` tag for the release. |
| `internal-dependency-bump` | `major` \| `minor` \| `patch` | `patch` | Minimum bump propagated to internal dependents. Cannot be `none`. |

### `packages`

`packages` is a map keyed by a stable package id. Ids may contain ASCII
letters, digits, and the characters `-`, `_`, `.`, `@`, and `/`.

| Key | Required | Default | Meaning |
| --- | --- | --- | --- |
| `path` | Yes | — | Package directory relative to the workspace root. Must be relative and contain no `..`. |
| `projections` | Yes | — | Version projections; at least one. |
| `tag` | No | `{id}@{version}` | Tag template for this package. |
| `depends-on` | No | `[]` | Ids of internal packages this one depends on. |

### `projections`

Each projection maps one file to one version location.

| Key | Required | Default | Meaning |
| --- | --- | --- | --- |
| `adapter` | Yes | — | Ecosystem or generic format adapter (see below). |
| `file` | Yes | — | File relative to the package `path`. |
| `mode` | Yes | — | How the version is materialized. |
| `pointer` | Only for `json` / `toml` / `yaml` | — | JSON Pointer or dotted key path to the version field. |

Adapters:

- Ecosystem-aware: `npm`, `cargo`, `pub`, `python`, `msbuild`, `go`. These know
  where the version lives and participate in internal dependency-range
  rewriting.
- Generic: `json`, `toml`, `yaml`. These target an arbitrary field and require
  a `pointer`, such as `/metadata/version`.

Projection `mode` values:

| Mode | Behavior |
| --- | --- |
| `committed` | `apply` writes the release version into the manifest. |
| `injected` | `stamp` writes the computed build version; `apply` leaves it alone. |
| `none` | No manifest version is written. Go modules use this mode, since their version is carried by tags. |

### Tag templates

The `tag` template controls the Git tag written for a package. It must contain
exactly one `{version}` placeholder and at most one `{id}` placeholder, and it
must not prefix the version with `v` (intentional tags never use a `v` prefix).
Resolved tag templates must be unique across packages, and must not collide with
the plain `{version}` tag when `global-tag` is enabled.

Common forms:

- `{id}@{version}` — the default, e.g. `sample-runtime@1.4.0`.
- `{version}` — a single-package repository tagged with a plain SemVer value.

## Intent files

Pending intents live in `.intentional/intents/` as Markdown files. Each file's
name stem is its intent id; `intentional add` generates a memorable slug such as
`swift-otter-1a2b.md`. A file has YAML frontmatter mapping package ids to bumps,
followed by the changelog prose:

```markdown
---
sample-runtime: minor
sample-application: patch
---

Add a user-visible capability.
```

Rules enforced when an intent is authored or read:

- The frontmatter must reference at least one package.
- Every referenced package id must exist in `config.yml`.
- Each bump must be `major`, `minor`, or `patch` (never `none`).
- The changelog message must not be empty.

Before `1.0.0`, `major` advances `0.x.y` to `0.(x+1).0`, while `minor` and
`patch` both advance it to `0.x.(y+1)`. Reaching `1.0.0` is a deliberate human
act — tag `1.0.0` explicitly — after which strict SemVer rules apply.

## Initializing configuration

`intentional init` scans the workspace (skipping `.git`, `.intentional`,
`node_modules`, and `target`) and maps discovered manifests to adapters:

| Manifest | Adapter | Default mode |
| --- | --- | --- |
| `package.json` | `npm` | `committed` |
| `Cargo.toml` (package-bearing) | `cargo` | `committed` |
| `pubspec.yaml` | `pub` | `committed` |
| `pyproject.toml` | `python` | `committed` |
| `*.csproj` | `msbuild` | `committed` |
| `go.mod` | `go` | `none` |

Each discovered package gets the default `{id}@{version}` tag template. Edit the
generated file to adjust ids, tag templates, projection modes, `pointer` values,
and `depends-on` edges before your first release.
