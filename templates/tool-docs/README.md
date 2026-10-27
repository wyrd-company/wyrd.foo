# tool-docs

A [Toha](https://wyrd.foo/docs/toha/overview) template that onboards a tool
repo to wyrd.foo publishing. It targets Toha 0.4.0. The contract it writes to
is [`docs/technical-designs/publishing.yml`](../../docs/technical-designs/publishing.yml).

Apply it once. It creates:

- `docs/user/docs.yml` with one product;
- `docs/user/overview.md`, a starter page with `product:`;
- `docs/user/assets/media.svg`, a placeholder for the product's media;
- `.github/workflows/publish-docs.yml`, which calls the reusable workflow
  `wyrd-company/wyrd.foo/.github/workflows/publish-docs.yml@v2`. It runs
  after the release workflow succeeds for a pushed release tag, on a push of a
  `<key>-docs@*` tag, and on a manual run. A plain push to `main` does not
  publish.

When you answer yes to the Intentional question, it also adds two managed
regions to `.intentional/config.yml`: the code unit's yaml projection of
`/products/<key>/version`, and the `<key>-docs` unit (path `docs/user`,
`depends-on` the code unit, projection `/products/<key>/docs-version`, tag
`{id}@{version}`). These need Intentional 0.2.1 or later. When you name a
Taskfile, it adds a `docs:validate` task that runs the publisher's `validate`
on the repo.

## Apply

Use the Git address, so that the repo can take later template changes with
`--update`. Toha refuses `--update` on a folder path, because a folder has no
revision.

```sh
toha apply gh:wyrd-company/wyrd.foo@main#templates/tool-docs .
```

Toha asks for the product key, names, version and install command. For a
scripted run, pass `--answers answers.json`, with `template` set to the formal
name `gh:wyrd-company/wyrd.foo@main#templates/tool-docs`. The question ids are
in [`template.yml`](template.yml).

The template only creates files that are new to the repo. If one of the files
above exists, Toha writes nothing and names the file.

The `.intentional/config.yml` regions need the layout that `intentional init`
writes:

- The `release-units:` line has no indentation, and each unit key has two
  spaces.
- When the code unit has a projections list, its `projections:` line
  (indented four spaces) is the only one in the file, and its items start with
  a dash at the same indentation. When it has no list, answer no to the
  projections question; the region then adds the list after the code unit's
  key line.

A repo with more than one unit that lists projections needs the version
projection added by hand.

Then:

1. Replace the media placeholder, the highlights and the starter page.
2. Commit the files and `.toha.json`.
3. Run `intentional tag --baseline --version <key>-docs=0.1.0`. Until that tag
   exists, `intentional check` reports `missing-baseline` for the docs unit.
4. Add a `patch` intent for `<key>-docs` with the first docs change.
5. If the Taskfile has a v1 `docs:check` that mirrors the v1 publish gate,
   replace that block with `task: docs:validate`. Toha cannot remove a block
   it did not write.
6. Make the release workflow build the pushed tag by name. See
   [Release workflow](#release-workflow).

## Release workflow

When the code unit and the docs unit release together, `intentional tag` puts
the code tag and `<key>-docs@<version>` on the same commit. A step that finds
the tag from the commit can then pick the docs tag: GoReleaser without
`GORELEASER_CURRENT_TAG`, or `git describe --tags --exact-match`. That release
makes no GitHub Release, and the docs publish of the code tag fails.

The release workflow builds the tag that started it, by name:

```yaml
env:
  RELEASE_TAG: ${{ inputs.tag || github.ref_name }}
```

- Check out `refs/tags/${{ env.RELEASE_TAG }}`.
- Set `GORELEASER_CURRENT_TAG: ${{ env.RELEASE_TAG }}` for GoReleaser.
- Pass `$RELEASE_TAG` to each script that needs the version.
- Keep its tag filter to release tags, so that a docs tag does not start it.

The answer to "Name of the workflow that creates the GitHub Release" is that
workflow's `name:`, written exactly. The caller's `workflow_run` trigger
matches it; a different name means that a release does not publish the docs.

The reference is
[wyrd-company/gitpr#16](https://github.com/wyrd-company/gitpr/pull/16).

The caller uses the `v2` tag, which wyrd.foo moves to each `2.y.z` release, so
the repo takes contract fixes without an edit. zizmor's default policy reports
that reference as `unpinned-uses`; a repo that runs zizmor configures or
ignores that finding.

`task docs:validate` needs a wyrd.foo checkout with its dependencies
installed. `WYRD_FOO_DIR` names it (default `../wyrd.foo`). Arguments after
`--` go to the publisher, for example `task docs:validate -- --offline`.

## First publish

When the code tag and the docs tag are pushed together, the docs tag run
starts at once and waits, at most 10 minutes, for the code tag's GitHub
Release. The release workflow's run then publishes the same commit again,
which changes nothing.

Check the feature guard by hand on the repo's first run:

1. Run the workflow by dispatch with `feature` false, for example
   `gh workflow run publish-docs.yml -f ref=<tag>`. The step "Refuse feature
   outside a manual run" is skipped.
2. On a throwaway commit, set `feature: true` in the caller's `with:`, push a
   `<key>-docs@0.0.0-guard` tag at that commit, and confirm that the run fails
   at "Refuse feature outside a manual run". Delete the tag afterwards.

## Update

Commit or discard local changes first. Then:

```sh
toha apply gh:wyrd-company/wyrd.foo@main#templates/tool-docs . --update
```

Toha merges the template's changes with your edits. An edit that overlaps a
template change is a conflict, with markers in the file. Resolve it, then
commit the files and `.toha.json`.

Keep your edits outside the managed regions (the lines between the
`toha:region` markers). Toha refuses an update over an edit inside a region
and names the file and region, before it writes anything. To replace your edit
with the template's body, run the same command with `--force`.

## Test

`task test:template` applies the template to scratch repos and checks the
result with the publisher's `validate` and local mode, with
`intentional check`, and with an update from a Git address. It needs Toha 0.4.0
(`TOHA` names the binary, default `toha`) and Intentional 0.2.1 (`INTENTIONAL`
names the binary, default `npm exec` of 0.2.1 from npmjs).
