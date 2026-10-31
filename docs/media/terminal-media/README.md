---
relationships:
  verifies: ../../guides/terminal-media.md
---

# Terminal media evidence

`transcript.png` comes from `commands.txt` and `fixture/items.txt` through
`scripts/media/record-terminal.sh`. `gitpr.png` comes from
`gitpr-commands.txt` and `fixture/review.txt` through the same script.

The gitpr application uses the isolated checkout
`/workspaces/worktrees/gitpr/terminal-media-proof`, branch
`docs/terminal-media-proof`, based on `f988846`. Its `docs/user/docs.yml`
lists `assets/terminal.png` in `assets` and in `products.gitpr.media[].src`.
The recorder writes `docs/user/assets/terminal.png`; `gitpr.png` is a copy.
`gitpr-validation.txt` retains the real publisher's offline validation result.
The second repo's changes are evidence only, not a proposed gitpr release or
publication. No change is made to its main checkout.

The images were inspected at full size: commands and output are legible,
without secrets, host paths, account names or real container IDs. The gitpr
capture shows actual CLI help, not a simulated review. The sample instruction
comes from the generic fixture. PNG signatures were checked with `file`.

## Controls

Tested with VHS 0.12.1 and Docker 29.9.2. The transcript recipe uses Freeze.

- `wait-failure.tape` ends with `Wait@2s /demo\$ $/`. It fails with
  `timeout waiting ... last value was: Ready\ndemo$` in
  `wait-failure.txt`. `headless-success.tape` removes only the trailing space
  from the match. `headless-success.txt` shows the successful result.
  Run tapes with `timeout 30s vhs <tape>`; their output is a disposable
  `/tmp/media-smoke.gif`. Setup and short sleeps are recording mechanics.
- The same successful tape ran with `env -u DISPLAY timeout 30s vhs ...`.
  The historical no-display hang did **not** reproduce on this host. The
  recipe documents Xvfb for hosts that require a display; a failing no-display
  control and an Xvfb recovery remain unverified here. Xvfb is not installed.
  Transcript capture avoids this dependency and succeeded without a display.
- A controlled Docker helper failed a public pull. With an empty config the
  same pull succeeded. The two `docker-*.txt` files retain the results. No
  existing Docker configuration or credentials were read. To reproduce:

```sh
control=$(mktemp -d)
mkdir "$control/broken" "$control/empty" "$control/bin"
printf '{"credsStore":"media-broken"}\n' > "$control/broken/config.json"
printf '{}\n' > "$control/empty/config.json"
printf '#!/bin/sh\necho "controlled credential helper failure" >&2\nexit 1\n' \
  > "$control/bin/docker-credential-media-broken"
chmod +x "$control/bin/docker-credential-media-broken"
PATH="$control/bin:$PATH" DOCKER_CONFIG="$control/broken" docker pull alpine:3.22
# Expect nonzero and "error getting credentials".
DOCKER_CONFIG="$control/empty" docker pull alpine:3.22
# Expect zero. No helper is invoked.
rm -rf "$control"
```

Run `bash scripts/media/check-record-terminal.sh` for the capture controls:
real PNG creation, no inherited marker variable, an empty Docker configuration,
a copied fixture, pipeline failure, preservation of an existing output after
failure, and rejection of an empty command list. These need Freeze but no
browser or Docker daemon.
