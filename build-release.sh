#!/usr/bin/env bash
# build-release.sh
# Packages the S.A.M Chrome extension into a store-ready zip.
# Usage: bash build-release.sh
# Requires: bash, zip (comes with Git Bash on Windows)

set -e

# ── Read version from manifest.json ──────────────────────────────────────────
MANIFEST="manifest.json"
if [ ! -f "$MANIFEST" ]; then
  echo "Error: $MANIFEST not found. Run this script from the project root." >&2
  exit 1
fi

# Extract version field (works with both Python 2 and 3, or falls back to grep)
if command -v python3 &>/dev/null; then
  VERSION=$(python3 -c "import json,sys; print(json.load(open('$MANIFEST'))['version'])")
elif command -v python &>/dev/null; then
  VERSION=$(python -c "import json,sys; print(json.load(open('$MANIFEST'))['version'])")
else
  VERSION=$(grep '"version"' "$MANIFEST" | head -1 | sed 's/.*: *"\([^"]*\)".*/\1/')
fi

if [ -z "$VERSION" ]; then
  echo "Error: Could not read version from $MANIFEST" >&2
  exit 1
fi

ZIP_NAME="sam-sports-ad-muter-v${VERSION}.zip"
RELEASES_DIR="releases"

echo "Building S.A.M v${VERSION}..."

# ── Verify required files exist ───────────────────────────────────────────────
REQUIRED=(
  manifest.json
  popup.html popup.js popup.css
  background.js content.js
  request-queue.js adaptive-sampler.js
  privacy-policy.html
  images/logo/icon16.png
  images/logo/icon32.png
  images/logo/icon48.png
  images/logo/icon128.png
)

MISSING=0
for f in "${REQUIRED[@]}"; do
  if [ ! -f "$f" ]; then
    echo "  MISSING: $f" >&2
    MISSING=1
  fi
done
if [ "$MISSING" -eq 1 ]; then
  echo "Error: Required files are missing. Aborting." >&2
  exit 1
fi

# ── Create releases/ dir ──────────────────────────────────────────────────────
mkdir -p "$RELEASES_DIR"

OUTPUT="$RELEASES_DIR/$ZIP_NAME"

# Remove any existing zip for this version
if [ -f "$OUTPUT" ]; then
  rm "$OUTPUT"
  echo "  Removed existing $ZIP_NAME"
fi

# ── Build the zip ─────────────────────────────────────────────────────────────
# Only include files that belong in the extension — explicitly listed,
# not a glob, so dev/build artifacts can never sneak in.
zip -9 "$OUTPUT" \
  manifest.json \
  popup.html \
  popup.js \
  popup.css \
  background.js \
  content.js \
  request-queue.js \
  adaptive-sampler.js \
  privacy-policy.html \
  images/logo/icon16.png \
  images/logo/icon32.png \
  images/logo/icon48.png \
  images/logo/icon128.png

echo ""
echo "Done! Release package: $OUTPUT"
echo ""

# ── Print contents with sizes ─────────────────────────────────────────────────
echo "Contents:"
unzip -v "$OUTPUT" | tail -n +4 | head -n -2

echo ""
BYTES=$(wc -c < "$OUTPUT")
KB=$(echo "scale=1; $BYTES/1024" | bc 2>/dev/null || echo "$((BYTES/1024))")
echo "Total size: ${KB} KB"
echo ""
echo "Next steps:"
echo "  1. Upload $OUTPUT at https://chrome.google.com/webstore/devconsole"
echo "  2. Paste your privacy policy URL in the store listing:"
echo "     https://<your-github-username>.github.io/Sports-Ad-Muter/privacy-policy.html"
