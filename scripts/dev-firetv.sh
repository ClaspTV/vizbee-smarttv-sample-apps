#!/usr/bin/env bash
# One-command FireTV dev loop.
#
# Does everything the three manual steps did, in order:
#   1. Build the web app and serve it locally (vite preview on :4173).
#   2. Open an ngrok tunnel to that port.
#   3. Read the tunnel's public URL from ngrok's local API (127.0.0.1:4040).
#   4. Build + install + launch the FireTV APK pointed at that URL.
#   5. Keep the server and tunnel alive so the on-device WebView can load the
#      app. Press Ctrl-C to stop everything (server + tunnel are cleaned up).
#
# Usage:
#   npm run dev:firetv            # build + install + launch on a connected Fire TV
#   npm run dev:firetv:apk        # just build the APK (no device needed)
#   bash scripts/dev-firetv.sh [run|build]
#
# Prerequisites:
#   ngrok            https://ngrok.com/download  (a free account/authtoken is enough)
#   + the usual apk:firetv prerequisites (Android SDK, adb, JDK). See build-firetv.sh.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODE="${1:-run}"        # run = install+launch on device | build = APK only
PREVIEW_PORT=4173
NGROK_API="http://127.0.0.1:4040/api/tunnels"
LOG_DIR="${TMPDIR:-/tmp}"

PREVIEW_PID=""
NGROK_PID=""

cleanup() {
  echo ""
  echo "==> Stopping preview server and ngrok tunnel..."
  [[ -n "$NGROK_PID" ]] && kill "$NGROK_PID" 2>/dev/null || true
  [[ -n "$PREVIEW_PID" ]] && kill "$PREVIEW_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Read the https public URL from ngrok's local API; empty if not up yet.
tunnel_url() {
  curl -s "$NGROK_API" 2>/dev/null | node -e '
    let s = "";
    process.stdin.on("data", (d) => (s += d)).on("end", () => {
      try {
        const tunnels = (JSON.parse(s).tunnels) || [];
        const https = tunnels.find((t) => String(t.public_url).startsWith("https"));
        process.stdout.write((https || tunnels[0] || {}).public_url || "");
      } catch (e) {
        process.stdout.write("");
      }
    });' 2>/dev/null || true
}

if ! command -v ngrok >/dev/null 2>&1; then
  echo "Error: ngrok not found on PATH. Install it: https://ngrok.com/download" >&2
  exit 1
fi

# ── 1. Build web assets + start the preview server ───────────────────────────
echo "==> [1/4] Building web assets and starting preview server (:$PREVIEW_PORT)..."
cd "$ROOT"
npx vite build --mode firetv
npx vite preview --outDir dist/firetv --host --port "$PREVIEW_PORT" \
  >"$LOG_DIR/firetv-preview.log" 2>&1 &
PREVIEW_PID=$!

for _ in $(seq 1 30); do
  if curl -sf -o /dev/null "http://localhost:$PREVIEW_PORT/"; then break; fi
  sleep 0.5
done

# ── 2. Open ngrok tunnel (reuse an existing one if already running) ──────────
APP_URL="$(tunnel_url)"
if [[ -z "$APP_URL" ]]; then
  echo "==> [2/4] Opening ngrok tunnel to :$PREVIEW_PORT..."
  ngrok http "$PREVIEW_PORT" --log=stdout >"$LOG_DIR/firetv-ngrok.log" 2>&1 &
  NGROK_PID=$!
  for _ in $(seq 1 40); do
    APP_URL="$(tunnel_url)"
    [[ -n "$APP_URL" ]] && break
    sleep 0.5
  done
else
  echo "==> [2/4] Reusing existing ngrok tunnel."
fi

if [[ -z "$APP_URL" ]]; then
  echo "Error: could not get the ngrok public URL from $NGROK_API." >&2
  echo "       Check $LOG_DIR/firetv-ngrok.log (ngrok may need 'ngrok config add-authtoken')." >&2
  exit 1
fi

echo "    Tunnel URL: $APP_URL"

# ── 3. Build / install the APK pointed at the tunnel URL ─────────────────────
echo "==> [3/4] Building FireTV APK (mode: $MODE) against the tunnel URL..."
FIRETV_APP_URL="$APP_URL/" bash "$ROOT/scripts/build-firetv.sh" "$MODE"

# ── 4. Keep server + tunnel alive so the device can load the app ─────────────
echo ""
echo "==> [4/4] App is live at: $APP_URL"
echo "    Preview server and ngrok are running so your Fire TV can load the app."
echo "    Press Ctrl-C to stop."
wait "$PREVIEW_PID"
