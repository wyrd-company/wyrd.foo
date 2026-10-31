#!/usr/bin/env bash
# ---
# relationships:
#   implements: ../../docs/guides/terminal-media.md
# ---
# One Bash command per nonblank line; each runs from a fresh fixture cwd.
set -euo pipefail
if [[ $# != 3 || $3 != *.png ]]; then
  echo 'usage: record-terminal.sh commands.txt fixture-directory output.png' >&2
  exit 2
fi
commands=$(realpath "$1")
fixture=$(realpath "$2")
output=$(realpath -m "$3")
command -v freeze >/dev/null
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
mkdir -p "$scratch/home" "$scratch/docker" "$scratch/fixture"
printf '{}\n' > "$scratch/docker/config.json"
cp -R "$fixture/." "$scratch/fixture/"
# No caller HOME, shell startup files, environment secrets or Docker helpers.
while IFS= read -r line || [[ -n $line ]]; do
  [[ -z $line || $line == \#* ]] && continue
  printf '$ %s\n' "$line" >> "$scratch/transcript.txt"
  (
    cd "$scratch/fixture"
    env -i PATH="$PATH" HOME="$scratch/home" DOCKER_CONFIG="$scratch/docker" \
      LANG=C.UTF-8 TERM=dumb NO_COLOR=1 \
      bash --noprofile --norc -e -o pipefail -c "$line" </dev/null
  ) >> "$scratch/transcript.txt" 2>&1 || {
    echo 'Capture failed; inspect the approved command and fixture. No image written.' >&2
    exit 1
  }
  printf '\n' >> "$scratch/transcript.txt"
done < "$commands"
[[ -s $scratch/transcript.txt ]] || { echo 'No commands to capture.' >&2; exit 2; }
env -i PATH="$PATH" HOME="$scratch/home" LANG=C.UTF-8 \
  freeze "$scratch/transcript.txt" --language ansi --theme dracula \
  --wrap 88 --font.size 18 --padding 24 --margin 0 --window --output "$scratch/output.png"
mkdir -p "$(dirname "$output")"
cp "$scratch/output.png" "$output"
