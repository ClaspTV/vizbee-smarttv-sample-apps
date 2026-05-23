# Architecture

> Goal: a small, testable codebase that runs on five very different TV
> environments without if/else-by-platform code spreading through pages.

## Guiding principles

1. **Pages and components depend on interfaces, never on `window.VIZIO` /
   `window.webapis` / `Windows.*`.** Platform quirks live behind one
   adapter file each.
2. **One contract per concern.** Detection, input, focus, lifecycle, config,
   flags, logging — each owned by one service with a single public surface.
3. **Boot is a recipe, not magic.** [`main.ts`](../src/main.ts) is the entire
   wiring graph: detect → wait for ready → instantiate services → start
   router. Easy to read top-to-bottom.
4. **Failure paths are explicit.** Platform readiness can time out; deviceId
   sentinels are guarded; logs always say *why* something aborted.
5. **Bundle stays tiny.** No framework runtime; ES2017 target; no polyfill
   bloat. Older TV engines were not afterthoughts.

## Layer model

```
┌─────────────────────────────────────────────────────────────────────┐
│  Layout shell  app/App.ts  →  app-layout = NavMenu + content        │
│  (mounted once at boot; stays across page transitions)              │
├─────────────────────────────────────────────────────────────────────┤
│  Pages         features/{home, player, settings}/*Page.ts           │
│  ↓ render into the content area and consume ↓                       │
├─────────────────────────────────────────────────────────────────────┤
│  Components    components/{NavMenu, VideoCard, FocusableButton,     │
│                            Toggle}.ts                               │
│  ↓ build DOM that opts in via data-focusable; subscribe to ↓        │
├─────────────────────────────────────────────────────────────────────┤
│  Services      services/{config, feature-flags, vizbee, logger}/*   │
│  (ServiceContainer is the wired graph; pages call services())       │
│  ↓ reach into ↓                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  Core          core/{platform, input, navigation, lifecycle,        │
│                       events}/*                                     │
│  Platform-agnostic primitives. The only file that ever touches      │
│  raw window.* APIs is the relevant adapter under                    │
│  core/platform/adapters/.                                           │
├─────────────────────────────────────────────────────────────────────┤
│  Adapters      core/platform/adapters/{Vizio, Tizen, webOS,         │
│                                         Xbox, Desktop}Adapter.ts    │
│  Each implements the same PlatformAdapter interface.                │
└─────────────────────────────────────────────────────────────────────┘
```

Strict rule: **dependencies only point downward** (Pages → Components →
Services → Core → Adapters). Never the reverse. This is what keeps the
adapter files swappable and the pages testable.

## Boot sequence

```
main.ts
  │
  ├─ PlatformFactory.detect()                 (returns PlatformAdapter)
  │
  ├─ build services
  │     ConfigService, FeatureFlagService(load()), Logger,
  │     RemoteKeyService(platform), FocusManager(remoteKeys),
  │     LifecycleManager(), VizbeeService(), Router()
  │
  ├─ setServices({...})                       (wires the locator)
  │
  ├─ await platform.awaitReady()              (Vizio: VIZIO_LIBRARY_DID_LOAD
  │                                            with 5s budget; others:
  │                                            resolve immediately)
  │
  ├─ remoteKeys.start(); focus.start(); lifecycle.start()
  │
  └─ startApp(root, router)
        ├─ register routes
        ├─ vizbee.init(appId)                 (if enableVizbee flag set)
        └─ router.start('/home')              (renders home page)
```

If `awaitReady()` rejects (Vizio companion library never loads), the boot
shows an inline error message and stops — pages never render with a
half-initialized platform.

## Design patterns

| Pattern | Where | Why this pattern |
|---|---|---|
| **Adapter** | `core/platform/adapters/*` | Each TV exposes utterly different APIs. The adapter is the *only* place that reaches into `window.VIZIO` / `window.webapis` / `Windows.*`. Pages depend on the `PlatformAdapter` interface. |
| **Factory** | `PlatformFactory.detect()` | Single chokepoint for the detection rule set. Mirrors the production rule in `vtvlib::getPlatformType()`: detect by capability (e.g. `window.VIZIO`), with UA as a tiebreaker only when needed. |
| **Strategy** | `core/input/keymaps.ts` | Each platform sends different keycodes for the same logical action. One map per platform; one runtime check; one place to extend. |
| **Observer** | `EventEmitter`, `LifecycleManager`, `FeatureFlagService` | Multiple modules need to react to the same signal (foreground, flag toggled). Pub/sub is cleaner than callback wiring. |
| **Service Locator** | `ServiceContainer.ts` | The whole graph is wired once at boot; everything else asks `services()`. Easy to swap an impl in tests (`setServices({...realServices, vizbee: fakeVizbee})`). |
| **Command (light)** | `RemoteAction` enum + handlers | Pages subscribe to logical actions (`PLAY_PAUSE`, `BACK`) — never raw keycodes. |

## Adapter contract

```ts
interface PlatformAdapter {
  readonly name: PlatformName;        // 'viziosmartcast' | 'tizen' | ...
  awaitReady(): Promise<void>;        // resolve once native libs are loaded
  getDeviceInfo(): DeviceInfo;        // model / version (post-ready)
  exit(): void;                       // platform-correct exit call
  dispose(): void;                    // teardown for hot-swap / tests
}
```

Each adapter is **20–50 lines**. Vizio is the biggest because it has to wait
for `VIZIO_LIBRARY_DID_LOAD`; the others mostly delegate to
`window.tizen.exit()`, `window.close()`, etc.

## Failure-path discipline

Every async / unsafe path has a defined behavior:

| Path | Behavior | Where |
|---|---|---|
| Vizio companion lib never fires `VIZIO_LIBRARY_DID_LOAD` | `awaitReady()` rejects after 5s; main.ts shows inline error and bails. | [`VizioSmartCastAdapter.ts`](../src/core/platform/adapters/VizioSmartCastAdapter.ts) |
| Detection finds nothing | `PlatformFactory.detect()` returns `DesktopAdapter` (browser dev). For *real* TVs, this means we never reached the device — log + no init. | [`PlatformFactory.ts`](../src/core/platform/PlatformFactory.ts) |
| `localStorage` access throws (rare on TVs) | `FeatureFlagService` falls back to defaults and logs a warning. | [`FeatureFlagService.ts`](../src/services/feature-flags/FeatureFlagService.ts) |
| Vizbee SDK errors | Stubbed today; real impl will route through the same `VizbeeService` so call sites don't change. | [`VizbeeService.ts`](../src/services/vizbee/VizbeeService.ts) |

## Testability hooks

- **Service injection** — `setServices({...})` accepts any object that
  satisfies the `Services` interface. Stub `vizbee` / `platform` /
  `flags` per test.
- **Pure detection** — `PlatformFactory.detect()` reads only from
  `window.*` and UA. Mock `window.VIZIO = {}` to exercise the Vizio path.
- **Pure focus model** — `FocusManager.findNearest()` is a pure function
  of DOM rects and direction. Easy to unit-test with a fake DOM.
- **Adapter `dispose()`** — every adapter releases its listeners; safe
  to construct/destroy repeatedly in tests.

## Adding a new platform

1. **Implement an adapter** in `src/core/platform/adapters/MyPlatformAdapter.ts`
   that conforms to `PlatformAdapter`.
2. **Add detection** in `PlatformFactory.detect()` — check for the platform's
   capability marker; return a new instance.
3. **Add a keymap entry** in `src/core/input/keymaps.ts` — at minimum, map
   the D-pad and BACK key.
4. **Add packaging** under `platforms/<my-platform>/` and a script under
   `scripts/build-<my-platform>.sh`.

That's it — pages and components don't change.

## Adding a new feature flag

1. Add the key + default to [`flags.ts`](../src/services/feature-flags/flags.ts):
   ```ts
   export interface FeatureFlags {
     myNewFlag: boolean;   // ←
     // ...
   }
   export const DEFAULT_FLAGS: FeatureFlags = {
     myNewFlag: false,
     // ...
   };
   export const FLAG_LABELS: Record<FlagKey, string> = {
     myNewFlag: 'My new flag',
     // ...
   };
   ```
2. Read it where you need it: `services().flags.get('myNewFlag')`.
3. The Settings page and `?ff_myNewFlag=true` URL override pick it up
   automatically — no other changes.

## Adding a new page

1. Create `src/features/myPage/MyPage.ts` exporting `renderMyPage(root)`
   and a teardown function.
2. Add route in [`App.ts`](../src/app/App.ts):
   ```ts
   router.register('/mypage', () => renderMyPage(root));
   ```
3. Navigate via `services().router.navigate('/mypage')`.

The router takes care of cleanup (calls the previous page's teardown).
