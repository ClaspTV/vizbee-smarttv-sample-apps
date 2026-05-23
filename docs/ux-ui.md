# UX / UI

> The sample is built for **the 10-foot user experience**: viewers seated
> across the room, controlling everything with a 6-button remote, on a
> 4K display where small touches read as smudges. Every UI choice here
> reflects that.

## Design principles

1. **Focus is the only state that matters.** On TV there's no hover, no
   touch — the focused element *is* the cursor. We make focus
   unmistakable: scale-up, accent ring, glow.
2. **Big, sparse, calm.** Display-scale type, generous whitespace, slow
   eased motion. Information lives in *fewer, larger* surfaces.
3. **Direction-of-travel maps to D-pad.** Layouts are predominantly
   horizontal rails (LEFT/RIGHT) and vertical sections (UP/DOWN). No
   diagonal jumps that confuse spatial nav.
4. **Auto-hide chrome during play.** The Player's overlay disappears
   after 3.5s; nothing competes with the picture once you're watching.
5. **Animation must be cheap.** All transitions use `transform` and
   `opacity` — never `width` / `top` / `left` — so older TV GPUs hit
   60fps without compositor stalls.

## Design tokens

[`src/styles/tokens.css`](../src/styles/tokens.css)

### Color

| Token | Value | Use |
|---|---|---|
| `--color-bg` | `#07090c` | Page base (deep neutral, low-eye-strain at night) |
| `--color-surface` / `--color-surface-2` | `#161b22` / `#1d242e` | Cards, toggles |
| `--color-text` / `--color-text-muted` / `--color-text-subtle` | `#f5f7fa` / `#98a2b3` / `#6b7280` | Headlines / body / captions |
| `--color-accent` / `--color-accent-strong` | `#1ed679` / `#0cd86c` | Primary CTAs, focus ring (matched to Vizbee logo) |
| `--color-gradient-1` | `linear-gradient(135deg, #5dffb1 → #0cd86c)` | Primary buttons, progress fill, "Featured" badge |
| `--color-success` / `--color-warning` / `--color-danger` | `#4ade80` / `#fbbf24` / `#ff6479` | Semantic |

WCAG contrast: text-on-bg passes AAA at body sizes; muted text passes AA.

### Typography

```
display  88px   bold     hero titles
2xl      56px   bold     player title, settings page title
xl       40px   semibold rail section titles
lg       28px   semibold subheaders
md       22px   medium   body, button labels  ← base
sm       18px   regular  metadata
xs       16px   regular  badges, micro-labels
```

Single font stack, system-default. **No web fonts** — TV browsers handle them
inconsistently and they always cost a network round-trip during the splash
window.

### Spacing

8px grid — `--space-1`...`--space-8` (8 → 128px). All paddings, gaps, and
margins use these tokens. The combined `--safe-area-x: 96px` /
`--safe-area-y: 48px` keeps content clear of TV overscan.

### Motion

| Token | Duration / curve | Use |
|---|---|---|
| `--transition-fast` | `140ms cubic-bezier(.4, 0, .2, 1)` | Color / border changes |
| `--transition-med` | `280ms cubic-bezier(.4, 0, .2, 1)` | Focus scale, card hover, overlay opacity |
| `--transition-slow` | `480ms cubic-bezier(.4, 0, .2, 1)` | Player overlay fade |
| `--ease-bounce` | `cubic-bezier(.34, 1.56, .64, 1)` | Toggle thumb (one of the few "playful" moments) |

## Focus model

[`src/core/navigation/FocusManager.ts`](../src/core/navigation/FocusManager.ts)

### How it works

The principle: **next visible element first, edge of the section escapes
to a sibling section**. Spatial nav handles 99% of cases; one tiny piece
of memory handles the remaining UX nicety (return-to-where-you-were on
menu→content).

1. Components opt in by adding `data-focusable` to the root element.
2. **Spatial filtering** — read all `[data-focusable]` rects, apply a
   **two-stage filter**:
   - **Axis check** — candidate must clearly be past `from` along the axis
     (`dx > 4px` for RIGHT, etc.); rejects the focused element itself and
     subpixel-jitter neighbors.
   - **Cone check** — orthogonal distance must be ≤ 2× primary distance
     (~126° cone). Without this, a same-column element with `dx ≈ 0` and
     `dy = 80` would slip through axis-only filtering and dominate the
     score. *(This was the origin of the early "RIGHT from Settings menu
     went to Home" bug.)*
3. Of the survivors, score = **primary distance + 2 × orthogonal distance**;
   lowest wins.
4. The chosen element gets `is-focused` + `tabindex=0`; the previous one
   is reset.

So LEFT from card 3 picks card 2 (closer), card 1 (after that), then the
menu — naturally, because there's nothing more to the left in content.

5. **One narrow exception — focus memory for menu → content (RIGHT):**
   when the user crosses *out* of the menu into content, restore the last
   content element they had focused, rather than the spatially-nearest
   one. This way, going from a deep toggle on Settings → LEFT to menu →
   UP/DOWN around → RIGHT brings you back to the same toggle. Falls
   through to spatial nav if no memory exists or the remembered element
   was replaced (page swap).

   Memory is **only** for menu → content. Within content, and content →
   menu (LEFT), pure spatial nav is used — that keeps "next visible"
   behavior intact for cards-in-a-rail and toggles-in-a-list.

Exceptions:

- **Player page** calls `services().focus.pause()` on entry — LEFT and
  RIGHT mean *seek*, not focus move, while watching. Resumed on exit.

### Visual treatment

```css
.video-card.is-focused,
.focusable-btn.is-focused,
.toggle.is-focused {
  transform: scale(1.06);                   /* the "lift" */
  border-color: var(--color-accent);        /* color shift */
  box-shadow:
    0 0 0 4px var(--color-focus-ring),      /* solid ring */
    0 0 48px 0 var(--color-accent-glow);    /* soft glow */
}
```

This three-part treatment (lift + ring + glow) is the entire focus language
of the app. No exceptions, no per-component variations — predictability is
the point.

### Why homegrown (not `js-spatial-navigation` / `norigin-spatial-navigation`)

- ~80 lines of code (the entire FocusManager).
- No section / container model to learn — single flat element pool.
- No DOM observers or framework hooks; works with any element that lands
  in the DOM.
- 0 KB added to the bundle.

If your needs grow (nested rails, focus memory per section, virtualized
lists), promote to a library — the `data-focusable` contract stays the same.

## Component anatomy

### NavMenu (persistent left rail)

```
┌────────────────────────┐
│                        │
│   ◐  Vizbee            │  ← brand: SVG logo + wordmark
│                        │
│   ⌂   Home             │  ← active item: tinted icon background, brighter label
│   ⚙   Settings         │
│                        │
└────────────────────────┘

states per item:
  default        muted icon + label, transparent background
  is-active      icon-bg tinted (current route)
  is-focused     lift + accent ring + glow (same focus language as cards)
```

**Fixed width: 240px.** Earlier iterations used a collapse-on-blur / expand-on-
focus design — but the 88 ↔ 260 width transition shifts every menu item's
center by ~86px during the 280ms animation, and spatial navigation reads
mid-transition rects, which made the menu navigationally unstable. A static
width keeps every focusable's bounding rect predictable on every D-pad press.

Backdrop is `rgba(11,13,16,0.6)` with `backdrop-filter: blur(20px)` on engines
that support it; falls back to `rgba(11,13,16,0.96)` on older Chromium.

Hidden entirely during the Player via `.app-layout--immersive`:
`flex-basis: 0` + `translateX(-100%)` so the slide-out feels intentional,
not a clip. Spatial focus is paused at the same time
(`services().focus.pause()`) so LEFT / RIGHT route to seek instead of trying
to move focus into the hidden menu.

### VideoCard

```
┌────────────────────────────┐
│                            │  ← poster (16:9)
│      [poster image]        │     gradient mask appears on focus
│                            │
├────────────────────────────┤
│  Big Buck Bunny            │  ← title (md / semibold)
│  9:56                      │  ← duration (sm / muted)
└────────────────────────────┘

states: default | is-focused (lift + ring + glow + poster gradient)
```

380px wide, fixed; the rail flexes around it. Metadata is rendered as DOM
text (not as part of the poster image) so screen readers and search work.

### FocusableButton

```
┌─ ▶  Play now ─────────────┐    ← pill, gradient bg (primary)
└───────────────────────────┘

[ Settings ]                     ← pill, transparent (ghost)

states: default | is-focused (lift + ring)
variants: --primary (gradient), --ghost (transparent)
```

### Toggle

```
┌──────────────────────────────────────┐  ┌────────┐
│ Autoplay videos                      │  │ ▢───●  │   ← off
└──────────────────────────────────────┘  └────────┘

┌──────────────────────────────────────┐  ┌────────┐
│ Autoplay videos                      │  │ ●───▢  │   ← on (accent bg)
└──────────────────────────────────────┘  └────────┘

states: default | is-focused (lift + ring)
the thumb uses --ease-bounce on flip — the "satisfying click" moment
```

## Page-level UX patterns

### Hero

- Background image is the poster of the featured video at 70% viewport
  height with a strong left-to-right gradient mask
  (`rgba(7,9,12,0.85)` → `0.1`) so the title group reads on any image.
- Primary action ("▶ Play now") receives focus on entry.
- Badge ("Featured") uses the gradient accent to anchor the eye.

### Rail (carousel)

- Native `overflow-x: auto` + `scroll-snap-type: x mandatory`.
- Scrollbar hidden via `::-webkit-scrollbar { display: none }`.
- Scrolling happens **as a side effect of focus** — when the focused card
  moves to one outside the viewport, the browser auto-scrolls.

### Player overlay

- Two stacked gradients (top-down + bottom-up) so metadata at top and
  scrub bar at bottom both stay readable over any frame of video.
- Opacity transitions over 480ms; an `idle` state (`.player-page--idle`)
  is added 3.5s after the last input.
- Any remote action — even `LEFT` / `RIGHT` for seek — un-hides it.

### Settings sections

- Each section starts with a small uppercase, letter-spaced title
  (`UPPERCASE / 0.08em / 28px`). This is the "iOS Settings"-style
  visual anchor.
- Toggle rows are full-width inside a 900px content column — never edge-
  to-edge.
- Device info is a `<dl>` with a 2-column grid (label / value) — semantic
  and easy to extend with more rows.

## Accessibility

- All focusables are real `<button>` elements: native ARIA, native Enter
  activation, native screen-reader semantics.
- Toggles use `aria-pressed` to communicate state.
- Color contrast meets WCAG AA at minimum, AAA for body text.
- Focus indication is **never** color-only — it always includes scale
  and ring shape.
- The auto-hide overlay re-appears on *any* key — no input is silently
  swallowed.

## Performance

- ES2017 target, plain DOM, no framework runtime.
- All animated properties are `transform` / `opacity`. No layout
  thrash on focus changes.
- Posters use `background-image` (lazy-decoded, no extra DOM); titles
  remain real text.
- Single global `keydown` listener (`RemoteKeyService`); pages
  subscribe to logical actions only.
- Single global `MutationObserver` per ephemeral component for
  cleanup — releases its event subscriptions when removed from DOM.

## Visual language summary

If you have to remember one thing about the look-and-feel:

> Calm, dark surfaces. One accent. Big type. Three-part focus
> (lift + ring + glow). 280ms ease-out for everything that moves.
