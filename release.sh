#!/usr/bin/env bash
# Cuts a production release.
#
#   ./release.sh                 -> release whatever is on main right now
#   ./release.sh staging         -> merge staging into main first, then release
#
# Creating the GitHub release is what triggers deploy-production.yml. That
# workflow then pauses on the `production-approval` gate until a reviewer
# approves, so running this script does NOT by itself ship anything live.
#
# Version format: YYYY-MM-DD-N, where N increments per release on the same day.

set -euo pipefail

SCHEMA="theme/config/settings_schema.json"
MAIN_BRANCH="main"

command -v gh >/dev/null || { echo "gh CLI is required"; exit 1; }
command -v jq >/dev/null || { echo "jq is required"; exit 1; }

if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree is dirty — commit or stash first."
  exit 1
fi

echo "Fetching latest ${MAIN_BRANCH}..."
git checkout "$MAIN_BRANCH"
git pull origin "$MAIN_BRANCH"

# Optionally fold in the branches being released.
if [ "$#" -gt 0 ]; then
  for branch in "$@"; do
    echo "Merging ${branch} into ${MAIN_BRANCH}..."
    git fetch origin "$branch"
    git merge --no-edit "origin/$branch"
  done
fi

# Next version for today.
TODAY=$(date -u +%Y-%m-%d)
EXISTING=$(gh release list --limit 100 2>/dev/null | grep -c "$TODAY" || true)
VERSION="${TODAY}-$((EXISTING + 1))"

read -r -p "Version tag [${VERSION}]: " INPUT_VERSION
VERSION="${INPUT_VERSION:-$VERSION}"

read -r -p "Release title [Release ${VERSION}]: " INPUT_TITLE
TITLE="${INPUT_TITLE:-Release ${VERSION}}"

# Stamp the version into the theme so the deployed theme is identifiable in the
# Shopify admin — this is how you confirm which release a store is actually on.
if [ -f "$SCHEMA" ]; then
  echo "Stamping theme_version = ${VERSION}"
  tmp=$(mktemp)
  jq --arg v "$VERSION" \
    'map(if .name == "theme_info" then .theme_version = $v else . end)' \
    "$SCHEMA" > "$tmp"
  mv "$tmp" "$SCHEMA"

  if [ -n "$(git status --porcelain "$SCHEMA")" ]; then
    git add "$SCHEMA"
    git commit -m "Bump theme_version to ${VERSION}"
  fi
else
  echo "WARNING: ${SCHEMA} not found — skipping version stamp."
fi

echo
echo "About to push to ${MAIN_BRANCH} and create release ${VERSION}."
echo "This triggers Deploy - Production, which will wait for approval."
read -r -p "Continue? [y/N]: " CONFIRM
[ "$CONFIRM" = "y" ] || [ "$CONFIRM" = "Y" ] || { echo "Aborted."; exit 1; }

git push origin "$MAIN_BRANCH"
gh release create "$VERSION" --title "$TITLE" --generate-notes

echo
echo "Release ${VERSION} created. Deploy - Production is now awaiting approval:"
echo "  $(gh repo view --json url -q .url)/actions"
