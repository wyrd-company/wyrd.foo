---
wyrd-foo: patch
---

Send relative links between docs pages to the pages they name. A page link written for its file (`other.md#heading`, `../other.md`) or as a bare slug (`other`) goes to `/docs/<key>/<slug>/#heading`, a link to `CHANGELOG.md` to the docs changelog, and a link to a published asset to `/assets/<key>/<path>`, which now serves every published asset a page links to.
