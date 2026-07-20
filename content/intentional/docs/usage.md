---
title: Usage
order: 3
---

A release is three moves: declare the intended change as an intent, project it
into your manifests, then tag when you are ready. intentional never publishes,
commits, or pushes — it only edits the working tree and, with `tag`, writes
lightweight Git tags.

Every command accepts `-C` / `--directory` to point at a workspace other than
the current directory, and every mutating command accepts `--dry-run` to print
its operations without touching the filesystem or Git.

## Bootstrap the workspace

`init` scans for supported manifests (`package.json`, package-bearing
`Cargo.toml`, `pubspec.yaml`, `pyproject.toml`, `*.csproj`, `go.mod`), writes a
package inventory to `.intentional/config.yml`, and creates
`.intentional/intents/`.

```bash
intentional init
```

## Declare an intent

`add` records the intended bump for one or more packages. Pass `--package` as
`id:major|minor|patch` (repeat it per package) and `--message` for the changelog
prose:

```bash
intentional add \
  --package sample-runtime:minor \
  --package sample-application:patch \
  --message "Add a user-visible capability."
```

Run with no flags to be prompted for the package, bump, and message instead.
Either way, `add` writes a memorable-slug Markdown file under
`.intentional/intents/`, for example:

```markdown
---
sample-runtime: minor
---

Add a user-visible capability.
```

## Inspect pending state

```bash
intentional status
intentional check
```

`status` lists pending intents, the tag-derived current version, the computed
next version, and any manifest drift. `check` validates the config and intent
package references and confirms that plan generation is deterministic — useful
in CI.

## Preview the plan

`plan` writes canonical, digest-bound release-plan JSON to standard output
without changing anything:

```bash
intentional plan > release-plan.json
```

## Project the versions

`apply` writes release versions into committed projections, rewrites internal
dependency ranges, updates each package's `CHANGELOG.md`, and deletes the
consumed intent files. It only edits the working tree:

```bash
intentional apply
```

The surrounding harness owns the commit:

```bash
git add -A
git commit -m "chore: apply release"
```

## Tag the release

`tag` creates the per-package lightweight tags (and a plain `X.Y.Z` tag when
`settings.global-tag` is enabled). It is the only command that writes to Git:

```bash
intentional tag
```

## Stamp build versions

For `injected` projections, `stamp` writes the computed version without touching
changelogs or intents. Add `--prerelease` to compose the next version with the
first-parent commit height since the latest matching tag (for example
`1.3.0-alpha.5`):

```bash
intentional stamp
intentional stamp --prerelease alpha
```

## Channel releases

`plan`, `apply`, and `tag` accept `--channel` to cut a prerelease line whose
state is derived from existing tags:

```bash
intentional plan --channel beta > release-plan.json
intentional apply --channel beta
git add -A
git commit -m "chore: apply beta release"
intentional tag --channel beta
```

A channel `apply` retains intents; a later channel-less `apply` consolidates the
prerelease changelog sections into the final release.
