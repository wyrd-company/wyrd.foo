---
wyrd-foo: minor
---

`task validate:repo -- <repo path> --strict` reports an unmet publishing requirement as an error, as publish does, so a repo that already publishes finds the failure before it pushes a tag. Without `--strict` it stays a warning.
