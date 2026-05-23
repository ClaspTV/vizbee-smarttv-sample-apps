#!/usr/bin/env bash
# Stage dist/xbox/ + platforms/xbox/AppxManifest.xml for UWP packaging.
# Final .appx packaging happens on Windows via MakeAppx.exe (Windows SDK).
# This script just produces the staged folder; run MakeAppx from Windows.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist/xbox"
STAGE="$ROOT/build/xbox"

if [ ! -d "$DIST" ]; then
  echo "$DIST not found — run 'npm run build:xbox' (which builds first) or 'vite build --mode xbox'" >&2
  exit 1
fi

rm -rf "$STAGE"
mkdir -p "$STAGE"
cp -R "$DIST"/* "$STAGE"/
cp "$ROOT/platforms/xbox/AppxManifest.xml" "$STAGE/AppxManifest.xml"

cat <<EOF
Xbox staging complete: $STAGE

To produce the .appx (on a Windows machine with the Windows SDK):
  MakeAppx.exe pack /d "$STAGE" /p MyApp.appx
  signtool.exe sign /fd SHA256 /a /f cert.pfx /p <password> MyApp.appx

Or open in Visual Studio and use the Store > Create App Packages flow.
EOF
