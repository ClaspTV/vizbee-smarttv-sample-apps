---
title: "Vizbee SDK Types Update — Element Mode"
date: 2026-06-11
---

# Vizbee SDK Types Update — Element Mode

Changes required in `vizbee-sample-webapp` to use the latest
`vtv-lite-app-features` (continuity SDK) and `vizbee-homesso-sdk-smarttv` type
definitions in **element mode** (standard `<video>` element adapter).

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

## 3. `VizbeeService.ts` — element mode changes

### 3a. `stopVideo()` removed

`ContinuityContext.stopVideo()` no longer exists in the new types. In element mode it
was called in two places.

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

**In `setVideoStop()`:**

```ts
// Before
ctx.stopVideo();
if (this.currentAdapter) {
  ctx.removePlayerAdapter(this.currentAdapter);
  this.currentAdapter = null;
}

// After — stopVideo() call removed; removePlayerAdapter handles cleanup
if (this.currentAdapter) {
  ctx.removePlayerAdapter(this.currentAdapter);
  this.currentAdapter = null;
}
```

---

### 3b. `PlayerAdapter` constructor

The adapter constructor was renamed. The correct constructor for element mode depends
on the SDK version loaded at runtime. Use `HTMLPlayerAdapter` presence as the
discriminator.

| SDK version | Element mode constructor |
|---|---|
| Old | `new PlayerAdapter('html', videoEl)` |
| New | `new HTMLPlayerAdapter(videoEl)` |

```ts
const adapters = window.vizbee.continuity.adapters as any;
const { PlayerAdapter } = window.vizbee.continuity.adapters;
const isNewSdkApi = !!adapters.HTMLPlayerAdapter;

// Element mode
adapter = isNewSdkApi
  ? new adapters.HTMLPlayerAdapter(binding.videoEl)    // new SDK
  : new (PlayerAdapter as any)('html', binding.videoEl); // old SDK
```

> **Why not `BasePlayerAdapter`?**  
> `BasePlayerAdapter` exists in old SDK types but the SDK's internal
> `_isValidPlayerAdapter` check is `instanceof PlayerAdapter`. Instances of
> `BasePlayerAdapter` always fail that check. Never use it.

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
pandoc docs/sdk-update-element.md -o sdk-update-element.pdf \
  --pdf-engine=xelatex \
  -V geometry:margin=2cm \
  -V fontsize=11pt
```
