import { RemoteKeyService } from '@/core/input/RemoteKeyService';
import { RemoteAction } from '@/core/input/keymaps';
import { Logger } from '@/services/logger/Logger';

// Spatial navigation: on UP/DOWN/LEFT/RIGHT, find the nearest focusable element
// in that direction. Elements opt in via the `data-focusable` attribute.
//
// Why homegrown: TV apps need predictable focus, no scroll-jacking, and a tiny
// runtime budget. Off-the-shelf libs add 20–40 KB and assume DOM scrollIntoView.
//
// Selection rule:
//   1. Filter to candidates whose center lies in a ~126° cone around the
//      requested axis (orthogonal/primary ratio <= CONE_RATIO). This blocks
//      candidates that are "more vertical than horizontal" from being picked
//      on a LEFT/RIGHT press (and vice versa) — even when subpixel rounding
//      makes their on-axis delta non-zero.
//   2. Among the survivors, score = primary distance + 2×orthogonal distance.
//      Lowest score wins.
//   3. Ignore zero-area / off-screen elements (transitions in flight).

const MIN_AXIS_TOLERANCE_PX = 4; // dx/dy must be at least this large to count as "in direction"
const CONE_RATIO = 2;            // |orthogonal| / |primary| upper bound

type FocusZone = 'menu' | 'content';

export class FocusManager {
  private current: HTMLElement | null = null;
  private off: (() => void) | null = null;
  private paused = false;

  // Track the last content-zone element so menu→content (RIGHT) restores it.
  // Within content (e.g., LEFT between cards) we *don't* want any memory —
  // pure spatial-nav-to-next-visible is the right behavior there.
  private lastContentFocus: HTMLElement | null = null;
  private readonly log = new Logger('Focus');

  constructor(private readonly keys: RemoteKeyService) {}

  start(): void {
    this.off = this.keys.on(({ action }) => this.handle(action));
  }

  stop(): void {
    this.off?.();
    this.off = null;
  }

  /** Suspend spatial navigation. Use during immersive views (e.g., Player)
   * where LEFT/RIGHT mean seek, not focus move. */
  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  /** Move focus to the first focusable element in the page (or restore). */
  focusFirst(): void {
    const focusables = this.collect();
    if (focusables.length > 0) this.setFocus(focusables[0]);
  }

  setFocus(el: HTMLElement): void {
    if (this.current === el) return;
    this.log.debug('focus', el.getAttribute('aria-label') || el.className || el.tagName);
    this.current?.classList.remove('is-focused');
    this.current?.setAttribute('tabindex', '-1');
    this.current = el;
    el.classList.add('is-focused');
    el.setAttribute('tabindex', '0');
    el.focus({ preventScroll: true });
    // Manual scroll. scrollIntoView({block:'center'}) is unreliable on older
    // TV browsers (Vizio SmartCast's WebKit silently no-ops in some
    // versions), so we walk up scrollable ancestors and compute the scroll
    // ourselves: vertical scroll containers get the element centered (TV
    // pattern: focused row in the middle, neighbors peek above/below);
    // horizontal containers — typically the rail — scroll only as needed.
    FocusManager.scrollFocusedIntoView(el);
    const zone = FocusManager.zoneOf(el);
    if (zone === 'content') {
      this.lastContentFocus = el;
    }
    // Collapse the side nav while the user is in content. Press LEFT at the
    // leftmost focusable in content to slide the menu back in (spatial nav
    // picks a menu item, which flips zone back to 'menu' on next setFocus).
    document.querySelector('.app-layout')
      ?.classList.toggle('app-layout--menu-collapsed', zone === 'content');
  }

  private static scrollFocusedIntoView(el: HTMLElement): void {
    // The app is rendered inside a transform: scale(--app-scale). DOMRects
    // are in *visual* pixels (post-transform); scrollTop/Left are in
    // *layout* pixels (pre-transform). Convert visual deltas back to
    // layout space by dividing by the current scale.
    const scale = FocusManager.getAppScale();
    // Vertical anchor: if the focused element sits inside a
    // [data-scroll-anchor] block (e.g., a rail row), align that block's
    // TOP to the scroll container's top instead of centering the focused
    // element. This avoids half-visible neighbor rows when stepping
    // between rails — neighbors either fully show or fully scroll off.
    const anchor = (el.closest('[data-scroll-anchor]') as HTMLElement | null) ?? el;
    let parent = el.parentElement;
    while (parent && parent !== document.body) {
      const style = window.getComputedStyle(parent);
      if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
        if (anchor !== el) FocusManager.alignTopInContainer(anchor, parent, scale);
        else FocusManager.centerInContainer(el, parent, 'y', scale);
      }
      if (style.overflowX === 'auto' || style.overflowX === 'scroll') {
        FocusManager.scrollNearest(el, parent, 'x', scale);
      }
      parent = parent.parentElement;
    }
  }

  // Align the anchor's top edge to the scroll container's top edge.
  private static alignTopInContainer(anchor: HTMLElement, container: HTMLElement, scale: number): void {
    const aRect = anchor.getBoundingClientRect();
    const cRect = container.getBoundingClientRect();
    const visual = aRect.top - cRect.top;
    if (Math.abs(visual) > 4) container.scrollTop += visual / scale;
  }

  private static getAppScale(): number {
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue('--app-scale')
      .trim();
    const n = parseFloat(v);
    return isFinite(n) && n > 0 ? n : 1;
  }

  // Vertical: center the element in its scroll container.
  private static centerInContainer(el: HTMLElement, container: HTMLElement, axis: 'x' | 'y', scale: number): void {
    const elRect = el.getBoundingClientRect();
    const cRect = container.getBoundingClientRect();
    if (axis === 'y') {
      const visual = elRect.top + elRect.height / 2 - (cRect.top + cRect.height / 2);
      if (Math.abs(visual) > 4) container.scrollTop += visual / scale;
    } else {
      const visual = elRect.left + elRect.width / 2 - (cRect.left + cRect.width / 2);
      if (Math.abs(visual) > 4) container.scrollLeft += visual / scale;
    }
  }

  // Horizontal: scroll only as needed (don't yank cards already in view).
  private static scrollNearest(el: HTMLElement, container: HTMLElement, axis: 'x' | 'y', scale: number): void {
    const elRect = el.getBoundingClientRect();
    const cRect = container.getBoundingClientRect();
    if (axis === 'x') {
      if (elRect.left < cRect.left) container.scrollLeft -= (cRect.left - elRect.left) / scale;
      else if (elRect.right > cRect.right) container.scrollLeft += (elRect.right - cRect.right) / scale;
    } else {
      if (elRect.top < cRect.top) container.scrollTop -= (cRect.top - elRect.top) / scale;
      else if (elRect.bottom > cRect.bottom) container.scrollTop += (elRect.bottom - cRect.bottom) / scale;
    }
  }

  private static zoneOf(el: HTMLElement): FocusZone {
    return el.closest('.nav-menu') ? 'menu' : 'content';
  }

  private isUsable(el: HTMLElement | null): boolean {
    return !!el && el.isConnected && el.hasAttribute('data-focusable');
  }

  private handle(action: RemoteAction): void {
    if (this.paused) return;
    if (action !== 'UP' && action !== 'DOWN' && action !== 'LEFT' && action !== 'RIGHT') {
      return;
    }
    if (!this.current) {
      this.focusFirst();
      return;
    }

    // Focused element can keep an axis for itself by setting
    // data-claim-axes="x" / "y" / "xy". Used by the player's progress bar
    // so LEFT/RIGHT seek instead of moving focus.
    const claim = this.current.dataset.claimAxes ?? '';
    const axis = action === 'LEFT' || action === 'RIGHT' ? 'x' : 'y';
    if (claim.includes(axis)) return;

    // Focus memory only for menu → content (RIGHT). Within content (cards in
    // a rail, toggles in a list), pure spatial nav gives the user "next
    // visible element", which is what they actually want.
    if (
      action === 'RIGHT' &&
      FocusManager.zoneOf(this.current) === 'menu' &&
      this.isUsable(this.lastContentFocus)
    ) {
      this.setFocus(this.lastContentFocus!);
      return;
    }

    const next = this.findNearest(this.current, action);
    if (next) this.setFocus(next);
  }

  private collect(): HTMLElement[] {
    return Array.from(document.querySelectorAll<HTMLElement>('[data-focusable]'));
  }

  private findNearest(from: HTMLElement, dir: RemoteAction): HTMLElement | null {
    const fromRect = from.getBoundingClientRect();
    const fromCx = fromRect.left + fromRect.width / 2;
    const fromCy = fromRect.top + fromRect.height / 2;

    // Vertical navigation (UP/DOWN) stays strictly within the current zone:
    // a card press of UP can never land on a menu item, and DOWN from
    // Settings can never spill into a content card. Cross-zone movement is
    // reserved for LEFT/RIGHT — LEFT from the leftmost content focusable
    // picks a menu item (only menu items are still in the LEFT direction
    // from there), and RIGHT from a menu item returns to lastContentFocus.
    const fromZone = FocusManager.zoneOf(from);
    const isVertical = dir === 'UP' || dir === 'DOWN';

    // Two-tier selection. In-cone candidates win when they exist; out-of-
    // cone candidates are kept as a fallback so navigation never silently
    // fails when nothing is "in column" (e.g., UP from a far-right card to
    // a left-aligned Play button — out of the strict cone but the obviously
    // correct target).
    let inCone: { el: HTMLElement; score: number } | null = null;
    let outOfCone: { el: HTMLElement; score: number } | null = null;

    for (const el of this.collect()) {
      if (el === from) continue;
      if (isVertical && FocusManager.zoneOf(el) !== fromZone) continue;
      const r = el.getBoundingClientRect();
      // Skip elements that haven't been laid out yet (display:none, in
      // mid-transition with width/height 0, etc.).
      if (r.width === 0 && r.height === 0) continue;

      const dx = r.left + r.width / 2 - fromCx;
      const dy = r.top + r.height / 2 - fromCy;
      const adx = Math.abs(dx);
      const ady = Math.abs(dy);

      // Direction gate — candidate must clearly be on the requested side.
      let inDirection = false;
      let primary = 0;
      let orthogonal = 0;
      let coneOk = false;
      switch (dir) {
        case 'RIGHT':
          inDirection = dx > MIN_AXIS_TOLERANCE_PX;
          primary = adx; orthogonal = ady;
          coneOk = ady <= adx * CONE_RATIO;
          break;
        case 'LEFT':
          inDirection = dx < -MIN_AXIS_TOLERANCE_PX;
          primary = adx; orthogonal = ady;
          coneOk = ady <= adx * CONE_RATIO;
          break;
        case 'DOWN':
          inDirection = dy > MIN_AXIS_TOLERANCE_PX;
          primary = ady; orthogonal = adx;
          coneOk = adx <= ady * CONE_RATIO;
          break;
        case 'UP':
          inDirection = dy < -MIN_AXIS_TOLERANCE_PX;
          primary = ady; orthogonal = adx;
          coneOk = adx <= ady * CONE_RATIO;
          break;
      }
      if (!inDirection) continue;

      const score = primary + orthogonal * 2;
      const slot = coneOk ? 'in' : 'out';
      const ref = slot === 'in' ? inCone : outOfCone;
      if (!ref || score < ref.score) {
        if (slot === 'in') inCone = { el, score };
        else outOfCone = { el, score };
      }
    }

    return inCone?.el ?? outOfCone?.el ?? null;
  }
}
