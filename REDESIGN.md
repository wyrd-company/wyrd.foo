# Redesign: the wyrd.foo v2 site

This document is the design of the wyrd.foo v2 site: theme, home page, product
page, docs and search. The mockups are on the canvas
<https://claude.ai/artifact/5PBQBYLMokPDzwV6nm8hsH> (page "Combined · Wyrd").
The data contract and the publisher are in
[`PUBLISHING-PROPOSAL.md`](PUBLISHING-PROPOSAL.md). The delivery plan is in
[`PLAN.md`](PLAN.md).

## Purpose

- The site has a look of its own, and the front page holds a catalog of a few
  dozen products without running out of room.
- The catalog holds five kinds of product: CLIs, MCP servers, apps (things you
  run), dev container features and dev container images.
- A product with a large docs site gets sections, groups and a page order.

## Products and kinds

A product is one entry in a repo's `docs/user/docs.yml`, under its product
key. The key names the product everywhere: `content/<key>/`, `/tools/<key>`
and the `product:` field of each of its docs pages.

A product has one or more kinds, in a `kinds` array. Each kind is one of
`cli`, `mcp-server`, `app`, `devcontainer-feature` and
`devcontainer-image`. `app` means a thing you run (for example trowel,
wyrwood, xolotl). The first kind is the primary kind: it gives the kind badge
and the "get it" command wherever a product shows as one row or card. The
product page and the facts list show all kinds.

A **feature entry** is the short `docs.yml` entry for one dev container
feature that keeps its own `README.md` and `devcontainer-feature.json` in the
repo (for example each feature in the devcontainers repo). Its kinds are
`[devcontainer-feature]`. A full product, such as trowel, can also have a
`devcontainer-feature` kind; it is not a feature entry.

## Theme

- **Dark by default**, with a light/dark toggle in the header. An inline
  script in the head sets the theme before the first paint, so the page never
  shows the wrong theme first.
- **One accent: blue.**
- **Type:** Geist (text and headings) and Geist Mono (code, product names),
  self-hosted.
- **Header:** the page background with a 1px blue line along the bottom, in
  both modes. Left: a square "W" tile and the `wyrd/tools` wordmark in blue.
  Then nav (Catalog, Docs, Releases), search, theme toggle, GitHub. On a
  product page and its docs pages, Releases goes to the product page's
  Releases section (`/tools/<key>#releases`); on every other page it goes to
  the home page's Recent releases list (`/#releases`).
- **Code blocks** are dark in both modes.
- Every text colour meets a 4.5:1 contrast ratio on its background.

| Token | Dark | Light |
| --- | --- | --- |
| Page | `#0b0b0c` | `#fafafa` |
| Surface | `#131316` | `#ffffff` |
| Surface 2 | `#1b1b1f` | `#f1f1f3` |
| Text | `#ededef` | `#111113` |
| Secondary text | `#a6a6af` | `#4a4a52` |
| Faint text | `#8e8e97` | `#5f5f68` |
| Divider | `#24242a` | `#e3e3e7` |
| Header line | `#3b6fc4` | `#0b4fa8` |
| Accent text / links | `#6aa5ff` | `#0b4fa8` |
| Button fill | `#2563eb` (white text) | `#0b4fa8` (white text) |
| Accent tint | `rgba(106,165,255,0.13)` | `#e6effa` |
| Code background | `#0f0f12` | `#16161a` |

The tokens are CSS variables with a dark and a light value. One shared layout
holds the head, the header and the theme toggle for every page.

## Product marks

Every product shows a square mark in catalog rows, the featured card, Recent
releases entries, the product page hero and the product switcher in the docs
header.

- **Logo.** A product's optional `logo` is a square SVG. An optional
  `logo-dark` is the mark for the dark theme, for a mark that does not read
  on both themes. Both are SVG only, so they stay sharp at every size and can
  use `currentColor`.
- **Monogram.** A product with no logo shows a monogram tile: the first
  letter of its name, in the style of the site's "W" tile. Rows and cards
  then stay aligned. One shared component draws the logo or the monogram.

## Favicon and social image

The product page and every docs page of a product use that product's
favicon (`link rel="icon"`) and social image (`og:image`, `twitter:image`).
The shared head writes these tags for each page.

- `favicon` is an SVG or PNG asset in the tool repo. When a product has no
  favicon, the page uses its logo; when it has no logo, the page uses its
  monogram.
- `social-image` is a PNG or JPEG asset in the tool repo, 1200×630. When a
  product has no social image, the page uses the site's image.
- wyrd.foo generates neither. The home page and the catalog use the site's
  own favicon and image.

## Home page

1. **Headline** ("Small, sharp tools for the people *and agents* who ship.";
   "and agents" in accent text) and the one-line deck.
2. **Featured card** beside a **Recent releases** list.
   - Featured: mark, name, kind, status, tagline, one "Get started" button,
     and the product's media. Clicking anywhere else on the card opens the
     product page. The browser picks the featured product; see "Release and
     featured data" in the publishing design. The build writes its own pick
     into the HTML as the default, so the page has a featured product
     without JavaScript.
   - Recent releases (`#releases`): each entry is the mark and the name on
     one line (long names wrap) with "kind · version · date" underneath.
     Feature entries are not listed.
3. **Catalog** with kind tabs (All, CLIs, MCP servers, Apps, Dev container
   features, Dev container images) and a filter box. A product shows under
   the tab of each of its kinds, and once under All. Each feature entry is
   its own row, in All too. One row per product: mark, name and
   primary kind badge, tagline and category, the primary kind's "get it"
   command with Copy, and one Docs button when the product has docs pages.
   Clicking anywhere else on the row opens the product page. Rows hold no
   media. Products with an `order` come first, lower first; the others
   follow, by `name`.

## Product page (`/tools/<key>`)

In this order:

1. **Hero**: mark, name, tagline, description, the default install command
   of the primary kind with Copy, then "Read the docs", "Star on GitHub" and
   an "Other install methods ↓" link. A short facts list on the right: all
   kinds, status, latest version and date, category, repository.
2. **Media**: the first media item on its own full-width row, with its
   caption; the other items follow as a numbered tour. An MP4 or WebM file
   shows as a muted, looping video with a Pause/Play button over its
   bottom-left corner; any other file, GIFs included, shows as an image. The
   video plays on load, but not when the visitor's `prefers-reduced-motion` is
   `reduce`: then it waits for the button. Without script the video does not play and keeps its
   native controls.
3. **What it does**: up to six `highlights`.
4. **Install**: full width. One tab group for each kind, in `kinds` order
   (for example "Install" for an app and "Dev container" for a feature). The
   block for each kind is in "Install blocks by kind" below.
5. **Documentation**: a map of the docs sections and their pages.
6. **Releases** (`#releases`): the product's changelog, from its release
   unit.

Every product page has highlights and media, except the pages of feature
entries. Docs pages are optional. A product with no docs pages
has no "Read the docs" button, no Docs button in its catalog row and no
Documentation section.

### Install blocks by kind

- **CLI and app**: platform tabs (macOS, Linux, Windows, Docker) generated
  from `install[].os`, method pills for each platform, and one code block
  (single or multi-line) with one Copy button for each method. For
  `method: apt` and `method: rpm` the site writes the repo.wyrd.foo setup
  lines above the product's install line. An app's media tour is the
  screenshot tour of its console.
- **MCP server**: one tab for each `install` entry, in install order, in place
  of install methods. An MCP client entry (Claude Code, Claude Desktop,
  Cursor, VS Code, JSON) gets its client's name. A plugin marketplace entry
  (`method: plugin`) gets its label and is tagged "Plugin". Below the tabs, a
  table of the tools the server exposes with their side effects. The media is
  an animated GIF of an agent session.
- **Dev container feature**: a `devcontainer.json` snippet that adds the
  feature.
- **Dev container image**: the image reference and a `devcontainer.json`
  snippet, then a tags table of the image's registry tags.

### Feature entry page

A feature entry has an abbreviated page at `/tools/<key>`: the hero, the
`devcontainer.json` snippet, the feature's `README.md` as it is, then the
Releases section (`#releases`), from the annotated tag and the unit's
changelog. The
name, description, version and options come from the feature's
`devcontainer-feature.json`. The README holds the feature's options table, so
the page has no generated options table and no docs tree. A feature entry is
never the featured product.

The README and the changelog keep their text. Their headings nest under the
section's heading: the hero name is the page's only `<h1>`, the top level of
each document becomes an `<h3>`, each deeper level moves down by the same
amount, and nothing goes past `<h6>`. Each embedded heading id is prefixed
with `readme--` or `changelog--`, and a link in the document to one of its
headings follows, so a heading named "Releases" cannot take `#releases` from
the section. Docs pages render as they do from their Markdown.

## Docs (`/docs/<key>/<slug>`)

`/docs/` lists every product that has docs. `/docs/<key>/` goes to the
product's first page in reading order.

- **Sticky header** in two rows: wordmark, product switcher (with each
  product's mark), search scoped to the product, a "Releases" link to the
  product page's Releases section (`/tools/<key>#releases`), GitHub; then
  section tabs (for example Get started, Authoring, Using templates).
  Products without sections get no tab row. A section tab opens the
  section's first page.
- **Left sidebar** for the current section only, with group headings and
  reading-progress dots (done, current, ahead). It scrolls on its own.
- **Content**: breadcrumb, title, lead paragraph, prose up to ~720px wide. Tip
  callouts use the accent tint. No product card above the content.
- **"On this page"** on the right: sticky, scrolls on its own, nested
  headings. It highlights the last heading that has scrolled past the top of
  the viewport, so the highlight holds still while you read. At the end of
  the page, where the last headings cannot reach the top, it highlights the
  last heading in view. Links: back to
  top, copy page as Markdown (the title as a heading, then the page body,
  also served at `/docs/<key>/<slug>.md`), edit on GitHub (the page's file
  on the repo's default branch, under the product's `docs-path`).
- **Version footer**: "Docs 0.2.3 · for trowel 0.2.0", from the product's
  `docs-version` and `version`. "Docs 0.2.3" links the docs unit changelog
  at `/docs/<key>/changelog` when the product publishes one. The page slug
  `changelog` is reserved for it, in any letter case. The slug `index` is
  reserved too, in any letter case, because `/docs/<key>` is the product's
  docs landing redirect and a page at `/docs/<key>/index` would serve that
  redirect again.
- Sections, groups and page order come from the product's `nav` in
  `docs.yml`. Pages that `nav` does not list go into a trailing "More" group
  in the last section, by `order`, then title. A product with no `nav` has
  one section with no tab and its pages in that order, with no group
  heading.
- A page with `install: true` starts with the primary kind's default
  install command, with Copy and a link to every install method on the
  product page.

## Search

Search is Pagefind (`src/components/Search.astro`).

- The dialog uses the theme tokens.
- Docs pages and product pages are indexed with a `product` filter. Results
  from the product whose page you are on rank first; results from other
  products still show.
- A `kind` filter holds every kind of the page's product, and the dialog
  shows it as kind chips: one chip for each kind in the index. Chosen chips
  keep only results of those kinds; with none chosen, every result shows.
- A page is indexed through `src/components/SearchIndexMeta.astro` inside
  its `data-pagefind-body`, which writes the `product` and `kind` filters
  and the product name shown beside each result.
