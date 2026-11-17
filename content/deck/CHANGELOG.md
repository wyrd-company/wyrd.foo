# Changelog

## 0.1.3

### Fixes

- Publish the APT and RPM packages as wyrd-deck: install with
  `apt install wyrd-deck` or `dnf install wyrd-deck`. Ubuntu and Debian ship a
  different program as `deck`, which `apt install deck` would install instead.
  The command is still `deck`, and wyrd-deck conflicts with the other `deck`
  package because both install /usr/bin/deck. Earlier releases stay in the
  repositories under the old name. To upgrade from the `deck` package, run
  `sudo dnf swap deck wyrd-deck` on Fedora; `sudo apt install wyrd-deck`
  removes `deck` once you confirm.

## 0.1.2

### Fixes

- Publish the Arch Linux package to the AUR as wyrd-deck-bin. The AUR's
  deck-bin is a different program (Kong decK), so install wyrd-deck-bin.

## 0.1.1

### Fixes

- Publish the npm installer, the APT, RPM and AUR packages on repo.wyrd.foo and
  the documentation on wyrd.foo, which the 0.1.0 release did not reach. 0.1.1 is
  the first release available on every channel.

## 0.1.0

### Breaking

- Introduce deck, an agent-friendly Discord client with a separate service that
  holds bot tokens. Post and reply with mentions, files, embeds, components, polls
  and personas; read message history, track unread activity and wait for replies.
  Keep Discord threads associated with local sessions and resolve them for a relay.
  
  Authenticate through an OpenBao or Vault Transit key over gRPC on SSH, with
  per-client grants for bots, servers and channels. The service records touched
  threads durably, connects to NATS with JWT credentials and publishes their
  activity to JetStream for subscribers.
  
  Distribute Linux and macOS release archives, a native npm installer, Homebrew,
  Linux packages and a multi-architecture service container.
