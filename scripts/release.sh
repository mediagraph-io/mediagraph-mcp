#!/bin/bash
set -e

# Parse arguments
if [ $# -eq 1 ]; then
  VERSION="patch"
  OTP="$1"
elif [ $# -eq 2 ]; then
  VERSION="$1"
  OTP="$2"
else
  echo "Usage: ./scripts/release.sh <otp>"
  echo "       ./scripts/release.sh <version> <otp>"
  echo ""
  echo "Examples:"
  echo "  ./scripts/release.sh 123456           # patch release"
  echo "  ./scripts/release.sh minor 123456     # minor release"
  exit 1
fi

echo "==> Bumping version ($VERSION)..."
NEW_VERSION=$(npm version "$VERSION" --no-git-tag-version | sed 's/^v//')
echo "    New version: $NEW_VERSION"

# Validate the changelog file exists BEFORE doing anything destructive — every
# release must ship with hand-written notes for the GitHub release page.
NOTES_FILE="release-notes/v$NEW_VERSION.md"
if [ ! -f "$NOTES_FILE" ]; then
  # Roll the version bump back so the workspace stays clean.
  git checkout package.json package-lock.json manifest.json 2>/dev/null || true
  echo "" >&2
  echo "ERROR: missing changelog file: $NOTES_FILE" >&2
  echo "Create it with the user-facing release notes, then re-run." >&2
  exit 1
fi

echo "==> Updating manifest.json..."
# Use node to update manifest.json
node -e "
const fs = require('fs');
const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
manifest.version = '$NEW_VERSION';
fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 2) + '\n');
"

echo "==> Running tests..."
npm test

echo "==> Building..."
npm run build

echo "==> Committing..."
git add package.json manifest.json package-lock.json
git commit -m "Release v$NEW_VERSION"

echo "==> Pushing to master..."
git push origin master

echo "==> Publishing to npm..."
npm publish --access public --otp="$OTP"

echo "==> Creating and pushing tag..."
git tag "v$NEW_VERSION"
git push origin "v$NEW_VERSION"

# Attach the changelog to the GitHub release. Actions may already have created
# the release (its workflow runs on tag push and uploads the .mcpb bundle), so
# `gh release create` may collide — fall through to `gh release edit` in that
# case so the body is updated either way.
echo "==> Posting changelog to GitHub release..."
if ! gh release create "v$NEW_VERSION" \
      --title "v$NEW_VERSION" \
      --notes-file "$NOTES_FILE" 2>/dev/null; then
  # Wait briefly for Actions to create the release, then edit.
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    if gh release view "v$NEW_VERSION" >/dev/null 2>&1; then break; fi
    sleep 2
  done
  gh release edit "v$NEW_VERSION" --notes-file "$NOTES_FILE"
fi

echo ""
echo "==> Release v$NEW_VERSION initiated!"
echo "    npm:    https://www.npmjs.com/package/@mediagraph/cli"
echo "    GitHub: https://github.com/mediagraph-io/mediagraph-mcp/releases/tag/v$NEW_VERSION"
echo "    GitHub Actions will attach the .mcpb bundle to the release."
echo "    Watch: gh run watch --repo mediagraph-io/mediagraph-mcp"
