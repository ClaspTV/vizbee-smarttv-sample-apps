import { EventEmitter } from '@/core/events/EventEmitter';
import { PlatformAdapter } from '@/core/platform/PlatformAdapter';
import { getKeymap, RemoteAction } from './keymaps';

type RemoteEvents = {
  action: { action: RemoteAction; originalEvent: KeyboardEvent };
};

type CaptureHandler = (e: RemoteEvents['action']) => void;

// One global keydown listener; translates to logical actions and broadcasts.
// Components subscribe to actions, never to raw keycodes — keeps platform
// quirks isolated to keymaps.ts.
export class RemoteKeyService {
  private readonly emitter = new EventEmitter<RemoteEvents>();
  private readonly keymap: Record<number, RemoteAction>;
  private bound = false;
  private readonly captureStack: CaptureHandler[] = [];

  constructor(platform: PlatformAdapter) {
    this.keymap = getKeymap(platform.name);
  }

  start(): void {
    if (this.bound) return;
    window.addEventListener('keydown', this.handleKey, true);
    this.bound = true;
  }

  stop(): void {
    if (!this.bound) return;
    window.removeEventListener('keydown', this.handleKey, true);
    this.bound = false;
  }

  on(listener: (e: RemoteEvents['action']) => void): () => void {
    return this.emitter.on('action', listener);
  }

  // Exclusive input capture for modal overlays. While a handler is active it
  // receives every action and normal on(...) subscribers (FocusManager, pages)
  // get nothing — so a modal owns the remote and BACK/ENTER never leak to the
  // page behind it. Stacks, so nested overlays restore the prior owner on
  // release. Returns an idempotent release fn.
  capture(handler: CaptureHandler): () => void {
    this.captureStack.push(handler);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const i = this.captureStack.lastIndexOf(handler);
      if (i !== -1) this.captureStack.splice(i, 1);
    };
  }

  // Inject a logical action that didn't come from a keydown. webOS delivers
  // the remote BACK button as a history popstate rather than a key event, so
  // HardwareBackButton routes it here. Goes through the same capture stack as
  // real keys, so modals still intercept it.
  dispatch(action: RemoteAction, originalEvent?: KeyboardEvent): void {
    const payload = { action, originalEvent: originalEvent ?? new KeyboardEvent('keydown') };
    const captured = this.captureStack[this.captureStack.length - 1];
    if (captured) {
      captured(payload);
      return;
    }
    this.emitter.emit('action', payload);
  }

  private handleKey = (e: KeyboardEvent): void => {
    // Let editable elements own their keys (text typing, backspace, cursor, and
    // the TV on-screen keyboard). Components that edit text put the field into
    // an explicit "editing" state and exit it on ENTER/BACK, so we never get
    // stuck — see TextField. Without this, e.g. Backspace (mapped to BACK)
    // would never delete a character.
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
      return;
    }
    const action = this.keymap[e.keyCode];
    if (!action) return;
    e.preventDefault();
    this.dispatch(action, e);
  };
}
