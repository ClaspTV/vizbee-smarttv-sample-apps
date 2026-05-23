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
- **BACK** on Home triggers `platform.exit()` (in a real app, you'd show
  a "Are you sure?" dialog first).

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

- All flags from [`flags.ts`](../src/services/feature-flags/flags.ts)
  render as toggle rows.
- Toggling persists immediately to `localStorage`.
- Device-info pulls live from the active platform adapter
  (`platform.getDeviceInfo()`).

## Feature flags

[`src/services/feature-flags/`](../src/services/feature-flags/)

### Resolution order (highest priority wins)

```
URL param (?ff_<key>=true)
  ↓
localStorage (vsw.flags.v1)
  ↓
DEFAULT_FLAGS in flags.ts
```

URL params **don't persist**: they override only for the current page-load.
Settings-page toggles persist. This split is intentional: QA can pin a flag
per-load without polluting the device's saved state.

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
  autoplay: boolean;
  debugMode: boolean;
  useShakaPlayer: boolean;
  enableVizbee: boolean;
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

Settings page renders it automatically; `?ff_myNewFlag=true` works
automatically; `services().flags.get('myNewFlag')` is type-checked.

### Built-in flags (this sample)

| Flag | Default | Effect |
|---|---|---|
| `autoplay` | `false` | Player auto-plays on entry (muted, per browser policy). |
| `debugMode` | `false` | Sets logger to `debug` level. |
| `useShakaPlayer` | `false` | Reserved — for swapping `<video>` with Shaka. |
| `enableVizbee` | `true` | Calls `vizbee.init()` on boot and `vizbee.setVideo()` in player. Toggle off to test "Vizbee disabled" path. |

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
