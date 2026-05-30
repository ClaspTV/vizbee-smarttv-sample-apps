# Vizbee SDK — builds & variants

How the sample loads the Vizbee SDK on each platform, and how to switch
between the **full / light** SDK, the **ES5 / ES6** target, and the
**dev / qa / prod** environment at runtime.

For the integration seam itself (the `VizbeeService` methods pages call), see
[features.md → Vizbee SDK seam](features.md#vizbee-sdk-seam). This doc is about
*which SDK build gets loaded and from where*.

---

## How the SDK is loaded

The SDK is **not** an npm dependency. At boot, [`VizbeeService`](../src/services/vizbee/VizbeeService.ts)
injects a `<script>` tag for the right SDK URL, waits for `window.vizbee`, then
starts continuity. The URL is composed from three inputs:

```
sdkEnv flag (dev / qa / prod)          → origin host
   ╳
platform (tizen / webos / viziosmartcast / xbox)
   ╳
vizbeeSdk flag (full-es5 | full-es6 | light-es5 | light-es6)  → path
   ↓
resolveSdkUrl() → one SDK URL → injected <script>
```

`desktop` loads no SDK — [`App.ts`](../src/app/App.ts) gates `vizbee.init()` off
when running in the browser.

> The script is injected **once, at launch**. Changing the build at runtime
> therefore requires a reload — see [Switching builds](#switching-builds).

## The three axes

| Axis | Values | Meaning |
|---|---|---|
| **Build** | `full` / `light` | `full` = the complete monolithic v7 SDK (one file serves both ES targets). `light` = the slimmer Vizbee-TV continuity build (the `@vizbeetv/sdk` per-platform bundle), split per target. |
| **Target** | `es5` / `es6` | JavaScript language target. `es5` for older TV engines (Chromium ~53–63: webOS 4, Tizen 4–5, older Vizio). `es6` for newer engines. |
| **Env** | `dev` / `qa` / `prod` | Which **origin host** the SDK loads from. dev/qa = the S3 origin buckets; prod = the public CDN. Orthogonal to build/target — it only swaps the host, not the path. |

The first two combine into the `vizbeeSdk` flag's four values (`full-es5`,
`full-es6`, `light-es5`, `light-es6`, **default `light-es5`**); the env is a
separate `sdkEnv` flag (**default `dev`**).

| Env | Origin |
|---|---|
| `dev` | `https://vzb-origin-dev.s3.amazonaws.com` |
| `qa` | `https://vzb-origin-qa.s3.amazonaws.com` |
| `prod` | `https://sdk.claspws.tv` |

> ⚠️ The env switch now applies to **every** build, including `full` — so
> `full` at `dev`/`qa` resolves to `<origin>/v7/vizbee.js` on the S3 bucket, not
> the prod CDN. This assumes the monolithic build is mirrored to those buckets;
> if a given env doesn't host a build, the `<script>` 404s and continuity stays
> disabled.

## Platform support

**Tizen**, **webOS** and **Xbox** expose all four builds. Vizio ships a single
monolithic build (the `vizbeeSdk` flag does not apply to it, but `sdkEnv` still
does); desktop loads nothing. All SDK-loading platforms honour `sdkEnv`.

| Platform | Variant-selectable? | light path segment |
|---|---|---|
| Samsung Tizen | ✅ full/light × ES5/ES6 | `samsung` |
| LG webOS | ✅ full/light × ES5/ES6 | `lg` |
| Xbox | ✅ full/light × ES5/ES6 | `xbox` |
| VizioSmartCast | ❌ single monolithic build | — |
| Desktop (dev) | — no SDK | gated off in `App.ts` |

### URL composition

URLs are **computed** in [`VizbeeService.ts`](../src/services/vizbee/VizbeeService.ts)
→ `resolveSdkUrl`, from the `sdkEnv` origin (see
[`sdkEnv.ts`](../src/services/sdkEnv.ts)) plus the `vizbeeSdk` variant and the
platform's light path segment (`SDK_LIGHT_SEGMENT`):

```
full           → <origin>/v7/vizbee.js                  (both ES targets, one file)
light + es5    → <origin>/<segment>/v7/vizbee.js
light + es6    → <origin>/<segment>/es6/v7/vizbee.js
vizio (single) → <origin>/v7/vizbee.js
```

Worked examples (segment `lg` = webOS):

| Env | Variant | Resolved URL |
|---|---|---|
| `dev` | `light-es5` | `https://vzb-origin-dev.s3.amazonaws.com/lg/v7/vizbee.js` |
| `dev` | `light-es6` | `https://vzb-origin-dev.s3.amazonaws.com/lg/es6/v7/vizbee.js` |
| `qa` | `light-es5` | `https://vzb-origin-qa.s3.amazonaws.com/lg/v7/vizbee.js` |
| `prod` | `full-es5` / `full-es6` | `https://sdk.claspws.tv/v7/vizbee.js` |
| `dev` | `full-es5` | `https://vzb-origin-dev.s3.amazonaws.com/v7/vizbee.js` |

Swap `lg` for `samsung` (Tizen) or `xbox` (Xbox). The default selection
(`sdkEnv=dev` + `vizbeeSdk=light-es5`) reproduces the previous default URL
exactly; `sdkEnv=prod` + `full-*` reproduces the previous prod `full`/Vizio URL.

> Xbox `full` is the legacy EdgeHTML/WinRT build; the new WebView2 shell
> ([platforms/xbox/shell/](../platforms/xbox/shell/)) needs the WebView2-compatible
> `light` (`@vizbeetv/sdk` xbox) builds — see the WinRT caveat in
> [the Xbox shell README](../platforms/xbox/shell/README.md).

> The **full** build serves the same URL for ES5 and ES6 (the monolithic bundle
> handles both targets); only the **light** builds split into separate files.

## Switching builds

Three ways to pick a build, in priority order (highest wins):

1. **URL param (per-launch, QA)** — `?ff_vizbeeSdk=light-es6`,
   `?ff_sdkEnv=qa`. Overrides the stored value for that load only; not
   persisted. Invalid values are ignored.
2. **Settings screen** — the **Vizbee SDK** row offers the four build options
   and the **Vizbee SDK Env** row offers dev/qa/prod, both as radio groups. The
   choice is saved to `localStorage` immediately.
3. **Default** — `light-es5` + `dev`, from `DEFAULT_FLAGS` in
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
| Flag types, defaults, option labels | [`flags.ts`](../src/services/feature-flags/flags.ts) — `FeatureFlags.vizbeeSdk`, `FeatureFlags.sdkEnv`, `DEFAULT_FLAGS`, `FLAG_OPTIONS` |
| Env → origin mapping | [`sdkEnv.ts`](../src/services/sdkEnv.ts) — `SDK_ORIGIN_BY_ENV`, `sdkOrigin` |
| URL composition (env ╳ platform ╳ variant) | [`VizbeeService.ts`](../src/services/vizbee/VizbeeService.ts) — `resolveSdkUrl`, `SDK_LIGHT_SEGMENT` |
| HomeSSO SDK URL (same env axis) | [`HomeSSOService.ts`](../src/services/homesso/HomeSSOService.ts) — `homeSSOUrl` |
| Settings UI + reload prompt | [`SettingsPage.ts`](../src/features/settings/SettingsPage.ts) — `promptSdkReload` |
| Persistence + URL overrides | [`FeatureFlagService.ts`](../src/services/feature-flags/FeatureFlagService.ts) |

## Changing a URL or adding a platform's variants

- **Change an env's origin host:** edit `SDK_ORIGIN_BY_ENV` in
  [`sdkEnv.ts`](../src/services/sdkEnv.ts) — it feeds both the continuity SDK and
  HomeSSO.
- **Change the path scheme** (e.g. the `v7` major or the `es6/` segment): edit
  the template literals in `resolveSdkUrl` in `VizbeeService.ts`.
- **Give another platform the four variants:** add a `SDK_LIGHT_SEGMENT.<platform>`
  entry with its light path segment. `resolveSdkUrl` then composes its URLs
  automatically; no other change is needed. (Vizio is handled as the single
  monolithic case in `resolveSdkUrl` and has no segment.)
