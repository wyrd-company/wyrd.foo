---
title: Installation
order: 2
install: true
---

intentional ships as a single Rust binary named `intentional`. It is published
two ways: as a Homebrew formula and as the `intentional-cli` crate on crates.io.

## Crate layout

The project is a Cargo workspace with two crates:

| Crate | Role |
| --- | --- |
| `intentional-core` | Library with the release and versioning logic. |
| `intentional-cli` | Binary package; installs the `intentional` executable. |

Install `intentional-cli`, not `intentional-core`, to get the command-line tool.

## Homebrew

```console
brew tap wyrd-company/tools
brew install intentional
```

## Cargo

```console
cargo install intentional-cli --locked
```

`--locked` builds against the crate's pinned `Cargo.lock` for a reproducible
install. The minimum supported Rust version (MSRV) is **1.82**.

## From source

Clone the repository and build with either Task or Cargo:

```console
task build
cargo run --bin intentional -- --help
```

To install the binary from a local checkout:

```console
cargo install --path crates/cli --locked
```

## Verify

```console
intentional --version
```

This prints the installed version and confirms the `intentional` executable is
on your `PATH`.
