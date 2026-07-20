---
title: Overview
order: 1
---

intentional separates intent from state. You declare the next version as an
intent file; Git tags are the record of what was released; manifests across many
ecosystems are projected from that state without reformatting your files.

It is deliberately narrow about side effects. It never publishes packages,
commits, pushes, or opens pull requests. `tag` is its only Git-writing command,
and it creates lightweight tags without a `v` prefix.

Manifests are format-preserving projections: your JSON, TOML, and YAML keep
their existing shape and comments while the version field is updated.

## Supported ecosystems

intentional projects versions across a wide range of package formats without
changing anything else about your manifests. Each projection names an adapter:

| Ecosystem | Adapter | Target |
| --- | --- | --- |
| npm | `npm` | `package.json` version field |
| Cargo | `cargo` | `Cargo.toml` package version |
| Pub | `pub` | `pubspec.yaml` version |
| PEP 621 | `python` | `pyproject.toml` project version |
| MSBuild | `msbuild` | `Version` property in project files |
| Go modules | `go` | Module version via tags only |
| JSON | `json` | Arbitrary field, format-preserving |
| TOML | `toml` | Arbitrary field, format-preserving |
| YAML | `yaml` | Arbitrary field, format-preserving |

The npm, Cargo, Pub, PEP 621, MSBuild, and Go adapters know where the version
lives in their manifests. The generic `json`, `toml`, and `yaml` adapters target
any version field and require a `pointer` that locates it.
