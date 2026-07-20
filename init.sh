#!/usr/bin/env bash
set -euo pipefail

# Get the directory of this script (assume it's the template dir)
TEMPLATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ $# -gt 0 ]]; then
  echo "Usage: bootstrap-marketing-site (run in target directory)" >&2
  exit 1
fi

TARGET="$PWD"

# Get repo name from origin remote (if available), fallback to target basename
if git -C "$TEMPLATE_DIR" rev-parse --is-inside-work-tree &>/dev/null; then
  ORIGIN_URL=$(git -C "$TEMPLATE_DIR" remote get-url origin 2>/dev/null || true)
  if [[ -n "$ORIGIN_URL" ]]; then
    # Extract repo name from URL (handles .git at end)
    REPO_NAME=$(basename "${ORIGIN_URL%.git}")
  else
    REPO_NAME="$(basename "$TARGET")"
  fi
else
  REPO_NAME="$(basename "$TARGET")"
fi

PROJECT_NAME="$REPO_NAME"

# Substitute <site name> with repo name in all files except this script
find "$TARGET" -type f ! -name "$(basename "$0")" -exec sed -i "s/<site name>/$PROJECT_NAME/g" {} +

# Git initial commit
git -C "$TARGET" add -A
git -C "$TARGET" commit -q -m "Initial scaffold"