import { EventEmitter } from '@/core/events/EventEmitter';
import { PlatformAdapter } from '@/core/platform/PlatformAdapter';
import { Logger } from '@/services/logger/Logger';
import { getKeymap, RemoteAction } from './keymaps';

type RemoteEvents = {
  action: { action: RemoteAction; originalEvent: KeyboardEvent };
};

type CaptureHandler = (e: RemoteEvents['action']) => void;

// One global keydown listener; translates keycodes to logical actions and
// broadcasts. Components subscribe to actions, never raw keycodes.
export class RemoteKeyService {
  private readonly emitter = new EventEmitter<RemoteEvents>();
  private readonly keymap: Record<number, RemoteAction>;
  private bound = false;
  private readonly captureStack: CaptureHandler[] = [];
  private readonly log = new Logger('RemoteKeys');

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

  // Exclusive input capture for modal overlays: the active handler receives every
  // action, on(...) subscribers get none. Stacks; returns an idempotent release fn.
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

  // Inject a logical action not from a keydown (e.g. webOS BACK via popstate).
  // Goes through the same capture stack as real keys, so modals still intercept it.
  dispatch(action: RemoteAction, originalEvent?: KeyboardEvent): void {
    const payload = { action, originalEvent: originalEvent ?? new KeyboardEvent('keydown') };
    const captured = this.captureStack[this.captureStack.length - 1];
    this.log.debug('key', action, `code=${originalEvent?.keyCode ?? '-'}`, this.captureStack.length ? '(captured)' : '');
    if (captured) {
      captured(payload);
      return;
    }
    this.emitter.emit('action', payload);
  }

  private handleKey = (e: KeyboardEvent): void => {
    // Let editable elements own their keys (typing, backspace, cursor, on-screen
    // keyboard); otherwise Backspace (mapped to BACK) could never delete a char.
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
