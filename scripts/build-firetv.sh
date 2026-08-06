#!/usr/bin/env bash
# Build, run, or package the Vizbee Sample App for Amazon FireTV.
#
# Usage:
#   FIRETV_APP_URL=https://… npm run apk:firetv    # debug APK (default)
#   FIRETV_APP_URL=https://… npm run run:firetv    # install + launch on device
#
# Or invoke directly:
#   FIRETV_APP_URL=https://… bash scripts/build-firetv.sh [build|run]
#
# Environment variables:
#   FIRETV_APP_URL   (required) URL the WebView loads after launch.
#                    Use your ngrok URL during development, or the S3/CloudFront
#                    URL for production.
#                    Example: https://xxxx.ngrok-free.app/firetv/
#
#   FIRETV_RELEASE   Set to '1' to produce a release APK. Requires:
#     KEYSTORE_PATH  Absolute path to the .jks / .keystore file.
#     KEYSTORE_ALIAS Key alias inside the keystore.
#     KEYSTORE_PASS  Keystore + key password.
#
# Outputs:
#   dist/firetv/          Vite web build (web assets — for reference / S3 deploy)
#   platforms/firetv/www/ Generated Cordova launcher (gitignored, rebuilt each run)
#   packages/firetv/      APK(s) produced by Cordova
#
# Prerequisites:
#   node + npm              (project already requires these)
#   cordova CLI             npm install -g cordova
#   Android SDK             https://developer.android.com/studio
#   ANDROID_HOME            must point to your SDK root
#   JDK 11+                 on PATH (javac -version to confirm)
#   adb                     required for 'run' mode (from Android SDK platform-tools)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CORDOVA_ROOT="$ROOT/platforms/firetv"
MODE="${1:-build}"   # build | run

# ── Validate prerequisites ───────────────────────────────────────────────────

# Default to the production CloudFront URL; override for local dev (ngrok/LAN).
FIRETV_APP_URL="${FIRETV_APP_URL:-https://d1a16fhfuhnwgt.cloudfront.net/firetv/}"

if [[ -z "${ANDROID_HOME:-}" ]]; then
  echo "Warning: ANDROID_HOME is not set. Cordova may fail to locate the Android SDK." >&2
fi

# ── Step 1: Vite web build (firetv mode) ─────────────────────────────────────

echo "==> [1/4] Building web assets (mode: firetv)..."
cd "$ROOT"
npx vite build --mode firetv

# ── Step 2: Generate Cordova launcher from template ──────────────────────────
# The template www/index.html.tpl contains %%FIRETV_APP_URL%%.
# We generate www/index.html (gitignored) with the real URL substituted.

echo "==> [2/4] Generating Cordova launcher (www/index.html)..."

TEMPLATE="$CORDOVA_ROOT/www/index.html.tpl"
GENERATED="$CORDOVA_ROOT/www/index.html"

if [[ ! -f "$TEMPLATE" ]]; then
  echo "Error: template not found at $TEMPLATE" >&2
  exit 1
fi

# Escape URL for use as a sed replacement string (handles & and /)
ESCAPED_URL="$(printf '%s' "$FIRETV_APP_URL" | sed 's/[&/\]/\\&/g')"
sed "s|%%FIRETV_APP_URL%%|${ESCAPED_URL}|g" "$TEMPLATE" > "$GENERATED"

echo "    App URL: $FIRETV_APP_URL"

# ── Step 3: Cordova platform + plugin setup (first run only) ─────────────────

echo "==> [3/4] Setting up Cordova project..."
cd "$CORDOVA_ROOT"

if [[ ! -d "$CORDOVA_ROOT/platforms/android" ]]; then
  echo "    Adding Android platform (first run — this may take a minute)..."
  npx cordova platform add android
fi

if ! npx cordova plugin ls 2>/dev/null | grep -q "vizbee-bridge"; then
  echo "    Adding vizbee-bridge plugin..."
  npx cordova plugin add ./vizbee-bridge --nofetch
fi

# Patch MainActivity.java to dispatch synthetic keydown(4) on BACK press
# instead of finishing the Activity — required so the JS exit dialog works.
# Idempotent: the hook skips if the override is already present.
echo "    Applying back-button override to MainActivity.java..."
node "$CORDOVA_ROOT/hooks/after_platform_add/override-back-button.js" "$CORDOVA_ROOT"

# ── Step 4: Cordova build / run ───────────────────────────────────────────────

echo "==> [4/4] Cordova $MODE..."

if [[ "$MODE" == "run" ]]; then
  echo "    Deploying to connected FireTV device (ensure ADB is connected)..."
  npx cordova run android --device
elif [[ "${FIRETV_RELEASE:-0}" == "1" ]]; then
  echo "    Building release APK..."
  npx cordova build android --release \
    -- \
    --keystore="${KEYSTORE_PATH:?KEYSTORE_PATH is required for release builds}" \
    --alias="${KEYSTORE_ALIAS:?KEYSTORE_ALIAS is required for release builds}" \
    --storePassword="${KEYSTORE_PASS:?KEYSTORE_PASS is required for release builds}" \
    --password="${KEYSTORE_PASS}"
else
  echo "    Building debug APK..."
  npx cordova build android
fi

# ── Copy APK(s) to packages/firetv/ ──────────────────────────────────────────

if [[ "$MODE" != "run" ]]; then
  APK_DIR="$CORDOVA_ROOT/platforms/android/app/build/outputs/apk"
  DEST="$ROOT/packages/firetv"
  mkdir -p "$DEST"

  # Platform token from the cordova project folder (firetv, androidtv, …).
  PLATFORM="$(basename "$CORDOVA_ROOT")"

  # App version from the <widget> element in config.xml (e.g. 1.0.0).
  APP_VERSION="$(grep '<widget' "$CORDOVA_ROOT/config.xml" | grep -oE 'version="[^"]+"' | grep -oE '[0-9.]+' | head -1)"
  APP_VERSION="${APP_VERSION:-unknown}"

  echo ""
  # Rename each APK to a meaningful name: app-platform-version-buildtype.
  # Build type (debug/release) is the name of the gradle output subfolder.
  while IFS= read -r apk; do
    BUILD_TYPE="$(basename "$(dirname "$apk")")"
    OUT_NAME="vizbee-sample-app-${PLATFORM}-v${APP_VERSION}-${BUILD_TYPE}.apk"
    cp "$apk" "$DEST/$OUT_NAME"
    echo "APK written to packages/firetv/$OUT_NAME"
    echo "Install on FireTV: adb install packages/firetv/$OUT_NAME"
  done < <(find "$APK_DIR" -name "*.apk")
fi
