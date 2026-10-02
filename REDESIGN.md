# Redesign: decisions to build from

Status: **designed, not implemented.** The site still uses the blueprint
theme. This records what was agreed so it can be built without the design
conversation. Mockups live on the canvas
<https://claude.ai/artifact/5PBQBYLMokPDzwV6nm8hsH> (page "Combined · Wyrd";
earlier explorations are on the other pages). Publishing and data changes
are in [`PUBLISHING-PROPOSAL.md`](PUBLISHING-PROPOSAL.md).

## Why

- The blueprint look is no longer distinctive, and the front page runs out of
  room as products are added.
- The catalog now covers more than CLIs: MCP servers, dev container features
  and images, and apps with a web console.
- Some products will have large docs sites that need more structure than a
  flat page list.

## Theme

- **Dark by default**, with a light/dark toggle in the header.
- **One accent: blue.** No second accent colour.
- **Type:** Geist (text and headings) and Geist Mono (code, product names).
- **Header:** the page background with a 1px blue line along the bottom, in
  both modes. Left: a square "W" tile and the `wyrd/tools` wordmark in blue.
  Then nav (Catalog, Docs, Releases), search, theme toggle, GitHub.
- **Code blocks** stay dark in both modes.
- Text colours must meet 4.5:1; the blueprint's faint grey `#62798f` did not.

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

## Home page

1. **Headline** ("Small, sharp tools for the people *and agents* who ship.";
   "and agents" in accent text) and the one-line deck.
2. **Featured card** beside a **Recent releases** list.
   - Featured: name, kind, status, tagline, one "Get started" button, and the
     product's GIF. Clicking anywhere else on the card opens the product page.
     Which product is featured is decided in the browser; see "Release and
     featured data" in the publishing proposal.
   - Recent releases: each entry is the name on its own line (long names wrap)
     with "kind · version · date" underneath.
3. **Catalog** with kind tabs (All, CLIs, MCP servers, Dev containers, Apps)
   and a filter box. One row per product: name and kind, tagline and
   category, the primary "get it" command with Copy, and one Docs button.
   Clicking anywhere else on the row opens the product page. No GIFs in rows;
   the language a tool is written in is not shown anywhere.

## Product page (`/tools/<slug>`)

In this order:

1. **Hero**: name, tagline, description, the default install command with
   Copy, then "Read the docs", "Star on GitHub" and an "Other install
   methods ↓" link. A short facts list on the right (kind, status, latest
   version and date, category, licence, source).
2. **Media**: the GIF on its own full-width row, with a caption.
3. **What it does**: up to six `highlights`.
4. **Install**: full width. Platform tabs (macOS, Linux, Windows, Docker)
   generated from `install[].os`, method pills per platform, and one code
   block (single or multi-line) with one Copy button per method.
5. **Documentation**: a map of the docs sections and their pages.

Other kinds use the same frame with a different install block and one extra
section, filled from the release's `wyrd-manifest.json`:

- **MCP server**: client tabs (Claude Code, Claude Desktop, Cursor, VS Code,
  JSON) instead of install methods; a table of exposed tools with their side
  effects. The media is an animated GIF of an agent session.
- **Dev container feature / image**: a `devcontainer.json` snippet instead of
  install methods; an options table (feature) or tags table (image).
- **App**: run commands (Docker Compose, image); a console screenshot tour.

## Docs

- **Sticky header** in two rows: wordmark, product switcher, search scoped to
  the product, GitHub; then section tabs (e.g. Get started, Authoring, Using
  templates). Products without sections get no tab row.
- **Left sidebar** for the current section only, with group headings and
  reading-progress dots (done, current, ahead). It scrolls on its own.
- **Content**: breadcrumb, title, lead paragraph, prose up to ~720px wide. Tip
  callouts use the accent tint. No product card above the content.
- **"On this page"** on the right: sticky, scrolls on its own, nested
  headings. Highlight the last heading that has scrolled past the top of the
  viewport (not whichever heading is visible), so it doesn't jump while
  reading. Links: back to top, copy page as Markdown, edit on GitHub.
- Sections, groups and page order come from `nav` in `docs.yml`.

## Search

Pagefind is implemented (`src/components/Search.astro`). Results from the
product whose page you are on are boosted, not filtered. Still to do with the
redesign:

- Restyle the dialog with the new tokens.
- Index product pages with the same `product` filter.
- Add a `kind` filter and the kind chips once `kind` exists in the schema.

## Decided against

- A carousel hero: hides all but one product and needs extra controls.
- A media card grid for the catalog: grows too long past a few dozen products.
- Blue with an amber accent: the two colours clashed.
- A separate config file for docs navigation: `nav` lives in `docs.yml`.
