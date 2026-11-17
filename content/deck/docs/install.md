---
title: Install deck
product: deck
order: 1
---

# Install deck

The CLI runs on Linux and macOS, on x86-64 and ARM64. It connects to a deck
service; the service holds the Discord bot tokens. Both read YAML configuration.

## Homebrew

```sh
brew install wyrd-company/tools/deck
deck --version
```

The formula lives in [wyrd-company/homebrew-tools](https://github.com/wyrd-company/homebrew-tools).
Homebrew's core `deck` formula is a different program with the same name. If
it is installed, `brew install wyrd-company/tools/deck` stops because formulae
with the same name from different taps cannot be installed together. Remove
the core formula first, then install ours:

```sh
brew uninstall deck
brew install wyrd-company/tools/deck
```

## npm

With Node.js 22 or newer and `tar` installed:

```sh
npm install --global @wyrd-company/deck
deck --version
```

The install script downloads the package version's exact GitHub release archive
for the host's OS and CPU, verifies it against `checksums.txt`, and installs the
native executable. npm lifecycle scripts must be enabled. If your policy disables
them, run `node install.js` in the installed package directory, or use an archive.

## APT, RPM and AUR

The APT and RPM packages are named `wyrd-deck`, and the AUR package
`wyrd-deck-bin`; the command is still `deck`. Ubuntu, Debian and the AUR have
their own `deck` and `deck-bin` packages, which are a different program;
`wyrd-deck` conflicts with them because both install `/usr/bin/deck`.

The APT and RPM packages also install an example client configuration at
`/usr/share/doc/wyrd-deck/client.example.yml`. The AUR package installs the
CLI only; start from the
[annotated client example](https://github.com/wyrd-company/deck/blob/main/docs/specifications/assets/configuration/examples/client.yml).
Run the service with its container image.

### APT

On Debian or Ubuntu, add the repo.wyrd.foo signing key and repository, then
install the package:

```sh
sudo install -d -m 0755 /etc/apt/keyrings
curl -fsSL https://repo.wyrd.foo/pubkey.asc |
  sudo tee /etc/apt/keyrings/wyrd-company.asc >/dev/null
echo "deb [signed-by=/etc/apt/keyrings/wyrd-company.asc] https://repo.wyrd.foo/apt stable main" |
  sudo tee /etc/apt/sources.list.d/wyrd-company.list >/dev/null
sudo apt update
sudo apt install wyrd-deck
```

### RPM

On Fedora, RHEL or a compatible `dnf` system, add the repository definition,
then install the package. `dnf` asks you to accept the repository's signing key
the first time:

```sh
sudo curl -fsSL https://repo.wyrd.foo/wyrd.repo -o /etc/yum.repos.d/wyrd.repo
sudo dnf install wyrd-deck
```

The repository setup is maintained in
[repo.wyrd.foo](https://github.com/wyrd-company/repo.wyrd.foo#apt).

### AUR

With an AUR helper:

```sh
paru -S wyrd-deck-bin
```

### Upgrading from the `deck` package

Releases up to 0.1.2 published this package as `deck`. It conflicts with
`wyrd-deck`, so switch packages in one step. On Debian or Ubuntu, `apt` lists
`deck` for removal and removes it once you confirm:

```sh
sudo apt install wyrd-deck
```

On Fedora or another `dnf` system, a plain `dnf install wyrd-deck` stops at
the conflict. Swap the packages instead, which removes `deck` and installs
`wyrd-deck`:

```sh
sudo dnf swap deck wyrd-deck
```

`sudo dnf install --allowerasing wyrd-deck` does the same. Your configuration
is not part of either package and stays in place.

## Release archives

Download an archive and `checksums.txt` from the same
[GitHub release](https://github.com/wyrd-company/deck/releases).
Archives are named `deck_<version>_<os>_<cpu>.tar.gz`, where `os` is `linux` or
`darwin` and `cpu` is `x86_64` or `aarch64`. Verify the archive before
extracting; each step runs only if the previous one succeeded:

```sh
# Example for Linux x86-64, after downloading both files for 1.2.3:
grep '  deck_1.2.3_linux_x86_64.tar.gz$' checksums.txt | sha256sum --check &&
  tar -xzf deck_1.2.3_linux_x86_64.tar.gz &&
  mkdir -p "$HOME/.local/bin" &&
  install -m 0755 deck "$HOME/.local/bin/deck"
```

On macOS use `shasum -a 256 --check` in place of `sha256sum --check`. Ensure the
installation directory is on your PATH. Each archive includes client and service
example configurations, README and license.

## Configure the CLI

Copy the archive's `client.example.yml` or the repository's
[annotated example](https://github.com/wyrd-company/deck/blob/main/docs/specifications/assets/configuration/examples/client.yml)
to `~/.config/deck/config.yml`, edit its service address, Transit identity and
channel settings, then validate it:

```sh
deck config validate
```

The default home comes from the OS user database. `HOME`, `USER` and
`XDG_CONFIG_HOME` do not select configuration. Pass `--config /path/config.yml`
when you need an explicit path. See [authentication](authentication.md) for key
registration and grants, and [posting](posting.md) to start a conversation.

## Service image

The image is `ghcr.io/wyrd-company/deck`, for Linux amd64 and arm64. Pin an exact
release tag for a deployment. Configure the
[service example](https://github.com/wyrd-company/deck/blob/main/docs/specifications/assets/configuration/examples/service.yml),
then mount it read-only:

```sh
docker run --rm --name deck \
  -p 2222:2222 -p 8080:8080 \
  --mount type=bind,src="$(pwd)/config.yml",dst=/etc/deck/config.yml,readonly \
  ghcr.io/wyrd-company/deck:1.2.3
```

The process runs as UID/GID 10001; mounted config, token files and sockets must
be accessible to that identity. Mount any configured OpenBao socket or token
file at its configured path as well; the [service guide](service.md#container)
shows a socket mount. The service needs outbound access to
Discord, NATS and its configured OpenBao/Vault address. It keeps state in NATS
and needs no data volume. The default exposed ports are SSH 2222 and health 8080;
`listen` in the service configuration controls the listeners.

The image runs `deck service start --config /etc/deck/config.yml`. Its healthcheck
runs `deck service health --config /etc/deck/config.yml` every 10 seconds, with
three retries and a 60-second startup period. Health requires every gateway,
NATS and the activity index to be ready. The exact behavior is specified by the
[service design](https://github.com/wyrd-company/deck/blob/main/docs/technical-designs/service.yml).

Continue with [your first message](overview.md#send-your-first-message).
