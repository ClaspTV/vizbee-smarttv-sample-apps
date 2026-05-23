# Platforms

Per-platform notes for the four supported TV targets plus the desktop
fallback used during development.

| Platform | Engine | Detection | Packaging |
|---|---|---|---|
| **VizioSmartCast** | Chromium-based, varies by year | `window.VIZIO` (with UA fallback to await `VIZIO_LIBRARY_DID_LOAD`) | None — hosted URL |
| **Samsung Tizen** | Chromium (Tizen 4 ≈ Cr 56, Tizen 6 ≈ Cr 76, Tizen 7+ ≈ Cr 94+) | `window.webapis` | `.wgt` via `tizen package` |
| **LG webOS** | Chromium (webOS 4 ≈ Cr 53, webOS 5 ≈ Cr 68, webOS 6+ ≈ Cr 79+) | UA `webos.tv` or `window.PalmServiceBridge` | `.ipk` via `ares-package` |
| **Xbox** | Chromium-based Edge | `Windows.System.Profile.AnalyticsInfo.versionInfo.deviceFamily` contains `'xbox'` | `.appx` via `MakeAppx.exe` |
| **Desktop (dev)** | Modern browsers | Fallback when none of the above match | `npm run dev` |

---

## VizioSmartCast

[`src/core/platform/adapters/VizioSmartCastAdapter.ts`](../src/core/platform/adapters/VizioSmartCastAdapter.ts)

### Detection

Strict rule: **`window.VIZIO` is the single source of truth.** UA fallback
exists only so we know to *wait* for the companion library to load.

### Companion library

Vizio injects `window.VIZIO` from `vizio_companion.js` after the page loads
and dispatches `VIZIO_LIBRARY_DID_LOAD` on `document` when ready. The
adapter awaits this with a **5-second budget**. If it never fires:

```ts
// awaitReady() rejects with:
new Error('Vizio companion library is mandatory; not available within 5s');
```

The boot path catches that, shows an inline error, and aborts. Nothing
half-initializes.

### Key codes

VizioSmartCast remotes deliver standard DOM keycodes (37–40 for D-pad,
13 for OK, 8 for BACK). Media keys: `179` (Play/Pause), `413` (Stop),
`417` (FF), `412` (RW). See [`keymaps.ts`](../src/core/input/keymaps.ts).

### Packaging

**None.** VizioSmartCast apps are hosted web apps: build `dist/`, host it
behind HTTPS, and submit the URL through Vizio's app submission process.

```bash
npm run build
# upload dist/ to S3 / Vercel / Netlify / your CDN of choice
```

For local TV testing, point the developer-mode app loader at your LAN URL
(or tunnel `npm run preview` via ngrok).

### Gotchas

- **Don't** rely on UA alone. Several Vizio UAs lie about being Vizio
  during the splash window. Always wait for `window.VIZIO`.
- Vizio's `getDeviceId()` is async; the production SDK uses
  `getIPAddress()` as the primary identifier, falling back to WebRTC. The
  sample doesn't fetch a deviceId (no SDK calls yet).

---

## Samsung Tizen

[`src/core/platform/adapters/SamsungTizenAdapter.ts`](../src/core/platform/adapters/SamsungTizenAdapter.ts)

### Detection

`window.webapis` is present from app launch (Tizen Web Runtime injects it
based on `<feature>` declarations in `config.xml`). No async waiting needed.

### Key codes

Standard D-pad + Tizen-specific BACK (`10009`), media keys (`415` Play,
`19` Pause, `10252` Play/Pause, `413` Stop, `417` FF, `412` RW). See
[`keymaps.ts`](../src/core/input/keymaps.ts).

To capture media keys you must register them — production apps add this
in the page's lifecycle hook. The sample wires the codes but doesn't
register them with `tizen.tvinputdevice.registerKey()` (kept minimal).

### Device info

`window.webapis.productinfo.getModelCode()` returns e.g. `UN65MU8000`.
The adapter exposes this via `getDeviceInfo()`.

### Packaging

```bash
# Prerequisites
brew install --cask tizen-studio   # macOS; or download Tizen Studio from samsung
# Ensure `tizen` is on PATH.

# Build
npm run build:tizen
# → build/<package-name>.wgt
```

The script copies `dist/` into a staging dir along with
[`platforms/tizen/config.xml`](../platforms/tizen/config.xml) and runs
`tizen package -t wgt`. Adjust `config.xml` (id, name, icon) for your app.

### Gotchas

- Tizen Web Runtime caches resources aggressively across launches. Bump
  `version` in `config.xml` between sideloads, or run `tizen uninstall`
  + `install` rather than `install --reinstall`.
- `<access origin="*" subdomains="true"/>` is required for cross-origin
  video URLs (the sample uses Google's storage bucket).

---

## LG webOS

[`src/core/platform/adapters/LGWebOSAdapter.ts`](../src/core/platform/adapters/LGWebOSAdapter.ts)

### Detection

UA contains `webos.tv` **or** `window.PalmServiceBridge` is present
(native webOS).

### Key codes

Standard D-pad + webOS BACK (`461`), media keys (`415` Play, `19` Pause,
`413` Stop, `417` FF, `412` RW).

### Packaging

```bash
# Prerequisites
npm i -g @webosose/ares-cli

# Build
npm run build:webos
# → build/<package-id>_<version>_all.ipk
```

The script copies `dist/` + [`platforms/webos/appinfo.json`](../platforms/webos/appinfo.json)
into a staging dir and runs `ares-package`.

To install onto a real device:
```bash
ares-setup-device                     # one-time: register your TV
ares-install -d <device> build/*.ipk
ares-launch  -d <device> com.vizbee.samplewebapp
```

### Gotchas

- webOS 3 ships Chromium 38 — many ES2017+ features fail. The sample
  targets ES2017 (webOS 4+); for older devices, add `@vitejs/plugin-legacy`.
- `webOSTV.js` and `webOSTV-dev.js` libraries provide deeper services
  (luna calls, media playback). Not needed for the sample, but if you
  add them, load *before* depending on `window.webOS`.

---

## Xbox

[`src/core/platform/adapters/XboxAdapter.ts`](../src/core/platform/adapters/XboxAdapter.ts)

### Detection

```ts
Windows.System.Profile.AnalyticsInfo.versionInfo.deviceFamily
  .toLowerCase()
  .indexOf('xbox') !== -1
```

`Windows.*` is provided by the UWP runtime. Detection is synchronous.

### Key codes

D-pad maps to standard arrow keys. Controller buttons:
`195` (A → ENTER), `196` (B → BACK).

### Packaging

```bash
npm run build:xbox
# Stages → build/xbox/  (web assets + AppxManifest.xml)
```

Final packaging happens **on Windows** with the Windows SDK:
```cmd
MakeAppx.exe pack /d build\xbox /p VizbeeSample.appx
SignTool.exe sign /fd SHA256 /a /f cert.pfx /p <password> VizbeeSample.appx
```

Or open in Visual Studio and use *Project → Store → Create App Packages*.

### Gotchas

- `<uap:ApplicationContentUriRules>` in [`AppxManifest.xml`](../platforms/xbox/AppxManifest.xml)
  must list every external host the app reaches. The sample includes
  Google's video bucket; add yours.
- Xbox apps run in a sandboxed UWP container. You can't access arbitrary
  filesystem paths; everything must be packaged or fetched via HTTPS.
- Default `MaxVersionTested` in the sample is `10.0.19041.0`; update if
  you target newer SDKs.

---

## Desktop (dev)

[`src/core/platform/adapters/DesktopAdapter.ts`](../src/core/platform/adapters/DesktopAdapter.ts)

Activates when none of the TV markers match — i.e., a regular browser.
Used during local development.

### Key mapping

| Keyboard | Logical action |
|---|---|
| ↑ ↓ ← → | UP / DOWN / LEFT / RIGHT |
| Enter | ENTER (OK) |
| Esc / Backspace | BACK |
| Space | PLAY_PAUSE (Player only) |

### Run

```bash
npm run dev   # http://localhost:5173
```

`window.close()` is a no-op in browsers, so the "Exit" call from the BACK
key on Home does nothing visible — that's fine for dev.

---

## Detection priority

[`PlatformFactory.detect()`](../src/core/platform/PlatformFactory.ts)
checks markers in this order:

```
window.VIZIO || UA contains 'vizio smartcast'  →  VizioSmartCast
window.webapis                                  →  Tizen
Windows.* deviceFamily contains 'xbox'          →  Xbox
UA contains 'webos.tv' || window.PalmServiceBridge → webOS
(else)                                          →  Desktop
```

VizioSmartCast comes first because its UA-based fallback also lets us
*wait* for the companion library — placing it later would risk falling
through to webOS / desktop on devices where `window.VIZIO` hasn't loaded
yet but the UA already says "vizio smartcast".

---

## Adding a new platform

See [architecture.md → Adding a new platform](architecture.md#adding-a-new-platform).
The contract is just the four-method `PlatformAdapter` interface; no
other layer of the app needs to know.
