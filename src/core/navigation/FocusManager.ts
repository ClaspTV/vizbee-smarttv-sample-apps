import { RemoteKeyService } from '@/core/input/RemoteKeyService';
import { RemoteAction } from '@/core/input/keymaps';
import { Logger } from '@/services/logger/Logger';

// Spatial navigation: on arrow keys, pick the nearest `data-focusable` element in
// that direction (cone filter, score = primary + 2×orthogonal distance).

const MIN_AXIS_TOLERANCE_PX = 4; // dx/dy must be at least this large to count as "in direction"
const CONE_RATIO = 2;            // |orthogonal| / |primary| upper bound

type FocusZone = 'menu' | 'content';

export class FocusManager {
  private current: HTMLElement | null = null;
  private off: (() => void) | null = null;
  private paused = false;

  // Last content-zone element, so menu→content (RIGHT) restores it. No memory
  // within content — spatial-nav-to-next-visible is correct there.
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

  /** Suspend spatial navigation (e.g., in Player, where LEFT/RIGHT seek). */
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
    // Manual scroll: scrollIntoView is unreliable on older TV browsers, so we
    // walk scrollable ancestors ourselves (vertical centers, horizontal as needed).
    FocusManager.scrollFocusedIntoView(el);
    const zone = FocusManager.zoneOf(el);
    if (zone === 'content') {
      this.lastContentFocus = el;
    }
    // Collapse the side nav while in content; LEFT at the leftmost content
    // focusable picks a menu item and flips the zone back to 'menu'.
    document.querySelector('.app-layout')
      ?.classList.toggle('app-layout--menu-collapsed', zone === 'content');
  }

  private static scrollFocusedIntoView(el: HTMLElement): void {
    // App is rendered inside transform: scale(--app-scale). DOMRects are visual
    // px, scrollTop/Left are layout px — divide visual deltas by scale to convert.
    const scale = FocusManager.getAppScale();
    // If the focused element is inside a [data-scroll-anchor] block, align that
    // block's top instead of centering, to avoid half-visible neighbor rows.
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

    // An element can claim an axis via data-claim-axes ("x"/"y"/"xy") to keep
    // those keys (e.g. player progress bar seeks on LEFT/RIGHT).
    const claim = this.current.dataset.claimAxes ?? '';
    const axis = action === 'LEFT' || action === 'RIGHT' ? 'x' : 'y';
    if (claim.includes(axis)) return;

    // Focus memory only for menu → content (RIGHT); within content, pure
    // spatial nav ("next visible element") is what the user wants.
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

    // UP/DOWN stay within the current zone; cross-zone movement is reserved
    // for LEFT/RIGHT (LEFT into the menu, RIGHT back to lastContentFocus).
    const fromZone = FocusManager.zoneOf(from);
    const isVertical = dir === 'UP' || dir === 'DOWN';

    // Two-tier selection: in-cone candidates win; out-of-cone kept as a fallback
    // so nav never fails when nothing is strictly "in column".
    let inCone: { el: HTMLElement; score: number } | null = null;
    let outOfCone: { el: HTMLElement; score: number } | null = null;

    for (const el of this.collect()) {
      if (el === from) continue;
      if (isVertical && FocusManager.zoneOf(el) !== fromZone) continue;
      const r = el.getBoundingClientRect();
      // Skip elements not yet laid out (display:none, mid-transition, etc.).
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
