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
- The clean-environment display control below also completed. The historical
  no-display hang did **not** reproduce. Xvfb is not installed; no recovery is
  claimed. Transcript capture also succeeded without a display.
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

## Display investigation

Runtime: VHS 0.12.1, Freeze 0.2.2 (80921ba), ttyd 1.7.7-unknown, and cached
Chromium 128.0.6568.0 (Rod revision 1321438). `clean-headless.txt` retains the
VHS result and exit 0; `browser-argv.txt` contains two process-trace excerpts:
the browser capability probe and the recording browser. Both use `--headless`.
The temporary HOME and tape paths are replaced with `<scratch>`; process IDs and
trace address values are retained. Strace's argument truncation is retained.
The VHS logs here have trailing whitespace removed for repository storage.

Reproduce from the repository root with Bash, GNU timeout, strace and this
installed Rod browser cache (set `browser_cache` to that directory on the
host). This links browser binaries only into a new HOME; no existing home
configuration or credentials are copied. The four-variable environment has
no DISPLAY, WAYLAND_DISPLAY, XDG_RUNTIME_DIR or inherited VHS settings.

```sh
browser_cache=/home/vscode/.cache/rod/browser
scratch=$(mktemp -d)
mkdir -p "$scratch/home/.cache/rod"
ln -s "$browser_cache" "$scratch/home/.cache/rod/browser"
sed "s|/tmp/media-smoke.gif|$scratch/control.gif|" \
  docs/media/terminal-media/headless-success.tape > "$scratch/control.tape"
env -i PATH="$PATH" HOME="$scratch/home" LANG=C.UTF-8 TERM=xterm-256color \
  timeout 30s strace -f -e trace=execve -o "$scratch/exec.txt" \
  vhs "$scratch/control.tape"
capture_status=$?
printf 'exit: %s\n' "$capture_status"
file "$scratch/control.gif"
# Inspect exec.txt for the recording browser's --headless argument.
# Preserve the result and trace before removing this directory.
rm -rf "$scratch"
```

[VHS startBrowser source](https://github.com/charmbracelet/vhs/blob/v0.12.1/vhs.go)
uses Rod's launcher and probes the browser debugging endpoint. The observed
headless launch supplies no affected configuration for an Xvfb recovery test.
Forcing a browser to run with different flags would test that modification,
not reproduce the reported VHS failure. No browser flags or installed tools
were changed for this control.

The display acceptance criterion remains open: supply a supported affected
runtime with a failing no-display control and a successful Xvfb control, or
obtain explicit approval to revise that criterion to the observed headless
behavior. Successful headless capture alone does not close it.
