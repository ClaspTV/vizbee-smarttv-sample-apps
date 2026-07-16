import { RemoteKeyService } from './RemoteKeyService';
import { Logger } from '@/services/logger/Logger';

// webOS delivers remote BACK as a history popstate, not a keydown; this seeds a
// sentinel history entry and re-emits BACK as a logical action. No-op elsewhere.
export class HardwareBackButton {
  private started = false;
  private readonly log = new Logger('HardwareBack');

  constructor(private readonly keys: RemoteKeyService) {}

  start(): void {
    if (this.started) return;
    this.started = true;
    this.arm();
    // Defer attach past the boot task: some webOS builds emit a spurious
    // popstate at launch that would otherwise fire BACK on startup.
    setTimeout(() => {
      if (this.started) window.addEventListener('popstate', this.onPopState);
    }, 0);
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    window.removeEventListener('popstate', this.onPopState);
  }

  // Push a sentinel so the next Back press pops this instead of leaving the app.
  private arm(): void {
    history.pushState({ __vsbBackSentinel: true }, '');
  }

  private onPopState = (): void => {
    this.log.debug('popstate → BACK (hardware back)');
    this.arm();
    this.keys.dispatch('BACK');
  };
}
