# Plan: the wyrd.foo update

Status: **planning.** This ties together what was decided across the design
and publishing discussions, what is still open, and how the update ships.
Details live in:

- [`REDESIGN.md`](REDESIGN.md): theme, home page, product page, docs, search.
- [`PUBLISHING-PROPOSAL.md`](PUBLISHING-PROPOSAL.md): the `docs.yml` fields,
  release and featured data, and schemas. Its pull-based mechanism is
  reconsidered below.
- [`PUBLISHING.md`](PUBLISHING.md): the current push-based flow, authoritative
  until the cutover.

## Scope

One coordinated update made of four parts:

1. **Redesign** as recorded in `REDESIGN.md`.
2. **Site schema** with the new `docs.yml` fields (`kind`, `install[].os`,
   `highlights`, `nav`, `media`, `schemaVersion`; `language` dropped) and the
   ingest-owned `release` and `featured` data.
3. **Publishing** that validates against that schema before content reaches
   `main` (mechanism still open; see below).
4. **Migration** of every published tool to the new contract.

## Decided

- **Ship as one cutover.** The redesign branch does not merge until all four
  parts are ready. The new schema rejects today's `tool.yaml`, so once it is on
  `main`, the existing `content/` folders and any release still using
  `publish-docs@v1` would break the site build.
- **No transitional schema.** The site will not accept both formats; tool
  repos move to the new contract during the cutover.
- **Search** is Pagefind (done on the branch). Restyling and the `kind`
  filter come with the redesign.
- **Schemas** are published at versioned URLs
  (`https://wyrd.foo/schemas/docs/v1.json`), generated from the site's Zod
  schema so the two cannot drift.
- **Release and featured data** as in the proposal: written into `tool.yaml`
  by the publishing step, never by `docs.yml`; the front page picks its
  featured product in the browser.

## Open: the publishing mechanism

The proposal's goals, against the push model that works today:

| Goal | Push model today |
| --- | --- |
| Add a tool without changing wyrd.foo | Met: the site self-registers each `content/<slug>/`. |
| Record release information | Possible: the action runs inside the release. |
| Support more kinds | Independent: a schema change either way. |
| Schema and validation owned by wyrd.foo | Not met: `publish-docs` checks only page front matter, so an invalid `tool.yaml` is caught at site build, after it is on `main`. |

Options:

**A. Push, `publish-docs@v2`.** The action fetches the published schema for
the repo's `schemaVersion`, validates `docs.yml` and the manifest, and refuses
to push on failure. It writes `release` and `featured` from the release
context and action inputs.

- Smallest change from today; meets the schema goal.
- Tool repos keep the publisher App key, which has Contents: write on
  wyrd.foo, and the rebase-retry loop stays.

**B. Pull, triggered by `workflow_dispatch`.** The tool repo calls
`POST /repos/wyrd-company/wyrd.foo/actions/workflows/ingest.yml/dispatches`
with a credential scoped to **Actions: write** on wyrd.foo only. The ingest
workflow holds the push key, validates, and commits; runs are serialized.

- Tool repos can no longer push to wyrd.foo; no retry loop.
- The trigger credential can still start, cancel, or re-run any workflow in
  wyrd.foo, not only ingest.
- `repo` and `ref` inputs are caller-supplied; see OIDC below.

**C. Pull, triggered by polling.** A scheduled workflow in wyrd.foo finds
opted-in repos (org custom property `wyrd-foo-publish`) and ingests new
releases.

- No credentials in tool repos; `repo` and `ref` come from GitHub, so OIDC is
  unnecessary.
- Up to one cron interval of delay; `feature` requests move into the release
  (for example `wyrd-manifest.json`); docs-only fixes between releases need a
  manual run.

`repository_dispatch`, as the proposal has it, needs Contents: write, the
same exposure as push, so it offers nothing over A.

Leaning: **A for this update**, with B or C as a later, separate change if the
key exposure or retry loop starts to matter. Not yet agreed.

## Other open questions

- **Caller identity (B only).** Verify a GitHub OIDC token in the dispatch
  (`aud: wyrd.foo`; trust its `repository`, `ref`, `job_workflow_ref` claims)
  instead of the caller-supplied inputs.
- **Products without docs pages.** Whether apps or images get a product page
  before they have any `docs: true` page.
- **Release freeze or guard** during the cutover (see step 3 below).

## Cutover

Tool repos to migrate (from `content/` on `main`): agent-svgtools, gitpr,
intentional, seek-cli, t3code-client, tagver, toha, trowel, wyrwood, xolotl.

1. **Build on the branch:** schema and schema endpoint, redesign, the chosen
   publishing mechanism, and every `content/<slug>/` migrated to the new
   format in the same change.
2. **Prepare, don't merge,** one PR per tool repo: new `docs.yml` fields and
   the new publishing workflow. toha and wyrwood pin `publish-docs` by SHA.
3. **Stop old-format publishes:** freeze tool releases for the window, or make
   v1 publishing refuse once the new schema is live.
4. **Merge wyrd.foo,** deploy, and check every product page and docs tree.
5. **Merge the tool-repo PRs** and republish each one; check its pages.
6. **Lift the freeze** and retire whatever the chosen mechanism replaces.
