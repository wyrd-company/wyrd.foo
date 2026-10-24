# Plan: wyrd.foo v2

This plan ties the v2 design to the work that builds it. The design is in:

- [`REDESIGN.md`](REDESIGN.md): theme, product marks, home page, product
  page, docs, search.
- [`PUBLISHING-PROPOSAL.md`](PUBLISHING-PROPOSAL.md): the `docs/user/`
  contract, publishing requirements, the publisher core, local mode and
  schemas.
- [`PUBLISHING.md`](PUBLISHING.md): `publish-docs@v1`, which the live site
  uses until the cutover.

## Goal

wyrd.foo v2 runs on a dev server, built from each tool repo's `wyrd-foo-v2`
branch. This effort ends at user acceptance of the dev server.

Live wyrd.foo, every tool repo's default branch and every publish trigger
stay as they are during this effort. v2 does not merge to wyrd.foo `main`,
and nothing is published to a public platform.

## Shape of the work

- All v2 work is on one wyrd.foo branch, built from the branch that holds
  Pagefind search and these design documents.
- wyrd.foo is before 0.1.0. The site has one schema, with no transitional
  schema; the content migration script is the only migration.
- The site's Zod schema is the single source of truth for `docs.yml` and
  page front matter. The site and the publisher import it, and
  `/schemas/docs/v1.json` is generated from it.
- Publishing is push: `publish-docs@v2`, a TypeScript action, called through
  a reusable workflow. One publisher core runs in local mode (dev server) and
  inside the action.
- Each in-scope tool repo gets a `wyrd-foo-v2` branch with its public docs in
  `docs/user/` in the v2 format. The default branch is not changed.

## Repos and products

| Repo | Product keys | Kinds | Gap against the publishing requirements |
| --- | --- | --- | --- |
| gitpr | gitpr | cli | — |
| intentional | intentional | cli | — |
| toha | toha | cli | Trigger is a push to `main` |
| trowel | trowel | app, devcontainer-feature | — |
| xolotl | xolotl | app | — |
| wyrwood | wyrwood | app | — |
| t3code-client | t3c, t3code-mcp | cli; mcp-server | — |
| beholder | beholder | cli | No GitHub Release for 0.1.0 |
| seek-cli | seek | cli | No intentional |
| tagver | tagver | cli | No intentional |
| agent-svgtools | agent-svgtools | cli | No intentional |
| devcontainer-builder | dcb | cli | intentional on work branches only |
| devcontainers | 17 feature entries, base | devcontainer-feature; devcontainer-image | No intentional, no GitHub Releases |

Every repo needs intentional 0.1.7 or later, the code version projection and
a `<key>-docs` unit for each product that is not a feature entry.
async-codex-mcp, async-claude-agentsdk-mcp and lore adopt intentional before
they get a wyrd.foo page.

## Slices

| # | Slice | Contents |
| --- | --- | --- |
| 0 | v2 dev server | A wyrd.foo task that, for each tool repo, reads its `wyrd-foo-v2` branch from the local clone, runs the publisher core in local mode into a dev content folder (no commit, no push), and serves the v2 site. Release data comes from local tags when no GitHub Release is reachable. Unmet requirements are warnings. |
| 1 | Schema and endpoint | Zod schema for `docs.yml`: `schemaVersion` (`1` only, any other value rejected), products map, `kinds` (one block per kind), `install[]` with `method`, `os`, `default`, `label`; `highlights` up to six; `nav`; `media`; `version`, `docs-version`, `release-unit`; `order`; `logo`, `logo-dark`, `favicon`, `social-image`; feature entries; the closed category list; publisher-owned `owner`, `release`, `featured`; `relationships` allowed; no `language`. Page schema: `product` required, no `docs` flag. The cross-checks in the publishing design. `/schemas/docs/v1.json` through `z.toJSONSchema`. All in `src/schema/`, a module the publisher imports. |
| 2 | Theme and shell | Tokens as CSS variables with dark and light values, Geist self-hosted, per-product favicon and `og:`/`twitter:` meta in the shared head, a theme toggle with no flash, a shared header and layout. The blueprint CSS goes. |
| 3 | Home | Headline, featured card with the browser picker, the shared logo-or-monogram component, Recent releases, catalog with kind tabs (a product under each of its kinds), filter and Copy. |
| 4 | Product page | `/tools/[key]`: hero with mark and facts, media, highlights, docs map. One install block for each kind: CLI and app (OS tabs and methods, with the site's APT/RPM setup), MCP (client tabs and tools table), feature (`devcontainer.json`), image (reference and tags table). App: screenshot tour. The abbreviated feature entry page. |
| 5 | Docs | Sticky two-row header (product switcher with marks), sidebar for the current section with progress dots, "On this page" that tracks the last heading above the top of the viewport, Copy as Markdown, Edit on GitHub, version footer. Restyled Pagefind, product pages indexed, `kind` filter. |
| 6 | `publish-docs@v2` | TypeScript action and reusable workflow around the publisher core. Pages from `docs/user/**`; release data and changelog from the intentional unit and the GitHub Release (feature entries: the annotated tag); generated data from workspace files; key ownership; `featured` carried forward; push with retry. |
| 7 | Content migration | A script that changes every `content/` folder to the v2 format, and a PR build check workflow on wyrd.foo. |
| 8 | Tool-repo branches | A `wyrd-foo-v2` branch in each existing repo and beholder: public pages and `docs.yml` moved to `docs/user/`, `docs.yml` in the v2 format, `product:` on every page, highlights, `nav` for toha and xolotl, categories from the closed list, logos, favicon and social image where the repo has them, the calling workflow for v2. t3code-client: one `docs.yml` with two products. One intent per repo where `.intentional/` exists. |
| 8b | Requirements | The code version projection and a `<key>-docs` unit in every repo; publish triggers on code and docs tags. intentional adopted in seek-cli, tagver and agent-svgtools, and finished in dcb. A GitHub Release for beholder 0.1.0. Repos without intentional set `version` and `docs-version` by hand on their `wyrd-foo-v2` branch. |
| 8c | Toha onboarding template | A Toha template in a subdirectory of the wyrd.foo repo that onboards a tool repo: `docs/user/docs.yml` with one product, a starter page, the calling workflow for v2, and the intentional docs unit where `.intentional/` exists. Toha update mode carries later contract changes into repos that use it. Repos consume it by Git address tracking wyrd.foo `main`, with no template version tags. It starts when an accepted Toha release exists. |
| 9 | devcontainers onboarding | intentional (one unit per feature, plus the base image's code unit with a json projection on `manifest.json` `/version`, and its docs unit) and GitHub Releases for the image. `docs/user/docs.yml` with 17 feature entries and a full entry for the base image. Highlights and media for the base image, with media captured by vhs or freeze. The v2 calling workflow in `cd.yml` and `images.yml`. |

Order and dependencies:

- Slice 0 is first: it is the goal of this effort.
- Slices 2–5 run in parallel after slice 1.
- Slice 8 and slice 9 do not wait for slice 8c.
- Bob reviews the highlights for every product, and the category list with
  them. That review is on the critical path.
- dcb joins when its docs branch merges.

## Cutover

The cutover is a separate effort after this one. It starts only when a
freeze of tool releases is viable. Tool releases are frozen for the whole
cutover.

1. **Freeze** tool releases.
2. **Merge** v2 to wyrd.foo `main`, deploy, and check every product page and
   docs tree.
3. **Move each tool repo** to v2 on its default branch: `docs/user/`, the
   calling workflow and the tag triggers (toha stops publishing on a push to
   `main`). toha, trowel, wyrwood and t3code-client's MCP call pin
   `publish-docs` by SHA, so each pin changes too. Republish each repo and
   check its pages.
4. **Retag** `publish-docs@v1` to fail with a message that names v2.
5. **Lift the freeze.**

## Open questions

- **Featuring a tag-push release.** A tag push carries no inputs, so a
  feature is requested by a manual run of the calling workflow.

## Risks

- intentional 0.2.0 plans a GitHub Release for every released unit. wyrd.foo
  docs units and devcontainers feature units must stay tag-only, so v2 keeps
  its own publishing until that is settled with intentional.
- An intentional.foo website may overlap the wyrd.foo pages for intentional.
  One of them is the canonical docs home.
- A docs release from `main` can describe features that are not released
  yet, while `version` names the last release. v2 cannot detect this.
- Full-width GIFs on every product page make pages heavy. A poster frame
  with MP4 or WebM is an option.
- The featured picker reads the browser clock. A wrong clock shows a
  different product; the build-time default is in the HTML.
- Install commands must not use a product key where the package name
  differs (seek-cli's formula is `seek-cli`, its key is `seek`).
