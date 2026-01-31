#!/bin/bash
# Update OpenAPI spec from mediagraph-master repo

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SOURCE="$SCRIPT_DIR/../../mediagraph-master/doc/api/open_api.json"
DEST="$SCRIPT_DIR/../doc/open_api.json"

mkdir -p "$(dirname "$DEST")"
cp "$SOURCE" "$DEST"
echo "Updated: $DEST"
