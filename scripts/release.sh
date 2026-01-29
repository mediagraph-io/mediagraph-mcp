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

echo ""
echo "==> Release v$NEW_VERSION initiated!"
echo "    npm: https://www.npmjs.com/package/@mediagraph/mcp"
echo "    GitHub Actions will create the release with .mcpb"
echo "    Watch: gh run watch --repo mediagraph-io/mediagraph-mcp"
