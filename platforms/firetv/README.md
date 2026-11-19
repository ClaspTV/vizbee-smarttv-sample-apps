# FireTV — Vizbee Sample App

Cordova project that wraps the Vizbee cross-TV sample webapp in a full-screen
WebView for Amazon FireTV (Fire OS, Android-based).

---

## Architecture

```
FireTV device
└── Cordova APK
    └── Android WebView
        ├── www/index.html      <- launcher (loads APP_URL after Cordova init)
        └── window.VizbeeBridge <- injected by VizbeeBridgePlugin.java
            └── https://your-app-url/firetv/   <- hosted sample webapp
                └── FireTVAdapter.ts           <- reads window.VizbeeBridge
```

**Bridge mechanism**: The `vizbee-bridge` Cordova plugin registers a Java object as
`window.VizbeeBridge` via Android's `WebView.addJavascriptInterface()`. This is set
up at WebView creation time and persists across all navigations, so the hosted sample
webapp (loaded from an external URL) can call `window.VizbeeBridge.methodName()` with
no Cordova-specific code in the webapp itself.

---

## Prerequisites

| Tool | Install |
|------|---------|
| Node.js + npm | already required by the webapp |
| Cordova CLI | `npm install -g cordova` |
| Android SDK | [Android Studio](https://developer.android.com/studio) |
| JDK 11+ | `java -version` to confirm |
| `adb` | included with Android SDK platform-tools |

Set `ANDROID_HOME` to your SDK root (e.g. `~/Library/Android/sdk`) and ensure
`$ANDROID_HOME/platform-tools` is on your `PATH`.

---

## Development workflow

### 1. Start the web preview server

From the repo root, start the Vite preview for the FireTV build:

```bash
npm run start:firetv
# or via ngrok:
ngrok http 4173
```

### 2. Build the APK

```bash
# From repo root — set FIRETV_APP_URL to your ngrok or local URL:
FIRETV_APP_URL=https://xxxx.ngrok-free.app/firetv/ npm run apk:firetv
```

This:
1. Runs `vite build --mode firetv` → `dist/firetv/`
2. Generates `platforms/firetv/www/index.html` from the template with your URL
3. Sets up the Cordova Android platform + `vizbee-bridge` plugin (first run only)
4. Runs `cordova build android` → debug APK
5. Copies + renames the APK to `packages/firetv/vizbee-sample-app-firetv-v<version>-<buildtype>.apk`
   (version comes from `<widget version="…">` in `config.xml`; build type is `debug` or `release`)

### 3. Install on FireTV

```bash
# Enable ADB on the FireTV:
# Settings → My Fire TV → Developer Options → ADB Debugging: ON
#
# Connect over network ADB:
adb connect <firetv-ip>:5555

# Install the APK (name includes platform + version + build type):
adb install packages/firetv/vizbee-sample-app-firetv-v1.0.0-debug.apk
```

### 4. Run directly on a connected device

```bash
# ADB must already be connected (see step 3 above)
FIRETV_APP_URL=https://xxxx.ngrok-free.app/firetv/ npm run run:firetv
```

---

## Production APK (release build)

```bash
FIRETV_APP_URL=https://your-cdn.cloudfront.net/firetv/ \
FIRETV_RELEASE=1 \
KEYSTORE_PATH=/path/to/vizbee.jks \
KEYSTORE_ALIAS=vizbee \
KEYSTORE_PASS=yourpassword \
bash scripts/build-firetv.sh build
```

---

## Troubleshooting

### `npm error code E401` during `cordova platform add` / build

Cordova fetches the Android platform (`cordova-android`) and plugins from npm. If
your **global** `~/.npmrc` overrides the default registry (e.g. points to a private
company registry) and/or carries a stale auth token, that fetch of *public* packages
fails with:

```
npm error code E401
npm error Incorrect or missing password.
```

This is a local environment issue, not a problem with the project. The `cordova`
command runs inside `platforms/firetv/`, which is its own npm project — so npm reads
`platforms/firetv/.npmrc` (and falls back to your global `~/.npmrc`), **not** the
repo-root config.

**Fix** — create `platforms/firetv/.npmrc` (git-ignored) forcing public npm with no
token, so public packages install anonymously:

```ini
registry=https://registry.npmjs.org/
//registry.npmjs.org/:_authToken=
```

Then re-run:

```bash
cd platforms/firetv && npx cordova platform add android && cd ../..
npm run apk:firetv
```

If you legitimately use a private registry for other work, keep this override
scoped to `platforms/firetv/.npmrc` (already git-ignored) rather than changing your
global config.

### `Could not load API for android project … Api.js` / `android broken`

The generated `platforms/firetv/platforms/android` folder is present but its
dependencies are missing (it's git-ignored, so a fresh checkout or a cleanup can
leave it half-populated). Remove and re-add the platform:

```bash
cd platforms/firetv
rm -rf platforms/android plugins
npx cordova platform add android
cd ../..
```

---

## Project structure

```
platforms/firetv/
├── config.xml              Cordova app manifest (ID, permissions, plugins)
├── package.json            Cordova project metadata
├── www/
│   ├── index.html.tpl      Launcher template (%%FIRETV_APP_URL%% placeholder)
│   └── index.html          Generated at build time (gitignored)
├── vizbee-bridge/          Custom Cordova plugin — JS↔native bridge
│   ├── plugin.xml          Plugin manifest
│   └── src/android/
│       ├── VizbeeBridgePlugin.java   Registers NativeBridge in the WebView
│       └── NativeBridge.java         @JavascriptInterface methods
├── platforms/              Generated by `cordova platform add` (gitignored)
└── plugins/                Generated by `cordova plugin add` (gitignored)
```

---

## window.VizbeeBridge API

Available on every page loaded in the WebView:

```js
window.VizbeeBridge.getPlatformName()  // → "firetv"
window.VizbeeBridge.getDeviceInfo()    // → JSON string: {platform, model, manufacturer, osVersion, sdkInt}
window.VizbeeBridge.exit()             // terminates the app

// Vizbee SDK placeholders (not implemented yet):
window.VizbeeBridge.getVizbeeDeviceId()  // → "" until SDK integration
window.VizbeeBridge.getHomeSSOStatus()   // → {"signedIn":false} until SDK integration
```

`FireTVAdapter.ts` reads `getDeviceInfo()` to populate the Settings → Device panel.

---

## Vizbee integration (future)

Vizbee SDK integration is not yet implemented. When ready:

1. Add the Vizbee Android SDK dependency to `vizbee-bridge/` (Gradle or `.aar`)
2. Implement `getVizbeeDeviceId()` and `getHomeSSOStatus()` in `NativeBridge.java`
3. Add Vizbee init logic to `VizbeeBridgePlugin.initialize()`
4. Update `FireTVAdapter.ts` and/or `VizbeeService.ts` in the web layer

Settings options (SDK env, player element, etc.) are already visible in the UI —
they persist to `localStorage` but have no runtime effect until the SDK is wired up.
