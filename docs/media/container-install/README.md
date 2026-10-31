---
relationships:
  verifies: site
  references: publishing
---

# Authored container manifest evidence

The app fixture's Docker platform shows Docker run, Docker Compose and
Kubernetes methods. The screenshots show the selected method, tool-authored
settings, filename-specific command, download link and Copy confirmation.
The manifests use a generic Alpine workload. The CLI fixture exercises the
same methods with a different default platform.

- [App Docker run](app-docker-run.png)
- [App Docker Compose and copied settings](app-compose.png)
- [App Kubernetes and copied settings](app-kubernetes.png)
- [Dev container Compose regression](compose.png)
- [Dev container Kubernetes regression](kubernetes.png)

`test/browser/product-page.spec.ts` captures the app images with the existing
Playwright harness. It compares clipboard text and downloaded bytes with the
authored source, including CRLF. These are UI checks; no workload is deployed.

## Source adoption

The source contract accepts optional `compose` and `kubernetes` paths on
`method: docker` entries in app and CLI kinds. Declared files must be listed
in `assets`. The site does not derive manifests from Docker commands.

Read-only inspection of the tool source metadata found a Docker entry in
Xolotl that currently pulls its image, and package entries in Wyrwood. Their
installation pages describe configuration files, storage and credentials.
Neither source declares authored Compose or Kubernetes files. Tool authors
must supply those files and declare their paths; Wyrwood also needs a Docker
install entry for its controller. The source docs must explain preparation
and companion files. No tool repository or ingested product was edited.

## Validation

`pnpm check` passes with `NO_COLOR` unset under
`/tmp/wyrd-foo-full-gate.lock`: type checks, 227 schema tests, 245 publisher
tests, 234 unit tests, 10 build tests, 209 rendered-output tests and 161 browser
tests. The build suite covers the source-to-publisher-to-HTML path for app,
CLI and dev container image kinds with both, one or no manifests. Publisher
negative cases run for all three kinds. Standalone publishing design kind
examples also pass the source schema. No `.github/` files changed.
