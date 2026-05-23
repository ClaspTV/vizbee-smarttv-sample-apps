#!/usr/bin/env bash
# Open Chrome DevTools attached to the running webOS app on the TV.
# Requires the app to already be launched (use ares-launch first if not).
#
# Usage:
#   bash scripts/debug-webos.sh                # uses default device + appinfo id
#   WEBOS_DEVICE=lg_2024 bash scripts/debug-webos.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEVICE="${WEBOS_DEVICE:-lg_2023}"
APP_ID="$(node -p "require('$ROOT/platforms/webos/appinfo.json').id")"

if ! command -v ares-inspect >/dev/null 2>&1; then
  echo "ares-inspect not found. Install with: npm i -g @webosose/ares-cli" >&2
  exit 1
fi

echo "Inspecting $APP_ID on $DEVICE..."
echo "If the app is not running, launch it first:"
echo "  ares-launch --device $DEVICE $APP_ID"
echo
exec ares-inspect --device "$DEVICE" --app "$APP_ID"
