#!/usr/bin/env bash
# Package dist/tizen/ + platforms/tizen/config.xml into a Tizen .wgt.
# Requires: Tizen Studio CLI on PATH (tizen package).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist/tizen"
STAGE="$ROOT/build/tizen"

if [ ! -d "$DIST" ]; then
  echo "$DIST not found — run 'npm run build:tizen' (which builds first) or 'vite build --mode tizen'" >&2
  exit 1
fi

if ! command -v tizen >/dev/null 2>&1; then
  echo "tizen CLI not found. Install Tizen Studio and ensure 'tizen' is on PATH." >&2
  exit 1
fi

rm -rf "$STAGE"
mkdir -p "$STAGE"
cp -R "$DIST"/* "$STAGE"/
cp "$ROOT/platforms/tizen/config.xml" "$STAGE/config.xml"
# Optional: drop in icon.png if you have one in platforms/tizen/.
[ -f "$ROOT/platforms/tizen/icon.png" ] && cp "$ROOT/platforms/tizen/icon.png" "$STAGE/icon.png"

mkdir -p "$ROOT/packages/tizen"
tizen package -t wgt -o "$ROOT/packages/tizen" -- "$STAGE"
echo "Tizen .wgt written to $ROOT/packages/tizen"
