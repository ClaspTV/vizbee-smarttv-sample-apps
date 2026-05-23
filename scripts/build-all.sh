#!/usr/bin/env bash
# One-shot build of every platform. Each `vite build --mode <platform>` writes
# to its own dist/<platform>/ — only that platform's adapter is in the bundle.
# Per-platform packagers are skipped if their CLI isn't installed.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Tizen build"
npx vite build --mode tizen
if command -v tizen >/dev/null 2>&1; then
  bash "$ROOT/scripts/build-tizen.sh"
else
  echo "  package step skipped (tizen CLI not installed)"
fi

echo "==> webOS build"
npx vite build --mode webos
if command -v ares-package >/dev/null 2>&1; then
  bash "$ROOT/scripts/build-webos.sh"
else
  echo "  package step skipped (ares-cli not installed)"
fi

echo "==> Xbox build (staging only — run MakeAppx on Windows to finalize)"
npx vite build --mode xbox
bash "$ROOT/scripts/build-xbox.sh"

echo "==> Vizio SmartCast build"
npx vite build --mode viziosmartcast
echo "  dist/viziosmartcast/ is the deployable; host it as an HTTPS URL"
