#!/usr/bin/env bash
# Package dist/webos/ + platforms/webos/appinfo.json into a webOS .ipk.
# Requires: @webosose/ares-cli on PATH (ares-package).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist/webos"
STAGE="$ROOT/build/webos"

if [ ! -d "$DIST" ]; then
  echo "$DIST not found — run 'npm run build:webos' (which builds first) or 'vite build --mode webos'" >&2
  exit 1
fi

if ! command -v ares-package >/dev/null 2>&1; then
  echo "ares-package not found. Install with: npm i -g @webosose/ares-cli" >&2
  exit 1
fi

rm -rf "$STAGE"
mkdir -p "$STAGE"
cp -R "$DIST"/* "$STAGE"/
cp "$ROOT/platforms/webos/appinfo.json" "$STAGE/appinfo.json"
# Overlay the hosted-app bootstrap on top of the bundled index.html so the
# installed app loads from CloudFront. dist/webos/assets/* stays bundled but
# unused; trim later if .ipk size matters.
[ -f "$ROOT/platforms/webos/index.html" ] && cp "$ROOT/platforms/webos/index.html" "$STAGE/index.html"
[ -f "$ROOT/platforms/webos/icon.png" ] && cp "$ROOT/platforms/webos/icon.png" "$STAGE/icon.png"
[ -f "$ROOT/platforms/webos/largeIcon.png" ] && cp "$ROOT/platforms/webos/largeIcon.png" "$STAGE/largeIcon.png"

mkdir -p "$ROOT/packages/webos"
ares-package "$STAGE" -o "$ROOT/packages/webos"
echo "webOS .ipk written to $ROOT/packages/webos"
