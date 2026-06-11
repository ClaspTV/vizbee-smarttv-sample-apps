---
title: "Vizbee SDK Types Update — Element-less Mode"
date: 2026-06-11
---

# Vizbee SDK Types Update — Element-less Mode

Changes required in `vizbee-sample-webapp` to use the latest
`vtv-lite-app-features` (continuity SDK) and `vizbee-homesso-sdk-smarttv` type
definitions in **element-less mode** (player state pushed manually via
`notifyPlayerState`, no `<video>` element given to the adapter).

---

## 1. Local package references

**File:** `package.json`

Point both SDK dependencies to locally-built `dist/npm-qa` folders.

```json
"dependencies": {
  "@vizbeetv/sdk-qa":         "file:../vtv-lite-app-features-element-less/dist/npm-qa",
  "@vizbeetv/homesso-sdk-qa": "file:../vizbee-homesso-sdk-smarttv/dist/npm-qa"
}
```

To rebuild after SDK source changes:

```bash
# Continuity SDK
cd ../vtv-lite-app-features-element-less
npm run build:sdk:npm:qa

# HomeSSO SDK
cd ../vizbee-homesso-sdk-smarttv
npm run build && npm run build:npm-pkg:qa

# Pick up changes in the webapp
cd vizbee-sample-webapp
npm install
```

---

## 2. Type bridging for `window.vizbee.homesso`

**File:** `src/types/global.d.ts`

The continuity SDK types `window.vizbee` as `SamsungVizbeeSDK` (has `continuity`,
no `homesso`). The homesso SDK registers its namespace separately via
`VizbeeNamespace`. Without bridging, accessing `window.vizbee.homesso` gives a
`TS2339` type error.

**Fix:** augment `VizbeeSDK` (the base interface `SamsungVizbeeSDK` extends) to add
`homesso` as an optional property.

```ts
// Added to src/types/global.d.ts before export {}
import type { HomeSSONamespace } from '@vizbeetv/homesso-sdk-qa';
declare module '@vizbeetv/sdk-qa' {
  interface VizbeeSDK {
    homesso?: HomeSSONamespace;
  }
}
```

Both `window.vizbee.continuity` and `window.vizbee.homesso` are now correctly typed
across the whole project.

---

## 3. `VizbeeService.ts` — element-less mode changes

### 3a. `stopVideo()` removed

`ContinuityContext.stopVideo()` no longer exists in the new types. In element-less
mode it was called inside the stop path after signalling `INTERRUPTED`.

**In `setVideo()` — before registering a new video:**

```ts
// Before
try { ctx.stopVideo(); } catch (_) {}

// After — remove the previous adapter instead
if (this.currentAdapter) {
  try { ctx.removePlayerAdapter(this.currentAdapter); } catch (_) {}
  this.currentAdapter = null;
}
```

**In `setVideoStop()` — element-less path:**

```ts
// Before
(ctx as any).notifyPlayerState(PlayerState.INTERRUPTED);
ctx.stopVideo();               // <-- removed
ctx.removePlayerAdapter(adapter);

// After — stopVideo() call removed
(ctx as any).notifyPlayerState(PlayerState.INTERRUPTED);
ctx.removePlayerAdapter(adapter);
```

---

### 3b. `PlayerAdapter` constructor

The adapter constructor was renamed. The correct constructor for element-less mode
depends on the SDK version loaded at runtime. Use `HTMLPlayerAdapter` presence as
the discriminator.

| SDK version | Element-less constructor |
|---|---|
| Old | `new PlayerAdapter('html')` — type arg only, no element |
| New | `new PlayerAdapter()` — no arguments |

```ts
const adapters = window.vizbee.continuity.adapters as any;
const { PlayerAdapter } = window.vizbee.continuity.adapters;
const isNewSdkApi = !!adapters.HTMLPlayerAdapter;

// Element-less mode
adapter = isNewSdkApi
  ? new PlayerAdapter()                   // new SDK — no args
  : new (PlayerAdapter as any)('html');   // old SDK — type arg, no element
```

> **Why not `BasePlayerAdapter`?**  
> `BasePlayerAdapter` exists in old SDK types but the SDK's internal
> `_isValidPlayerAdapter` check is `instanceof PlayerAdapter`. Instances of
> `BasePlayerAdapter` always fail that check and cause silent errors in
> `notifyPlayerState`. Never use it.

---

### 3c. `VideoStatus.state` — now required

`VideoStatus.state: PlayerState` is a required field in the new types.
Set it inside `setVideoInfoGetter` so the SDK receives a complete status object.

```ts
adapter.setVideoInfoGetter(() => {
  const el = binding.videoEl;
  const s = new window.vizbee!.continuity.messages.VideoStatus();
  s.guid            = sdkGuid;
  s.currentPosition = (el.currentTime || 0) * 1000;
  s.duration        = (el.duration    || 0) * 1000;
  s.isLive          = !!meta.isLive;
  s.state           = el.paused ? 'paused' : 'playing'; // new — required field
  return s;
});
```

---

### 3d. `PlayerState` — `as any` cast removed

`messages.PlayerState` is now properly typed (`MessagesMap.PlayerState: typeof
PlayerState`). The cast in `setVideoStop()` can be removed.

```ts
// Before
const PlayerState = (window.vizbee.continuity.messages as any).PlayerState;

// After
const { PlayerState } = window.vizbee.continuity.messages;
```

---

## 4. `HomeSSOService.ts` — homesso SDK type changes

### 4a. Style reset values: `null` → `undefined`

`CommonModalPreferenceOptions` properties changed from `string | null` to
`string | undefined`. The `DEFAULT_STYLE` reset object must be updated accordingly.

```ts
// Before
const DEFAULT_STYLE = {
  borderColor: null,
  borderWidth: null,
  boxShadow:   null,
  padding:     null,
  edgeMargin:  null,
  borderRadius: null,
};

// After
const DEFAULT_STYLE = {
  borderColor: undefined,
  borderWidth: undefined,
  boxShadow:   undefined,
  padding:     undefined,
  edgeMargin:  undefined,
  borderRadius: undefined,
};
```

### 4b. `vizbeeMessagingClient` is now `private`

The preview shim that injects a no-op messaging client (used when there is no paired
phone) needs an `as any` cast to access the private field.

```ts
// Before
m.vizbeeMessagingClient = m.vizbeeMessagingClient ?? { send: () => {}, addReceiver: () => {} };

// After
(m as any).vizbeeMessagingClient =
  (m as any).vizbeeMessagingClient ?? { send: () => {}, addReceiver: () => {} };
```

---

## Exporting as PDF

**VS Code** — install the *Markdown PDF* extension, open this file, then
`Cmd+Shift+P` → *Markdown PDF: Export (pdf)*.

**Pandoc** (command line):

```bash
pandoc docs/sdk-update-elementless.md -o sdk-update-elementless.pdf \
  --pdf-engine=xelatex \
  -V geometry:margin=2cm \
  -V fontsize=11pt
```
