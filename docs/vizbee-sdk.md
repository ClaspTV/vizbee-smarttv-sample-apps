# Vizbee SDK — builds & variants

How the sample loads the Vizbee SDK on each platform, and how to switch
between the **full / light** SDK and the **ES5 / ES6** target at runtime.

For the integration seam itself (the `VizbeeService` methods pages call), see
[features.md → Vizbee SDK seam](features.md#vizbee-sdk-seam). This doc is about
*which SDK build gets loaded and from where*.

---

## How the SDK is loaded

The SDK is **not** an npm dependency. At boot, [`VizbeeService`](../src/services/vizbee/VizbeeService.ts)
injects a `<script>` tag for the right SDK URL, waits for `window.vizbee`, then
starts continuity. The URL is resolved from two inputs:

```
platform (tizen / webos / viziosmartcast / xbox)
   ╳
vizbeeSdk flag (full-es5 | full-es6 | light-es5 | light-es6)
   ↓
resolveSdkUrl() → one SDK URL → injected <script>
```

`desktop` loads no SDK — [`App.ts`](../src/app/App.ts) gates `vizbee.init()` off
when running in the browser.

> The script is injected **once, at launch**. Changing the build at runtime
> therefore requires a reload — see [Switching builds](#switching-builds).

## The two axes

| Axis | Values | Meaning |
|---|---|---|
| **Build** | `full` / `light` | `full` = the complete v7 SDK from the Vizbee CDN (`sdk.claspws.tv`). `light` = the slimmer Vizbee-TV continuity build (the `@vizbeetv/sdk` per-platform bundle) served from the dev origin (`vzb-origin-dev`). |
| **Target** | `es5` / `es6` | JavaScript language target. `es5` for older TV engines (Chromium ~53–63: webOS 4, Tizen 4–5, older Vizio). `es6` for newer engines. |

Combined, the `vizbeeSdk` flag has four values: `full-es5`, `full-es6`,
`light-es5`, `light-es6`. **Default: `light-es5`.**

## Platform support

**Tizen**, **webOS** and **Xbox** expose all four builds. Vizio ships a single
CDN build (the flag does not apply to it); desktop loads nothing.

| Platform | Variant-selectable? | Source |
|---|---|---|
| Samsung Tizen | ✅ full/light × ES5/ES6 | `SDK_URL_BY_VARIANT.tizen` |
| LG webOS | ✅ full/light × ES5/ES6 | `SDK_URL_BY_VARIANT.webos` |
| Xbox | ✅ full/light × ES5/ES6 | `SDK_URL_BY_VARIANT.xbox` |
| VizioSmartCast | ❌ single build | `SDK_URL_BY_PLATFORM.viziosmartcast` |
| Desktop (dev) | — no SDK | gated off in `App.ts` |

### URLs by platform & variant

Defined in [`VizbeeService.ts`](../src/services/vizbee/VizbeeService.ts) →
`SDK_URL_BY_VARIANT` (variant builds) and `SDK_URL_BY_PLATFORM` (single builds).

**Tizen**

| Variant | URL |
|---|---|
| `full-es5` / `full-es6` | `https://sdk.claspws.tv/v7/vizbee.js` |
| `light-es5` | `https://vzb-origin-dev.s3.amazonaws.com/samsung/v7/vizbee.js` |
| `light-es6` | `https://vzb-origin-dev.s3.amazonaws.com/samsung/es6/v7/vizbee.js` |

**webOS**

| Variant | URL |
|---|---|
| `full-es5` / `full-es6` | `https://sdk.claspws.tv/v7/vizbee.js` |
| `light-es5` | `https://vzb-origin-dev.s3.amazonaws.com/lg/v7/vizbee.js` |
| `light-es6` | `https://vzb-origin-dev.s3.amazonaws.com/lg/es6/v7/vizbee.js` |

**Xbox**

| Variant | URL |
|---|---|
| `full-es5` / `full-es6` | `https://sdk.claspws.tv/v7/vizbee.js` |
| `light-es5` | `https://vzb-origin-dev.s3.amazonaws.com/xbox/v7/vizbee.js` |
| `light-es6` | `https://vzb-origin-dev.s3.amazonaws.com/xbox/es6/v7/vizbee.js` |

> Xbox `full` is the legacy EdgeHTML/WinRT build; the new WebView2 shell
> ([platforms/xbox/shell/](../platforms/xbox/shell/)) needs the WebView2-compatible
> `light` (`@vizbeetv/sdk` xbox) builds — see the WinRT caveat in
> [the Xbox shell README](../platforms/xbox/shell/README.md).

**Single-build platforms**

| Platform | URL |
|---|---|
| VizioSmartCast | `https://sdk.claspws.tv/v7/vizbee.js` |

> The **full** build serves the same URL for ES5 and ES6 (the CDN bundle
> handles both targets); only the **light** builds split into separate files.

## Switching builds

Three ways to pick a build, in priority order (highest wins):

1. **URL param (per-launch, QA)** — `?ff_vizbeeSdk=light-es6`. Overrides the
   stored value for that load only; not persisted. Invalid values are ignored.
2. **Settings screen** — the **Vizbee SDK** row offers the four options as a
   radio group. The choice is saved to `localStorage` immediately.
3. **Default** — `light-es5`, from `DEFAULT_FLAGS` in
   [`flags.ts`](../src/services/feature-flags/flags.ts).

### Reload-to-apply

Because the SDK `<script>` is injected once at boot, picking a new build in
Settings can't hot-swap the running SDK. Selecting an option therefore opens a
confirmation dialog (**“Reload to apply SDK?”**):

- **Reload now** → `location.reload()`; the app reboots into the new build.
- **Later** → the choice stays saved and applies on the next launch.

Implemented in [`SettingsPage.ts`](../src/features/settings/SettingsPage.ts)
(`promptSdkReload`) using the shared [`ConfirmDialog`](../src/components/ConfirmDialog.ts).

### Persistence

The selection lives in `localStorage` under `vsw.flags.v2` and is restored on
the next launch (per-origin — tied to the hosted URL the TV loads). See
[features.md → Feature flags](features.md#feature-flags) for the full resolution
order and storage semantics.

## Where it lives in code

| Concern | Location |
|---|---|
| Flag type, default, option labels | [`flags.ts`](../src/services/feature-flags/flags.ts) — `FeatureFlags.vizbeeSdk`, `DEFAULT_FLAGS`, `FLAG_OPTIONS` |
| URL resolution (platform ╳ variant) | [`VizbeeService.ts`](../src/services/vizbee/VizbeeService.ts) — `resolveSdkUrl`, `SDK_URL_BY_VARIANT`, `SDK_URL_BY_PLATFORM` |
| Settings UI + reload prompt | [`SettingsPage.ts`](../src/features/settings/SettingsPage.ts) — `promptSdkReload` |
| Persistence + URL overrides | [`FeatureFlagService.ts`](../src/services/feature-flags/FeatureFlagService.ts) |

## Changing a URL or adding a platform's variants

- **Point a build at a different URL:** edit the relevant entry in
  `SDK_URL_BY_VARIANT` (Tizen/webOS) or `SDK_URL_BY_PLATFORM` (Vizio/Xbox) in
  `VizbeeService.ts`.
- **Give another platform the four variants:** add a `SDK_URL_BY_VARIANT.<platform>`
  block with the four URLs and remove that platform's entry from
  `SDK_URL_BY_PLATFORM`. `resolveSdkUrl` automatically prefers the variant map
  when present, so no other change is needed.
