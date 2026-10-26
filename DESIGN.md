---
version: alpha
name: Wyrd Tools
description: >-
  The visual identity of wyrd.foo: a dark-first catalog and docs site for
  Wyrd Company's tools, with one blue accent, Geist type and dark code blocks.
  Colour tokens without a suffix are the dark theme; tokens with `-light` are
  the light theme.
colors:
  primary: "#6aa5ff"
  primary-light: "#0b4fa8"
  page: "#0b0b0c"
  page-light: "#fafafa"
  surface: "#131316"
  surface-light: "#ffffff"
  surface-2: "#1b1b1f"
  surface-2-light: "#f1f1f3"
  text: "#ededef"
  text-light: "#111113"
  text-2: "#a6a6af"
  text-2-light: "#4a4a52"
  text-faint: "#8e8e97"
  text-faint-light: "#5f5f68"
  divider: "#24242a"
  divider-light: "#e3e3e7"
  header-line: "#3b6fc4"
  header-line-light: "#0b4fa8"
  button: "#2563eb"
  button-light: "#0b4fa8"
  button-text: "#ffffff"
  button-text-light: "#ffffff"
  accent-tint: "rgba(106, 165, 255, 0.13)"
  accent-tint-light: "#e6effa"
  code-bg: "#0f0f12"
  code-bg-light: "#16161a"
  code-text: "#ededef"
  tile-text: "#0b0b0c"
  tile-text-light: "#ffffff"
  status-stable: "#3fb950"
  status-stable-light: "#116329"
  status-preview: "#d29922"
  status-preview-light: "#8a5c00"
typography:
  display:
    fontFamily: Geist
    fontSize: 56px
    fontWeight: 700
    lineHeight: 1.04
    letterSpacing: -0.04em
  product-name:
    fontFamily: Geist Mono
    fontSize: 60px
    fontWeight: 500
    lineHeight: 1
    letterSpacing: -0.04em
  page-title:
    fontFamily: Geist
    fontSize: 40px
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: -0.03em
  tagline:
    fontFamily: Geist
    fontSize: 28px
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: -0.02em
  section-title:
    fontFamily: Geist
    fontSize: 28px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: -0.025em
  heading-2:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: -0.015em
  heading-3:
    fontFamily: Geist
    fontSize: 19px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: -0.015em
  wordmark:
    fontFamily: Geist
    fontSize: 20px
    fontWeight: 700
    letterSpacing: -0.02em
  lead:
    fontFamily: Geist
    fontSize: 18.5px
    fontWeight: 400
    lineHeight: 1.6
  body:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.6
  prose:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.7
  label:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: 500
  code:
    fontFamily: Geist Mono
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.7
rounded:
  xs: 4px
  sm: 6px
  md: 8px
  lg: 10px
  full: 999px
spacing:
  gutter-min: 20px
  gutter-max: 120px
  page-max: 1440px
  prose-max: 720px
  header-min: 64px
  section: 72px
  code-block: 16px
components:
  button-primary:
    backgroundColor: "{colors.button}"
    textColor: "{colors.button-text}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    height: 44px
    padding: 18px
  button-primary-light:
    backgroundColor: "{colors.button-light}"
    textColor: "{colors.button-text-light}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    height: 44px
    padding: 16px
  button-secondary-light:
    backgroundColor: "{colors.surface-light}"
    textColor: "{colors.text-light}"
  code-block:
    backgroundColor: "{colors.code-bg}"
    textColor: "{colors.code-text}"
    typography: "{typography.code}"
    rounded: "{rounded.md}"
    padding: "{spacing.code-block}"
  code-block-light:
    backgroundColor: "{colors.code-bg-light}"
    textColor: "{colors.code-text}"
  tile:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.tile-text}"
  tile-light:
    backgroundColor: "{colors.primary-light}"
    textColor: "{colors.tile-text-light}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
  card-light:
    backgroundColor: "{colors.surface-light}"
    textColor: "{colors.text-light}"
  page:
    backgroundColor: "{colors.page}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
  page-light:
    backgroundColor: "{colors.page-light}"
    textColor: "{colors.text-light}"
  header-line:
    backgroundColor: "{colors.header-line}"
    height: 1px
  header-line-light:
    backgroundColor: "{colors.header-line-light}"
    height: 1px
  rule:
    backgroundColor: "{colors.divider}"
    height: 1px
  rule-light:
    backgroundColor: "{colors.divider-light}"
    height: 1px
  nav-link:
    textColor: "{colors.text-2}"
    typography: "{typography.label}"
  nav-link-light:
    textColor: "{colors.text-2-light}"
  description:
    textColor: "{colors.text-faint}"
  description-light:
    textColor: "{colors.text-faint-light}"
  inline-code:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text}"
    rounded: "{rounded.xs}"
  inline-code-light:
    backgroundColor: "{colors.surface-2-light}"
    textColor: "{colors.text-light}"
  status-stable:
    textColor: "{colors.status-stable}"
  status-stable-light:
    textColor: "{colors.status-stable-light}"
  status-preview:
    textColor: "{colors.status-preview}"
  status-preview-light:
    textColor: "{colors.status-preview-light}"
  callout:
    backgroundColor: "{colors.accent-tint}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
  callout-light:
    backgroundColor: "{colors.accent-tint-light}"
    textColor: "{colors.text-light}"
---

# Wyrd Tools design system

The tokens above are the theme of `src/styles/global.css`. That file is the
source the site reads; this document names its values and says how to apply
them. The page structure and the behaviour of each page are in
[`docs/technical-designs/site.yml`](docs/technical-designs/site.yml).

## Overview

wyrd.foo is a catalog of a few dozen developer tools, with a docs site for
each one. It is dark by default, with near-black neutrals, one blue accent
for everything that acts, and monospace for the names of tools. The light
theme has the same structure and its own value for every colour.

- **Dark is the default.** The header has a light and dark toggle. An inline
  script in the head sets `data-theme` on `<html>` before the first paint, so
  a page never shows the wrong theme first.
- **One accent.** Blue marks links, the selected tab, the current item, the
  "W" tile and product monograms. No other hue carries meaning, except the
  two status colours.
- **Code is dark in both themes.** Commands are what a visitor copies; they
  read the same in either theme.

## Colors

Each colour token is a CSS custom property with a dark value and a light
value. A token without a suffix is the dark value; the `-light` token is the
light value of the same property. `primary` is the property `--accent`; every
other token has the name of its property.

| Token | Property | Use |
| --- | --- | --- |
| `page` | `--page` | The page background, and the header background. |
| `surface` | `--surface` | Cards, rows, buttons, menus and modal panels. |
| `surface-2` | `--surface-2` | Inline code and inset areas on a surface. |
| `text` | `--text` | Body text and headings. |
| `text-2` | `--text-2` | Secondary text: nav links, tour captions, decks, breadcrumbs. |
| `text-faint` | `--text-faint` | Metadata, descriptions, the first media caption and read sidebar items. |
| `divider` | `--divider` | 1px borders and rules. |
| `header-line` | `--header-line` | The 1px line along the bottom of the header. |
| `primary` | `--accent` | Links, accent text, the selected tab underline, the current item, focus rings. |
| `button` | `--button` | The fill of the one primary button in a view. |
| `button-text` | `--button-text` | Text on `button`. |
| `accent-tint` | `--accent-tint` | Tip callouts and the halo of the current reading-progress dot. |
| `code-bg` | `--code-bg` | Code blocks. |
| `code-text` | `--code-text` | Text in code blocks. It has one value, because code blocks are dark in both themes. |
| `tile-text` | `--tile-text` | The letter on the "W" tile and on monograms. The tile fill is `primary`. |
| `status-stable` | `--status-stable` | The status dot and label of a stable product. |
| `status-preview` | `--status-preview` | The status dot and label of a preview product. |

Every text colour meets a 4.5:1 contrast ratio on `page`, `surface` and
`surface-2`. The lowest pair is 5.15:1 (`status-preview-light` on
`surface-2-light`). Text on `button` is at least 5.17:1, and code text on
`code-bg` is at least 15.4:1.

## Typography

Geist is the text face and Geist Mono the code face. Both are self-hosted
(`@fontsource-variable/geist` and `@fontsource-variable/geist-mono`), with
`system-ui` and `ui-monospace` as fallbacks.

Geist Mono also sets product names wherever they are the subject: the product
hero, the featured card title, the releases page title and the monogram
letter. Prose and UI labels are Geist.

| Token | Where |
| --- | --- |
| `display` | The home page headline. It scales with the viewport down to 36px. |
| `product-name` | The product hero name. It scales down to 40px. |
| `page-title` | The h1 of `/releases`, the docs index, docs pages (down to 30px) and the catalog heading. |
| `tagline` | The product hero tagline. It scales down to 22px. |
| `section-title` | The section headings of the product page. |
| `heading-2`, `heading-3` | Headings inside docs prose. |
| `wordmark` | The `wyrd/tools` wordmark in the header, in `primary`. |
| `lead` | The first paragraph of a docs page. |
| `body` | The default for every page. |
| `prose` | Docs page bodies. |
| `label` | Buttons, nav links and tabs. The primary button is weight 600. |
| `code` | Code blocks. Inline code is 0.87em of the surrounding text. |

Headings use negative letter spacing that grows with size, so large type
stays tight. Headlines wrap with `text-wrap: balance`.

## Layout

The page width is `page-max` (1440px). The side gutter scales with the
viewport, from `gutter-min` to `gutter-max` (8.4vw, which is 120px at 1440px).
The header, the footer and every page section line up on that width.

- The header is at least `header-min` (64px) tall.
- Product page sections start `section` (72px) below the one before.
- Docs prose is at most `prose-max` (720px) wide.
- Code blocks have `code-block` (16px) padding vertically and 18px
  horizontally.

## Elevation & Depth

The site is flat. Depth comes from the step between `page`, `surface` and
`surface-2`, and from `divider` borders. Only elements that float above the
page have a shadow:

- The search dialog, the media tour modal and the docs product switcher menu
  cast one soft, low shadow (`0 30px 80px -20px` at 50% black).
- The media tour modal's backdrop is `surface` at 80% opacity. The search
  dialog's backdrop is a dark translucent wash.
- The selected tab has a 2px `primary` underline, drawn as an inset shadow so
  the tab does not move.

## Shapes

Corners are small and consistent.

| Token | Where |
| --- | --- |
| `xs` | Inline code. |
| `sm` | Copy buttons, menu items and media in the tour modal. |
| `md` | Buttons, cards, catalog rows, code blocks, tabs and the featured card. |
| `lg` | Media frames, the media tour modal, `/releases` entries, docs index cards and the docs install block. |
| `full` | Pills: kind chips, method pills, the Show more button and the video Pause/Play button. |

The "W" tile and product monograms are squares with a corner radius of one
seventh of their side. A monogram is 28px in a catalog row and the header,
44px on a card and 72px in a hero.

## Components

- **Header.** The `page` background with a 1px `header-line` along the
  bottom, in both themes. Left: the "W" tile and the `wyrd/tools` wordmark.
  Then the nav (Catalog, Docs, Releases), search, the theme toggle and
  GitHub.
- **Buttons.** `button-primary` is the call to action: "Get started" on the
  featured card, "Read the docs" in the product hero and the Docs button of a
  catalog row. Every other button is `button-secondary`: a `surface` fill
  with a `divider` border that turns `text-faint` on hover.
- **Product mark.** A square SVG logo, or a monogram: the first letter of the
  product name in Geist Mono on a `tile`. One component draws either, so rows
  and cards stay aligned.
- **Code block.** `code-block` with one Copy button. Install blocks group
  code blocks under tabs and method pills.
- **Callout.** A tip in docs prose: `callout`, with a 3px `primary` border on
  the left and square corners on that side.
- **Status.** A dot and a label in `status-stable` or `status-preview`.
- **Rules.** `header-line` is the 1px line under the header; `rule` is every
  other 1px border and divider line.
- **Text roles.** `nav-link` is header nav, tour captions and breadcrumbs;
  `description` is the hero description and other metadata; `inline-code`
  is code inside prose.

## Do's and Don'ts

- Do take every colour from a token, so both themes follow.
- Do use `primary` only for things that act or mark the current place.
- Do keep code blocks dark in both themes.
- Do set product names in Geist Mono.
- Don't add a second accent hue or decorative shadows. The one gradient is
  the fade at the bottom of a clamped `/releases` entry, from transparent to
  `surface`.
- Don't introduce a text colour that falls below 4.5:1 on `page`,
  `surface` or `surface-2` in either theme.
