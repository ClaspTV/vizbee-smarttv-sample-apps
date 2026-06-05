# Features

## Persistent menu

A left-rail menu lives across all routes. Collapsed (88px) by default, it
expands (260px) when any of its items receives focus.

```
┌──────────┐                                  ┌──────────────────┐
│          │                                  │                  │
│   VSW    │                                  │   VSW            │
│          │                                  │                  │
│   ⌂      │     ←  collapsed (default)       │   ⌂  Home        │   ← expanded (focused)
│   ☺      │                                  │   ☺  Profile     │
│   ⚙      │                                  │   ⚙  Settings    │
│          │                                  │                  │
└──────────┘                                  └──────────────────┘
```

- **Always reachable via D-pad LEFT** from any leftmost content element —
  the spatial focus manager picks it up naturally because it lives at
  `x = 0`.
- **Active route highlight** — the matching item gets an `is-active`
  visual treatment so the user always knows where they are.
- **Hidden during the Player** — the layout adds an `--immersive` class
  that slides the menu out so playback fills the screen. Press `BACK` to
  return to Home; the menu reappears.

Implementation: [`src/components/NavMenu.ts`](../src/components/NavMenu.ts)
+ layout shell in [`src/styles/layout.css`](../src/styles/layout.css).

## Pages

### Home (`/home`)

```
┌─────────────────────────────────────────────────────────────┐
│  ╭──────────╮                                               │
│  │ FEATURED │                                               │
│  ╰──────────╯                                               │
│                                                             │
│   Big Buck Bunny                                            │
│   ───────────────                                           │
│   A lone, gentle rabbit faces three rodent bullies in       │
│   this Blender Foundation classic.                          │
│                                                             │
│   [▶ Play now]  [Settings]                                  │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│   Continue exploring                                        │
│                                                             │
│   ┌────────┐  ┌────────┐  ┌────────┐                        │
│   │ Card 1 │  │ Card 2 │  │ Card 3 │   →                    │
│   └────────┘  └────────┘  └────────┘                        │
└─────────────────────────────────────────────────────────────┘
```

- **Hero** mirrors the focused video. Starts with the first video as
  featured; as the user moves focus across cards in the rail below, the
  hero's title, description, background image, and Play CTA target all
  update to the focused video. Text fades in briefly on each swap so the
  change feels intentional. Cleanest TV pattern — the user sees a preview
  of whatever is highlighted.
- **Primary CTA** (`▶ Play now`) auto-receives focus on entry, plays
  whichever video is currently in the hero.
- **Carousel** ("Continue exploring") with all 3 videos, horizontal scroll
  + scroll-snap. Spatial focus moves naturally between hero buttons and
  cards via D-pad.
- **BACK** on Home opens an **"Exit app?"** confirmation (focus defaults to
  *Stay* so an accidental press is safe); confirming calls `platform.exit()`.

### Player (`/player/:id`)

```
┌─────────────────────────────────────────────────────────────┐
│  Sintel                                                     │
│  ──────                                                     │
│  A young girl named Sintel searches for her dragon          │
│  companion in this animated short.                          │
│                                                             │
│                                                             │
│                  [   video plays   ]                        │
│                                                             │
│                                                             │
│                                                             │
│  3:14 / 14:48                                               │
│  ████████████████░░░░░░░░░░░░░░░░░░░░                       │
└─────────────────────────────────────────────────────────────┘
```

Native `<video>` element. Overlay (gradient + metadata + scrub bar) shows
on entry, **auto-hides after 3.5s of no input**, and reappears on any
remote action.

Remote control mapping inside Player:

| Action | Remote key (any platform) | Behavior |
|---|---|---|
| `PLAY` / `PAUSE` / `PLAY_PAUSE` | Media keys / Space | Toggle playback |
| `ENTER` | OK | Toggle playback |
| `LEFT` / `REWIND` | ← / ⏪ | Seek −10s |
| `RIGHT` / `FAST_FORWARD` | → / ⏩ | Seek +10s |
| `STOP` / `BACK` | ⏹ / Esc / Backspace | Stop, go back to Home |

The Player calls `vizbee.setVideo({...})` on entry and
`vizbee.setVideoStop()` on teardown — that's the integration seam.

### Settings (`/settings`)

```
┌─────────────────────────────────────────────────────────────┐
│  Settings                                                   │
│  ────────                                                   │
│  Toggle features for this device. Changes are saved         │
│  instantly.                                                 │
│                                                             │
│  FEATURE FLAGS                                              │
│  ┌──────────────────────────────────────────────┐  ▢───●    │
│  │ Autoplay videos                              │  ●───▢    │
│  └──────────────────────────────────────────────┘           │
│  ┌──────────────────────────────────────────────┐           │
│  │ Debug mode                                   │  ▢───●    │
│  └──────────────────────────────────────────────┘           │
│  ...                                                        │
│                                                             │
│  DEVICE                                                     │
│  Platform   tizen                                           │
│  Model      UN65MU8000                                      │
│  App        Vizbee Sample Webapp                            │
│                                                             │
│  [← Back to home]                                           │
└─────────────────────────────────────────────────────────────┘
```

- All flags from [`flags.ts`](../src/services/feature-flags/flags.ts) render
  automatically — boolean flags as toggles, enum flags as radio groups.
- Changes persist immediately to `localStorage`. Selecting a new **Vizbee SDK**
  build additionally prompts a reload (the SDK script loads once at boot).
- Device-info pulls live from the active platform adapter
  (`platform.getDeviceInfo()`).

### Profile (`/profile`)

```
┌─────────────────────────────────────────────────────────────┐
│  Profile                                                    │
│  ───────                                                    │
│  Your HomeSSO sign-in for this device.                      │
│                                                             │
│   ╭─────╮   Demo User                                       │
│   │  D  │   demo@vizbee.tv                                  │
│   ╰─────╯   Signed in via email                             │
│                                                             │
│   [ Sign out ]                                              │
└─────────────────────────────────────────────────────────────┘
```

Shows the **HomeSSO account** for the device and offers **Sign out**. When
signed out it explains the mobile sign-in flow; while a sign-in is in flight it
displays the **reg code** the user enters on their phone. Sign-in itself is
driven entirely from the phone — there is no on-TV sign-in button.

The page subscribes to `HomeSSOService.onAuthChange` and rebuilds in place, so it
reflects sign-in / sign-out live. See the HomeSSO sign-in flow below.
Implementation: [`src/features/profile/ProfilePage.ts`](../src/features/profile/ProfilePage.ts).

## HomeSSO sign-in

[`src/services/homesso/`](../src/services/homesso/)

HomeSSO lets a user who is signed in on their **phone** push that sign-in to the
**TV** over the Vizbee continuity session — no on-TV keyboard entry. The SDK
(`@vizbeetv/homesso-sdk`, loaded as a `<script>` alongside the continuity SDK)
owns the **toasts** and the **mobile messaging**; the **app owns the account**.

### What the SDK gives you vs. what the app owns

The SDK has **no** current-user store, state events, or sign-out. It only:

1. **pulls** the device's current sign-in state — `setSignInInfoGetter(async () => VizbeeSignInInfo[])`,
2. **delegates** an incoming mobile sign-in request — `setSignInHandler((signInInfo, statusCallback) => …)`,
3. **renders** the informational / progress / success toasts as you report status,
4. connects to the continuity session on `manager.init()`.

So the app supplies the missing half — an **app-owned account store**
([`HomeSSOAuthStore`](../src/services/homesso/HomeSSOAuthStore.ts)): it persists
who's signed in (localStorage `vsw.homesso.account.v1`), feeds the info getter,
and notifies the Profile page on change.

### Flow

The handler runs the Vizbee HomeSSO **device-code** flow against
`homesso.vizbee.tv` — the same contract as the Roku sample's
`VizbeeHomeSSOSignInAdapter`:

```
mobile sends sign-in  ──▶  setSignInHandler(info, statusCallback)
        │
        │  POST /v1/accountregcode { deviceId } → { code }
        ▼
  statusCallback(ProgressStatus(type, { regcode: code }))  ──▶ progress toast + Profile reg code
        │                                                       (code relayed to the phone)
        │  POST /v1/accountregcode/poll { deviceId, regCode }  every 2s, up to 90s
        │      → { status: 'done', authToken, email }
        ▼
  AuthStore.signedIn({ login: email, authToken })  ──▶ Profile flips to signed-in
  statusCallback(SuccessStatus(type, email, { email }))  ──▶ success toast
```

| Call | Method · path | Body | Response |
|---|---|---|---|
| Reg code | `POST /v1/accountregcode` | `{ deviceId }` | `{ code }` |
| Poll | `POST /v1/accountregcode/poll` | `{ deviceId, regCode }` | `{ status, authToken, email }` (`status:'done'` = complete) |
| Sign-out | `POST /v1/signout` | `{}` + `Authorization: <authToken>` | (ignored) |

`deviceId` is a stable per-install id (`<platform>:<uuid>`, persisted in
`localStorage`), prefixed like Roku's `roku:<channelClientId>`. The poll loop runs
every 2s for up to 90s; a newer request or sign-out supersedes an in-flight poll
(generation counter). Sign-out drops local state and calls `/v1/signout` with the
stored `authToken`.

`manager.init()` connects to the continuity session and **throws without**
`window.vizbee.continuity` — so the handler only fires on a TV platform with a
**paired mobile sender**. `HomeSSOService` wires it only when continuity is
present; on desktop it logs "preview only" (no sign-in path). Backend calls also
require `homesso.vizbee.tv` to permit the app origin (CORS).

The **Settings → "HomeSSO modal preview"** toggles are separate — they fire the
SDK's three toasts with dummy data for styling work and don't touch the account.

## Feature flags

[`src/services/feature-flags/`](../src/services/feature-flags/)

### Resolution order (highest priority wins)

```
URL param (?ff_<key>=value)
  ↓
localStorage (vsw.flags.v2)
  ↓
DEFAULT_FLAGS in flags.ts
```

URL params **don't persist**: they override only for the current page-load.
Settings-page changes persist. This split is intentional: QA can pin a flag
per-load without polluting the device's saved state.

Both boolean and enum flags work as URL overrides: `?ff_debugMode=true`,
`?ff_vizbeeSdk=light-es6`. Enum values are validated against the flag's options
(`FLAG_OPTIONS`) — an unknown value is ignored rather than applied.

### Reading a flag

```ts
import { services } from '@/services/ServiceContainer';

if (services().flags.get('autoplay')) {
  videoEl.autoplay = true;
}
```

### Reacting to a flag change

```ts
const off = services().flags.on(({ key, value }) => {
  if (key === 'debugMode') applyDebugVisuals(value);
});
// later: off();
```

### Adding a flag

One file, three lines:

```ts
// src/services/feature-flags/flags.ts
export interface FeatureFlags {
  debugMode: boolean;
  vizbeeSdk: 'full-es5' | 'full-es6' | 'light-es5' | 'light-es6';
  videoPlayer: 'html';
  myNewFlag: boolean;             // ← add
}

export const DEFAULT_FLAGS: FeatureFlags = {
  // ...
  myNewFlag: false,               // ← add
};

export const FLAG_LABELS: Record<FlagKey, string> = {
  // ...
  myNewFlag: 'My new flag',       // ← add (shown on Settings page)
};
```

Settings page renders it automatically (a toggle for booleans);
`?ff_myNewFlag=true` works automatically; `services().flags.get('myNewFlag')` is
type-checked.

For an **enum flag**, type it as a string union and add a matching
`FLAG_OPTIONS[key]` array of `{ value, label }`. It then renders as a radio
group, and its URL overrides are validated against those values.

### Built-in flags (this sample)

| Flag | Type / default | Effect |
|---|---|---|
| `vizbeeSdk` | `full-es5` \| `full-es6` \| `light-es5` \| `light-es6` · `light-es5` | Which Vizbee SDK build loads (full/light × ES5/ES6, Tizen & webOS). Wired in `VizbeeService`; changing it prompts a reload. **Build-aware "Vizbee SDK" row:** these options show on the **script** build; on the **npm** build the row shows `npmModule` (ES5/ES6) instead. See [vizbee-sdk.md](vizbee-sdk.md). |
| `videoPlayer` | `html` · `html` | Player implementation. Single HTML `<video>` option today; reserved for adding alternatives. |
| `appBuild` | `script` \| `npm` · `script` | Which hosted app build to run — `script` (external-`<script>` SDK, `…/webos/`) vs `npm` (node_modules-bundled SDK, `…/webos-with-nodemodule/<module>/`). Selecting it reloads into that build's URL on webOS/Tizen (same origin, so the flag carries over). No-op on desktop/dev. See [`appBuild.ts`](../src/core/platform/appBuild.ts). |
| `npmModule` | `es5` \| `es6` · `es5` | npm build only: which bundled module folder to load (`…/webos-with-nodemodule/es5` vs `/es6`). Has no row of its own — it's the build-aware "Vizbee SDK" row when running the npm build. Selecting it redirects to that module's URL. |

Enum-typed flags (those with entries in `FLAG_OPTIONS`) render as a **radio
group**; boolean flags render as a **toggle**.

## Vizbee SDK seam

[`src/services/vizbee/VizbeeService.ts`](../src/services/vizbee/VizbeeService.ts)

The whole sample app already calls a `VizbeeService` instance. Today, those
calls log and no-op. Replacing the body with real SDK calls is the entire
integration:

```ts
// before
import { Logger } from '@/services/logger/Logger';
export class VizbeeService implements IVizbeeService {
  private readonly log = new Logger('VizbeeService');
  init(appId: string): void { this.log.info('STUB init', { appId }); }
  setVideo(v: VizbeeVideoInfo): void { this.log.info('STUB setVideo', v); }
  setVideoStop(): void { this.log.info('STUB setVideoStop'); }
  reset(): void { this.log.info('STUB reset'); }
}

// after
import vizbee from '@vizbee/sdk';
export class VizbeeService implements IVizbeeService {
  init(appId: string): void {
    vizbee.continuity.start(appId);
  }
  setVideo(v: VizbeeVideoInfo): void {
    const info = new vizbee.continuity.messages.VideoInfo();
    info.guid = v.id;
    info.title = v.title;
    info.videoUrl = v.url;
    info.isLive = !!v.isLive;
    info.startTime = v.startTimeSec ?? 0;
    vizbee.continuity.setVideoInfo(info);
  }
  setVideoStop(): void {
    vizbee.continuity.stopVideo();
  }
  reset(): void {
    vizbee.continuity.reset();
  }
}
```

Pages and components don't change. The `enableVizbee` flag short-circuits
the entire integration if turned off — useful for isolating sender/receiver
issues during testing.

## Roadmap (suggestions, not implemented)

- Hero auto-rotation (current: static first video).
- Long-press FAST_FORWARD/REWIND for chapter skip.
- Subtitle and audio-track menu in Player overlay.
- Continuity resume — read `?startTime=` from launch URL and seek on play.
- Real device-info pulls (Vizio model code, Tizen product info, webOS deviceInfo)
  on the Settings page — adapters expose `getDeviceInfo()`; today only Tizen
  fills in `model`.
