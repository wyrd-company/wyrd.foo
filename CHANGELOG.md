# Changelog

## 1.0.0

### Features

- The wyrd.foo site: a front page that catalogues Wyrd Company's public tools,
  and a docs section for each tool, built from the tool folders in `content/`.
- `publish-docs@v1`: a composite action that a tool repo runs to publish its
  `docs/` folder to wyrd.foo. It reads `docs/docs.yml` (`name`, `tagline`,
  `category`, `status`), the `docs/*.md` pages marked `docs: true` with a
  `title` and an `order`, and the files listed in `assets`, and replaces the
  tool's folder in `content/` on each run.
