---
title: Installation
order: 2
install: true
---

`agent-svgtools` is a pure-Rust, single static binary with no C dependencies,
so every install path lands the same self-contained executable. Pick whichever
fits your environment — the one-liners above are the fast path; the sections
below cover each method in full.

## crates.io

Installs from source with Cargo and puts the binary on your `PATH` (in
`~/.cargo/bin`):

```bash
cargo install agent-svgtools
```

This compiles locally, so it needs a Rust toolchain (see [Build from
source](#build-from-source)) but works on any platform Rust targets, including
ones without a prebuilt binary.

## npm / npx

The npm package ships a launcher shim; a postinstall step downloads the
platform-correct prebuilt binary from the matching GitHub release and verifies
its checksum. No Rust toolchain required.

```bash
# Run on demand, no global install.
npx agent-svgtools --help

# Or install it globally.
npm install -g agent-svgtools
```

Supported platforms match the prebuilt binaries below (macOS x64/arm64, Linux
x64/arm64, Windows x64). On an unsupported platform the postinstall step fails
and points you at `cargo install agent-svgtools`. Requires Node.js 16 or newer.

## Homebrew

For macOS and Linux, install from the Wyrd Company tap:

```bash
brew install wyrd-company/tools/agent-svgtools
```

Or tap once and install by name afterward:

```bash
brew tap wyrd-company/tools
brew install agent-svgtools
```

## Prebuilt release binaries

Every [release](https://github.com/wyrd-company/agent-svgtools/releases) attaches
a compressed archive plus a `.sha256` checksum for each supported target:

| Platform | Target triple | Archive |
| --- | --- | --- |
| macOS (Apple Silicon) | `aarch64-apple-darwin` | `.tar.gz` |
| macOS (Intel) | `x86_64-apple-darwin` | `.tar.gz` |
| Linux x64 (musl, static) | `x86_64-unknown-linux-musl` | `.tar.gz` |
| Linux arm64 (musl, static) | `aarch64-unknown-linux-musl` | `.tar.gz` |
| Windows x64 | `x86_64-pc-windows-msvc` | `.zip` |

The Linux builds are statically linked against musl, so they run on any
distribution with no shared-library dependencies. To install manually, download
the archive for your target, extract it, and move the `agent-svgtools` binary
onto your `PATH`:

```bash
# Example: Linux x64. Replace VERSION and the target for your platform.
curl -LO https://github.com/wyrd-company/agent-svgtools/releases/download/VERSION/agent-svgtools-VERSION-x86_64-unknown-linux-musl.tar.gz
tar -xzf agent-svgtools-VERSION-x86_64-unknown-linux-musl.tar.gz
sudo mv agent-svgtools /usr/local/bin/
```

Verify the download against its checksum before installing:

```bash
curl -LO https://github.com/wyrd-company/agent-svgtools/releases/download/VERSION/agent-svgtools-VERSION-x86_64-unknown-linux-musl.tar.gz.sha256
sha256sum -c agent-svgtools-VERSION-x86_64-unknown-linux-musl.tar.gz.sha256
```

## Build from source

Building (whether via `cargo install` or a checkout) needs a Rust toolchain.
The minimum supported Rust version is **1.74**; install the current stable
toolchain from [rustup.rs](https://rustup.rs) if you do not have one.

```bash
git clone https://github.com/wyrd-company/agent-svgtools.git
cd agent-svgtools
cargo build --release
# Binary is written to target/release/agent-svgtools
```

## Verify the install

Confirm the binary is on your `PATH` and runnable:

```bash
agent-svgtools --help
```

Every command is self-documenting — `agent-svgtools <command> --help` prints the
complete, agent-oriented reference with exact output schemas.
