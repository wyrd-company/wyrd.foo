# Docs fixture content

A v2 content root as the publisher writes it, for the docs pages. Build the
site from it with `WYRD_CONTENT_DIR=test/fixtures/docs-content`.

- `gadget` and `gizmo` come from one repo with a docs unit per product
  (`docs-path: docs/user/<key>`), and both have `getting-started.md`.
- `gadget` has a nav with two sections, a nested page, a page the nav does not
  list, and a docs changelog.
- `gizmo` has no nav. `sprocket` is an MCP server with one page and a logo.
- Each product's media and logo are under its `docs/assets/`, as the
  publisher writes them.
