import { EventEmitter } from '@/core/events/EventEmitter';
import { Logger } from '@/services/logger/Logger';

type LifecycleEvents = {
  foreground: void;
  background: void;
  exit: void;
};

// Wraps platform-specific visibility / pause / resume into one consistent API,
// so subscribers needn't know the underlying signal (visibilitychange, Tizen, etc.).
export class LifecycleManager {
  private readonly emitter = new EventEmitter<LifecycleEvents>();
  private readonly log = new Logger('LifecycleManager');
  private bound = false;

  start(): void {
    if (this.bound) return;
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('pagehide', this.onPageHide);
    window.addEventListener('beforeunload', this.onBeforeUnload);
    this.bound = true;
  }

  stop(): void {
    if (!this.bound) return;
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('pagehide', this.onPageHide);
    window.removeEventListener('beforeunload', this.onBeforeUnload);
    this.bound = false;
  }

  on<K extends keyof LifecycleEvents>(event: K, l: () => void): () => void {
    return this.emitter.on(event, l as never);
  }

  private onVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') {
      this.log.info('foreground');
      this.emitter.emit('foreground', undefined);
    } else {
      this.log.info('background');
      this.emitter.emit('background', undefined);
    }
  };

  private onPageHide = (): void => {
    this.log.info('exit (pagehide)');
    this.emitter.emit('exit', undefined);
  };

  private onBeforeUnload = (): void => {
    this.log.info('exit (beforeunload)');
    this.emitter.emit('exit', undefined);
  };
}
