# Development

## Local workflow

```bash
npm install
npm run dev          # http://localhost:5173 (DesktopAdapter)
npm run typecheck    # tsc --noEmit
npm run build        # produce dist/
npm run preview      # serve dist/ locally
```

## Project conventions

- **TypeScript everywhere.** No `.js` files in `src/`. Strict mode on;
  `noImplicitAny`, `noUnusedLocals`, `noUnusedParameters` all enforced.
- **No default exports** in core/services/components — named exports only.
  Easier to grep, easier to refactor.
- **Path aliases**: `@/...` resolves to `src/...`. Use the alias once you
  cross more than one folder boundary.
- **CSS lives next to the page or component it styles** (`HomePage.ts` ↔
  `home.css`). Imported once in [`main.ts`](../src/main.ts) so order is
  deterministic.
- **No CSS-in-JS.** Plain CSS with design tokens in
  [`tokens.css`](../src/styles/tokens.css).
- **No inline styles** except for dynamic values that can't be expressed
  in CSS (e.g., a poster `background-image` URL coming from data).

## Debugging on real TVs

### Samsung Tizen
1. Enable Developer Mode (Apps menu, "12345" + IP).
2. Connect via Tizen Studio's Device Manager.
3. `chrome://inspect` (Chrome on your laptop) → "Discover network targets"
   → enter the TV's IP:7011. DevTools attach over remote debugging.

### LG webOS
1. Install the **Developer Mode** app on the TV (LG Content Store).
2. Enable, log in with a developer account.
3. `ares-inspect -d <device>` opens DevTools in your browser.

### VizioSmartCast
- No public devtools. Best you'll get is in-page logging surfaced via the
  Logger and visible if you run a local DevTools session pointed at the
  hosted dev URL on a desktop browser.
- Practical workflow: develop and unit-test on `DesktopAdapter`; flip a
  flag to *simulate* `window.VIZIO` for adapter-specific paths; only
  validate end-to-end on real hardware.

### Xbox
- Enable Developer Mode (one-time activation through Microsoft).
- Use the **Edge DevTools** at `https://<console-ip>:11443`.
- Or attach Visual Studio for richer debugging.

## How to extend

### Add a feature flag → see [features.md](features.md#adding-a-flag)

### Add a platform → see [architecture.md](architecture.md#adding-a-new-platform)

### Add a page

```ts
// src/features/myPage/MyPage.ts
import { services } from '@/services/ServiceContainer';

export function renderMyPage(root: HTMLElement): () => void {
  root.innerHTML = '';
  const page = document.createElement('div');
  page.className = 'my-page';
  page.textContent = 'Hello!';
  root.appendChild(page);

  const off = services().remoteKeys.on(({ action }) => {
    if (action === 'BACK') services().router.back('/home');
  });
  return () => off();   // teardown when router navigates away
}
```

```ts
// src/app/App.ts
router.register('/my-page', () => renderMyPage(root));
```

```ts
// somewhere
services().router.navigate('/my-page');
```

### Add a focusable component

The contract is one attribute:

```ts
const el = document.createElement('button');
el.setAttribute('data-focusable', 'true');
el.setAttribute('tabindex', '-1');   // FocusManager toggles to '0' when focused
// ... fill in content
```

Style the focused state with the `is-focused` class:

```css
.my-thing.is-focused {
  transform: scale(1.06);
  box-shadow: var(--shadow-focus);
}
```

If the component should react to ENTER on the remote, subscribe:

```ts
const off = services().remoteKeys.on(({ action }) => {
  if (action === 'ENTER' && document.activeElement === el) doThing();
});
```

Use a `MutationObserver` on `document.body` to clean up when the element
leaves the DOM (see [`VideoCard.ts`](../src/components/VideoCard.ts) for
the pattern).

### Add a remote action

If you need a key that isn't yet mapped:

1. Add the action name to the `RemoteAction` union in
   [`keymaps.ts`](../src/core/input/keymaps.ts).
2. Add the keycode → action entry to each platform's keymap (and Desktop).
3. Subscribe to it from any page or component.

## Testing strategy

The sample doesn't ship tests (kept lean), but the architecture is
test-ready:

- **Pure functions** like `findVideo()`, `FocusManager.findNearest()`,
  `_isValidDeviceId()` (production code) — unit tests in any runner.
- **Service injection** via `setServices({...})` — drop a fake
  `VizbeeService` / `PlatformAdapter` and assert page behavior.
- **DOM rendering** — JSDOM works for everything except the spatial
  navigation `getBoundingClientRect()` which JSDOM stubs to zero. Use
  Playwright (or Puppeteer with real Chromium) for the focus-flow
  integration tests.

Suggested layout when you add tests:

```
test/
├── unit/                    # *.spec.ts → vitest
└── integration/             # playwright tests against `npm run preview`
```

## Common pitfalls

| Symptom | Likely cause | Fix |
|---|---|---|
| App boots but nothing is focused | First focusable element wasn't in DOM when `focusFirst()` ran | Make sure your render path appends elements *before* setting focus |
| TV BACK key exits the app immediately on Home | Intentional — Home's BACK calls `platform.exit()` | Replace with a confirm dialog if you want |
| Vizio TV shows blank screen | Companion library never fired `VIZIO_LIBRARY_DID_LOAD` within 5s | Check the network — `vizio_companion.js` may have failed to load. Inline error appears in `<body>` |
| Tizen build fails with "no signing profile" | First-time Tizen build on the machine | Tizen Studio → *Tools → Certificate Manager* → create a profile |
| webOS build fails: `ares-package not found` | CLI not installed | `npm i -g @webosose/ares-cli` |
| Xbox app launches but blank | `<uap:ApplicationContentUriRules>` doesn't list your host | Add the host to [`AppxManifest.xml`](../platforms/xbox/AppxManifest.xml) |
| Older TV: scripts fail to parse | TV browser engine pre-ES2017 | Add `@vitejs/plugin-legacy`, lower `build.target` |

## Suggested editor setup

- VS Code with the **TypeScript Vue Plugin** (Volar) and **ESLint** turned on.
- Auto-format on save (Prettier defaults work fine; not enforced in CI for
  the sample).
- File-icon themes that distinguish `.ts` from `.css` are nice given how
  many small files live next to each other.

## CI hints (not implemented)

When you add CI:

```yaml
# pseudo-config
- npm ci
- npm run typecheck
- npm run build
# Tizen / webOS packagers need their CLIs in the runner image.
- if: tizen-cli installed
  run: npm run build:tizen
- if: ares-cli installed
  run: npm run build:webos
```

The build scripts already detect missing CLIs and skip with a warning,
so `npm run build:all` is safe to run on any environment that has at
least Node and Vite.
