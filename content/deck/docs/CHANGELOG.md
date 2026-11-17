# Changelog

## 0.1.2

### Fixes

- Publish the APT and RPM packages as wyrd-deck: install with
  `apt install wyrd-deck` or `dnf install wyrd-deck`. Ubuntu and Debian ship a
  different program as `deck`, which `apt install deck` would install instead.
  The command is still `deck`, and wyrd-deck conflicts with the other `deck`
  package because both install /usr/bin/deck. Earlier releases stay in the
  repositories under the old name. To upgrade from the `deck` package, run
  `sudo dnf swap deck wyrd-deck` on Fedora; `sudo apt install wyrd-deck`
  removes `deck` once you confirm.

## 0.1.1

### Fixes

- Publish the Arch Linux package to the AUR as wyrd-deck-bin. The AUR's
  deck-bin is a different program (Kong decK), so install wyrd-deck-bin.

## 0.1.0

### Breaking

- Publish user guides, cyberdeck branding and a reproducible synthetic CLI demo.
