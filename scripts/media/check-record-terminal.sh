#!/usr/bin/env bash
# ---
# relationships:
#   verifies: record-terminal.sh
# ---
set -euo pipefail
root=$(cd "$(dirname "$0")/../.." && pwd)
recorder="$root/scripts/media/record-terminal.sh"
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
mkdir "$scratch/fixture"
printf 'apples\npears\n' > "$scratch/fixture/items.txt"
cat > "$scratch/commands.txt" <<'COMMANDS'
test -z "${CAPTURE_TEST_MARKER:-}"
test "$(cat "$DOCKER_CONFIG/config.json")" = '{}'
printf 'plums\n' >> items.txt
wc -l < items.txt
COMMANDS
CAPTURE_TEST_MARKER=must-not-be-inherited "$recorder" "$scratch/commands.txt" "$scratch/fixture" "$scratch/output.png"
file "$scratch/output.png" | grep -q 'PNG image data'
test "$(wc -l < "$scratch/fixture/items.txt")" -eq 2
cp "$scratch/output.png" "$scratch/before.png"
printf 'false | true\n' > "$scratch/commands.txt"
if "$recorder" "$scratch/commands.txt" "$scratch/fixture" "$scratch/output.png"; then
  echo 'FAIL: pipeline failure accepted' >&2; exit 1
fi
cmp "$scratch/before.png" "$scratch/output.png"
: > "$scratch/commands.txt"
if "$recorder" "$scratch/commands.txt" "$scratch/fixture" "$scratch/empty.png"; then
  echo 'FAIL: empty commands accepted' >&2; exit 1
fi
test ! -e "$scratch/empty.png"
echo 'PASS: PNG capture, clean environment, empty Docker config, copied fixture, pipeline failure, output preservation, empty input'
