---
relationships:
  implements: ../technical-designs/publishing.yml
  references: ../technical-designs/site.yml
---

# Record terminal media

Use [`record-terminal.sh`](../../scripts/media/record-terminal.sh) for a
static transcript PNG. It executes a list of Bash commands against a copy of
a generic fixture. The command text and its real combined output form the
image. A failed command stops capture; it does not replace an existing image.

Keep this recipe in wyrd.foo, beside the publishing contract. Link to it from
onboarding instructions. A template can link to the recipe without copying
its implementation into every product repo. A skill can call the same script.

## Prepare and capture

Install Bash, GNU coreutils and Freeze. Use a disposable fixture directory
with only approved sample files. Do not pass a checkout, a home directory,
credentials or private data as the fixture. Review commands too: the script
executes Bash, and is not a sandbox. It cannot remove secrets printed by a
command or stored in a fixture.

Write one command per line in `commands.txt`. Blank lines and lines starting
with `#` are ignored. Each command starts in the copied fixture directory in
a separate shell. File changes persist between commands; shell variables and
`cd` do not. Combine dependent shell operations on one line. Commands must
finish without input and return zero on success.

From a wyrd.foo checkout:

```sh
scripts/media/record-terminal.sh \
  docs/media/terminal-media/commands.txt \
  docs/media/terminal-media/fixture \
  /tmp/terminal-demo.png
```

For another product, run the script by its absolute path from that product's
isolated worktree. Name an output under `docs/user/assets/`, for example:

```sh
"$WYRD_FOO_DIR/scripts/media/record-terminal.sh" \
  docs/media/commands.txt docs/media/fixture docs/user/assets/terminal.png
```

The script uses an empty HOME, no shell startup files, no inherited environment
except PATH, and an empty `DOCKER_CONFIG`. Public Docker pulls then do not
invoke a private registry's credential helper. The fixture and temporary
configuration are removed at exit. Commands that need authenticated services
are unsuitable for this recipe. Pre-pull public images before capture when
pull progress is not part of the demonstration.

Use generic names and relative paths. Avoid commands that print host paths,
container IDs, account names or environment variables. Inspect the resulting
image at full size for those values, clipped lines and readable text. Rerun
with a shorter command sequence when it is too tall. Do not edit command
output to make a product appear to work.

## Publish the image

For a single product whose pages are directly under `docs/user/`, add the
PNG in both places in its existing `docs.yml`:

```yaml
assets:
  - assets/terminal.png
products:
  widget:
    # Keep the product's existing metadata and kinds.
    media:
      - src: assets/terminal.png
        caption: Inspect the sample items and count them.
        alt: Terminal output showing apples, pears and a count of two.
```

For pages under `docs/user/widget/`, the `assets` entry becomes
`widget/assets/terminal.png`; `media[].src` stays `assets/terminal.png`.
`assets` paths start at `docs/user/`; media paths start at the product's docs
folder. This fragment augments a manifest; it is not a complete manifest.

Check the file signature and the existing publishing contract:

```sh
file docs/user/assets/terminal.png
node "$WYRD_FOO_DIR/publisher/cli.ts" validate "$PWD" --offline
```

The validator runs `src/schema/cross-check.ts` for the asset list and media
references. It does not inspect a media PNG's signature; `file` supplies that
separate check. Use `--strict` without `--offline` before publishing a repo
that has releases. Missing-release warnings in offline validation do not
establish that a repo is ready to publish.

## Typed sessions with VHS

Choose VHS for a TUI or an agent session where the interaction itself matters.
Use the transcript PNG for ordinary command output: it needs no browser,
display, prompt matching or timing, and retains selectable source commands.
A PNG also stays still for visitors who reduce motion. GIFs have no pause
control; use the site's video support for a long interaction.

A minimal tape is in [`session.tape`](../media/terminal-media/session.tape).
Run it from a disposable directory containing the approved fixture. It uses
a fixed generic prompt and matches its trimmed form, `/demo\$$/`, rather than
`/demo\$ $/`. Wait for an output marker that cannot appear in the typed command
for a long-running operation; a sleep alone does not prove completion.

For Docker commands in a tape, pass an empty Docker configuration to VHS:

```sh
capture_config=$(mktemp -d)
printf '{}\n' > "$capture_config/config.json"
DOCKER_CONFIG="$capture_config" timeout 60s vhs session.tape
capture_status=$?
rm -rf "$capture_config"
test "$capture_status" -eq 0
```

The 60-second bound is for this short recording job, not product behavior.
Keep source tapes and generic fixtures. Retain VHS's terminal result; an output
file left by a failed run is not a passing capture.

On a Linux host where VHS stalls without a display, run it inside a virtual
X display: `xvfb-run -a vhs session.tape`. Install Xvfb in the host's maintained
devcontainer configuration if that host needs it. Do not point the recorder at
another person's desktop. On VHS 0.12.1, the headless control in the linked
[evidence](../media/terminal-media/README.md) succeeded with DISPLAY unset;
a virtual display is not required on that tested host.
