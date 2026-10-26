---
wyrd-foo: major
---

wyrd.foo v2. The site has a new design with dark and light themes and site
search. The home page shows a featured product, recent releases and a catalog
filtered by kind. Each product has a page at `/tools/<key>` with install
commands for each kind, its media and its latest release, and docs pages at
`/docs/<key>/<slug>`. `/releases` lists the latest release of every product,
and the site serves `/llms.txt` and a sitemap. Tool repos publish from
`docs/user/`, with a `docs.yml` that follows the v2 docs contract, and call the
reusable workflow `wyrd-company/wyrd.foo/.github/workflows/publish-docs.yml@v2`
on a tag push or a manual run. A manual run can feature a product on the home
page. The site builds only v2 content, so tool repos must move from
`publish-docs@v1` to `publish-docs@v2`.
