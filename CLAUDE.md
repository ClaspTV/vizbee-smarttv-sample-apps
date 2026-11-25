# Vizbee Sample Webapp

One TypeScript + Vite + plain-DOM codebase (`src/`), built once per TV platform with `vite build --mode <platform>` into `dist/<platform>/`. TV apps are **hosted**: installed packages are thin shells that load the S3/CloudFront copy, so most changes ship with `npm run ship:<platform>` and no reinstall.

| Platform | Shell / manifest | Build | Deploy / sideload |
|---|---|---|---|
| Desktop (dev) | none | `npm run dev` (:5173), `npm run build` | local only; Vizbee init is skipped |
| Samsung Tizen | `platforms/tizen/config.xml` (`<content src>` = hosted URL) | `build:tizen` → `packages/tizen/*.wgt` (Tizen CLI + signing profile) | `ship:tizen*`; `tizen install -n <wgt> -- packages/tizen` |
| LG webOS | `platforms/webos/appinfo.json` + `index.html` redirect | `build:webos` → `packages/webos/*.ipk` (ares-cli) | `ship:webos*`; `ares-install`, `ares-launch`, `npm run debug:webos` |
| Xbox | `platforms/xbox/shell` (UWP + WebView2, navigates to hosted URL) | `build:xbox` (web only); `.msix` from `.github/workflows/xbox.yml` | `ship:xbox*`; Device Portal sideload of `.msix` + `.cer` |
| Vizio SmartCast | none (hosted URL) | `build:vizio` | `ship:vizio*` |
| Fire TV | `platforms/firetv` (Cordova, `vizbee-bridge` plugin) | `apk:firetv` (`FIRETV_APP_URL`), `dev:firetv` (preview + ngrok + install) | `ship:firetv`; `adb install packages/firetv/*.apk` |

Hosted layout per platform: `<platform>/` = script build, `<platform>-with-nodemodule/{es5,es6}/` = npm elementless builds, `<platform>-with-nodemodule-element/{es5,es6}/` = npm element builds (see the `ship:*` scripts in `package.json`).

Key docs: `README.md`, `docs/architecture.md`, `docs/platforms.md`, `docs/features.md` (flags, HomeSSO), `docs/vizbee-sdk.md`, `docs/firetv-architecture.md`, `docs/performance-e2e.md` + `.claude/skills/smarttv-perf/SKILL.md` (perf harness).

## Rules that cause real bugs here

- **Code beats docs for SDK selection.** `docs/vizbee-sdk.md` and `README.md` still say the SDK is script-only with defaults `light-es5` + `dev`. Actual defaults are in `DEFAULT_FLAGS` (`src/services/feature-flags/flags.ts`): `appBuild: 'npm'`, `sdkEnv: 'prod'`, `playerElement: 'elementless'`. Origins are in `src/services/sdkEnv.ts`; URLs in `VizbeeService.resolveSdkUrl`.
- **Two SDK load paths.** npm builds set `VIZBEE_SDK_NPM_PACKAGE` (→ `__SDK_NPM_PACKAGE__`) and import from `node_modules`; script builds inject a `<script>`. A new package subpath in a `ship:*` script must also get a literal `import()` branch in `loadBundledSdk()` (`VizbeeService.ts`), or continuity is silently disabled.
- **Elementless script URLs are hard-coded to the dev origin** (`SDK_ELEMENTLESS_URL`) and ignore `sdkEnv`. They have no Vizio entry, so a Vizio script build with `playerElement=elementless` loads no SDK. Dev light URLs also carry an extra `sdk/` path segment that qa/prod do not.
- **Boot may redirect.** `redirectToSelectedBuild` (`src/core/platform/appBuild.ts`) sends a hosted script build to the `-with-nodemodule/<es>` folder when `appBuild` is `npm` (the default). If you change hosted folder names, update the regexes there and the `ship:*` `--outDir`s together.
- **One adapter per bundle.** `@active-adapter` is aliased in `vite.config.ts` to `src/core/platform/active/<platform>.ts`. A new platform needs `PLATFORM_MODES` (vite.config.ts), an `active/` shim, `PlatformName`, `PlatformFactory.supportedPlatforms`, `ALL_PLATFORMS` in `scripts/deploy-s3.sh` and, if hosted, `isHostedPlatform` in `appBuild.ts`.
- **Platform scripts are injected per mode in `vite.config.ts`.** Vizio gets the companion lib, Tizen gets `$WEBAPIS/webapis/webapis.js`, webOS gets `vendor/webOSTV.js`. Without `webOSTV.js` the SDK skips every Luna call and reports empty device info.
- **Do not raise `build.target` above `es2015` or drop `@vitejs/plugin-legacy`.** webOS 4 (Chromium 53) shows a grey screen on ES2017 syntax or module-only bundles. `tsconfig.json` targets ES2017 for type-checking only.
- **Keep hashed asset names.** `deploy-s3.sh` serves `assets/*` as `immutable, max-age=1y` and `index.html` as no-cache. Fixed bundle names froze TVs on old builds.
- **Deploys use `aws s3 sync --delete` into a bucket the SDK shares** (default `vzb-origin-qa`). Xbox excludes `v7/*`, `v7.*` and `es6/*` because the SDK's `xbox/` builds live under the same prefix. Keep those excludes, and do not add a platform folder that matches an SDK segment.
- **Hosted URLs live in four places:** `platforms/tizen/config.xml`, `platforms/webos/index.html`, `platforms/xbox/shell/MainPage.xaml.cs` and the `FIRETV_APP_URL` default in `scripts/build-firetv.sh`. With a non-default `VIZBEE_DEPLOY_PREFIX` they keep loading the root path until you update them.
- **New remote action:** add it to the `RemoteAction` union and to every platform keymap in `src/core/input/keymaps.ts`, Desktop included.
- **Stale docs:** `docs/platforms.md` Xbox packaging (`AppxManifest.xml`, `build/xbox/`) predates the WebView2 shell.

## Conventions

- Default branch `master`. Branches are `feature/*`, `enhancement/*` and `integration/*`. GitHub PRs are merge commits (`Merge pull request #N …`).
- Commit subjects are short and imperative, sometimes with a scope prefix (`perf: …`, `fix(grafana): …`, `xbox shell: …`). There is no enforced format.
- PR body uses `.github/pull_request_template.md`. Tick `- [x] Generate Xbox Build` to get a sideloadable `.msix`. It unticks on every new push.
- `@vizbeetv/sdk` is an npm alias to `@vizbeetv/sdk-qa@<dev build>`. To test a local SDK build without touching `package.json`, use `PERF_SDK_DIR=<sdk repo>/dist/npm` with the perf harness.
- TypeScript strict mode, no `.js` in `src/`, named exports, `@/` → `src/`. CSS sits next to its page and is imported once in `src/main.ts`.
- Feature flags resolve as `?ff_<key>=` > localStorage `vsw.flags.v2` > `DEFAULT_FLAGS`. To add a flag, add one entry in `flags.ts`.
- Run: `npm run dev`; `npm run start:<platform>` (build + `vite preview` on :4173). Check: `npm run typecheck` (every `build:*` and `ship:*` runs it first).
- Tests: the app has none. `perf/` is a separate package with its own lockfile: `cd perf && node --test`, `npm run check`, `node perf-e2e.js --check [--platform vizio|webos|tizen]`.
