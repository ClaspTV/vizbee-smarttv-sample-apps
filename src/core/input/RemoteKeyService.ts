import { EventEmitter } from '@/core/events/EventEmitter';
import { PlatformAdapter } from '@/core/platform/PlatformAdapter';
import { getKeymap, RemoteAction } from './keymaps';

type RemoteEvents = {
  action: { action: RemoteAction; originalEvent: KeyboardEvent };
};

// One global keydown listener; translates to logical actions and broadcasts.
// Components subscribe to actions, never to raw keycodes — keeps platform
// quirks isolated to keymaps.ts.
export class RemoteKeyService {
  private readonly emitter = new EventEmitter<RemoteEvents>();
  private readonly keymap: Record<number, RemoteAction>;
  private bound = false;

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

  private handleKey = (e: KeyboardEvent): void => {
    const action = this.keymap[e.keyCode];
    if (!action) return;
    e.preventDefault();
    this.emitter.emit('action', { action, originalEvent: e });
  };
}
