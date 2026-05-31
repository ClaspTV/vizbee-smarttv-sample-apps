# Vizbee Sample Webapp

A reference cross-TV web app showing **how to structure a real production
TV codebase** — clean platform abstraction, feature-flag-driven settings,
spatial-navigation focus model, and a stub-first seam for the Vizbee SDK.

> Targets: **VizioSmartCast · Samsung Tizen · LG webOS · Xbox · Desktop (dev)**
>
> Stack: TypeScript + Vite + plain DOM — no React / Vue / framework runtime.

---

## At a glance

```
┌────────┬─────────────────────────────────────────────────────────────┐
│        │                Vizbee Sample Webapp                         │
│  ⌂ ☰   ├─────────────────────────────────────────────────────────────┤
│  ⚙     │   Home          Player            Settings                  │
│        │   ────          ──────            ────────                  │
│  Nav   │   Hero +        <video> +         Feature flags             │
│  rail  │   carousel      overlay HUD       (localStorage + URL)      │
│        │                 + transport       Device info               │
│  (←  → │                                                             │
│  to    │   ←─ persistent menu always reachable via D-pad LEFT ─→     │
│  reach │                                                             │
│  it)   │                                                             │
└────────┴─────────────────────────────────────────────────────────────┘
                                 ↑
                 ┌───────────────┴───────────────┐
                 │      Platform Abstraction     │
                 │     (Adapter + Factory)       │
                 └───────────────────────────────┘
            ┌────────┬────────┬───────┬──────┬─────────┐
         Vizio    Tizen    webOS    Xbox    Desktop
       (await    (webapis  (UA +    (Win.*  (browser
        VIZIO     ready)   Palm     ready)   dev)
        lib)               Bridge)
```

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173 — DesktopAdapter
                     #   arrows = D-pad, Enter = OK, Esc/Backspace = BACK
```

```bash
npm run build              # desktop bundle → dist/desktop/
npm run build:vizio        # → dist/viziosmartcast/  (host over HTTPS)
npm run build:tizen        # build + sign .wgt → packages/tizen/   (needs Tizen Studio CLI + signing profile)
npm run build:webos        # build + .ipk      → packages/webos/   (needs @webosose/ares-cli)
npm run build:xbox         # build + stage     → build/xbox/       (run MakeAppx on Windows)
npm run build:all          # all of the above
```

Re-package an installer without rebuilding the web bundle:
```bash
npm run pack:tizen         # → packages/tizen/<app>.wgt  (signs with the active Tizen profile)
npm run pack:webos         # → packages/webos/<app>.ipk
```

URL overrides for QA (any flag from [`flags.ts`](src/services/feature-flags/flags.ts)):
```
http://localhost:5173/?ff_debugMode=true
```

## Hosting & deployment (S3 + CloudFront)

The TV apps are **hosted**: the Tizen `config.xml` `<content src>` and the webOS
loader shell point at a CloudFront URL, so day-to-day code changes ship by
syncing the web bundle to S3 — no re-install needed (just relaunch on the TV).

```bash
npm run ship:tizen         # typecheck → build → sync S3 → invalidate CloudFront
npm run ship:webos
npm run ship               # tizen + webos in one go

npm run deploy:s3              # sync every built dist/<platform>/ + invalidate
npm run deploy:s3 tizen webos  # only these platforms
```

`deploy:s3` syncs `dist/<platform>/` → `s3://<bucket>/<prefix>/<platform>/`, sets
cache headers (immutable for hashed `assets/*`, no-cache for `index.html`), then
creates a CloudFront invalidation and **polls it to completion**.

### Env overrides (no code edits)

| Var | Default | Effect |
|---|---|---|
| `VIZBEE_DEPLOY_BUCKET` | `vzb-origin-qa` | Target S3 bucket |
| `VIZBEE_DEPLOY_PREFIX` | _(none)_ | Sub-folder under the bucket, e.g. `staging` → `s3://<bucket>/staging/<platform>/`. Nested (`qa/test`) and stray slashes are normalized. |
| `AWS_REGION` | `us-east-1` | Bucket region |
| `AWS_PROFILE` | _(CLI default)_ | AWS credentials profile |
| `CLOUDFRONT_DISTRIBUTION_ID` | `E12EF2Z11SO5GL` | Distribution to invalidate (baked into `deploy:s3`; override per account) |

```bash
# ship a feature build to its own folder
VIZBEE_DEPLOY_PREFIX=feature-x npm run deploy:s3 tizen webos
#   → s3://vzb-origin-qa/feature-x/tizen/  +  invalidates /feature-x/tizen/*

# different bucket + distribution (another AWS account)
VIZBEE_DEPLOY_BUCKET=my-bucket CLOUDFRONT_DISTRIBUTION_ID=EXXXXXXXX npm run ship
```

> When shipping to a non-default `VIZBEE_DEPLOY_PREFIX`, update the hosted URLs
> the apps load (`platforms/tizen/config.xml` `<content src>` and
> `platforms/webos/index.html`) to match the new folder, or they'll keep loading
> the root path.

### One-time AWS infra

```bash
bash scripts/setup-aws-infra.sh   # private bucket + OAC + CloudFront distro
                                  # + bucket policy + directory-index rewrite function
```
Idempotent — re-running matches the existing distribution by S3 origin. Prints the
bucket, distribution ID, and `*.cloudfront.net` domain when done.

## Sideloading & on-device debug

```bash
# Tizen — sign is handled by build:tizen / pack:tizen
tizen install -n VizbeeTizenSampleApp.wgt -- packages/tizen

# webOS
ares-install --device <name> packages/webos/<app>.ipk
ares-launch  --device <name> com.vizbee.dev.samplewebapp
npm run debug:webos        # opens Chrome DevTools against the running webOS app
```

## Documentation

| Doc | What's inside |
|---|---|
| [docs/architecture.md](docs/architecture.md) | Layer model · design patterns · folder map · request flow diagrams · how each layer is testable |
| [docs/features.md](docs/features.md) | Home / Player / Settings · feature-flag system · Vizbee SDK seam · roadmap |
| [docs/ux-ui.md](docs/ux-ui.md) | Design system · TV-grade focus model · motion principles · component anatomy · accessibility |
| [docs/platforms.md](docs/platforms.md) | Per-platform: detection rule, key codes, packaging, lifecycle quirks, gotchas |
| [docs/vizbee-sdk.md](docs/vizbee-sdk.md) | SDK build variants (full/light × ES5/ES6) · per-platform URLs · switching builds · reload-to-apply |
| [docs/development.md](docs/development.md) | Local workflow · debugging on real TVs · adding a platform / flag / page · style guidelines |

## Code map

```
src/
├── main.ts                          # Boot: detect → wire → start
├── app/
│   ├── App.ts                       # Route registry
│   └── Router.ts                    # Hash-based router
├── core/
│   ├── platform/
│   │   ├── PlatformAdapter.ts       # ← interface every TV implements
│   │   ├── PlatformFactory.ts       # ← detection + dispatch
│   │   └── adapters/
│   │       ├── VizioSmartCastAdapter.ts   # awaits VIZIO_LIBRARY_DID_LOAD (5s budget)
│   │       ├── SamsungTizenAdapter.ts
│   │       ├── LGWebOSAdapter.ts
│   │       ├── XboxAdapter.ts
│   │       └── DesktopAdapter.ts          # browser dev fallback
│   ├── input/
│   │   ├── RemoteKeyService.ts      # global keydown → logical actions
│   │   └── keymaps.ts               # per-platform keycode tables
│   ├── navigation/FocusManager.ts   # spatial D-pad navigation
│   ├── lifecycle/LifecycleManager.ts# foreground / background / exit
│   └── events/EventEmitter.ts       # tiny typed pub/sub
├── services/
│   ├── ServiceContainer.ts          # Service Locator
│   ├── config/ConfigService.ts
│   ├── feature-flags/{FeatureFlagService.ts, flags.ts}
│   ├── logger/Logger.ts
│   └── vizbee/VizbeeService.ts      # ← stub seam for the SDK
├── features/
│   ├── home/{HomePage.ts, home.css}
│   ├── player/{PlayerPage.ts, player.css}
│   └── settings/{SettingsPage.ts, settings.css}
├── components/
│   ├── NavMenu.ts                   # ← persistent left-rail menu
│   ├── VideoCard.ts
│   ├── FocusableButton.ts
│   ├── Toggle.ts
│   └── components.css
├── data/videos.ts                   # 3 demo videos
├── styles/{tokens.css, reset.css}
└── types/global.d.ts                # window.VIZIO etc.
```

## Why no React / Vue / Svelte?

Older Tizen 5 / webOS 4 / VizioSmartCast TVs run **Chromium 53–63**.
A 50–100 KB framework + virtual-DOM tax is a real performance hit on those
devices, and TV apps live for years on TVs that never update. Plain TypeScript
+ DOM keeps the bundle tiny, deterministic, and TV-engine-friendly.

If you must use a framework, **Preact** (~3 KB) is the best fit — drop it in
behind the same component contracts and the rest of the app stays unchanged.

## Wiring the real Vizbee SDK

The whole app already calls a service named `vizbee` for `init`, `setVideo`,
`setVideoStop`, and `reset`. Today that service logs and no-ops. To go live:

```ts
// src/services/vizbee/VizbeeService.ts
import vizbee from '@vizbee/sdk';

init(appId: string): void {
  vizbee.continuity.start(appId);
}
setVideo(video: VizbeeVideoInfo): void {
  const info = new vizbee.continuity.messages.VideoInfo();
  info.guid = video.id;
  info.title = video.title;
  info.videoUrl = video.url;
  vizbee.continuity.setVideoInfo(info);
}
```

Pages and components don't change. See [docs/features.md](docs/features.md#vizbee-sdk-seam)
for the full integration recipe.

### SDK build variants (full/light × ES5/ES6)

The SDK is loaded as a `<script>` at boot — not an npm package. On **Tizen**,
**webOS** and **Xbox** you can pick which build loads: **full** (CDN v7) or
**light** (Vizbee-TV continuity build), each in an **ES5** or **ES6** target —
four options in total, defaulting to `light-es5`. Vizio uses a single CDN build.

A separate **Vizbee SDK Env** selector picks which origin the SDK loads from —
**dev** / **qa** / **prod** (default `dev`) — orthogonal to the build choice.

```
Settings → "Vizbee SDK"        # radio: Full/Light × ES5/ES6 (reloads to apply)
Settings → "Vizbee SDK Env"    # radio: Dev/QA/Prod origin (reloads to apply)
?ff_vizbeeSdk=light-es6        # per-launch QA override
?ff_sdkEnv=qa                  # per-launch env override
```

The choice persists in `localStorage`; since the SDK script loads once at launch,
changing it prompts a reload. Full reference (URLs per platform/variant, code
map): [docs/vizbee-sdk.md](docs/vizbee-sdk.md).

## License

This sample is provided as-is for reference / integration use.
