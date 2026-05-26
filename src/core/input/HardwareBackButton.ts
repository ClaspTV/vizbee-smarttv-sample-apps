import { RemoteKeyService } from './RemoteKeyService';
import { Logger } from '@/services/logger/Logger';

// LG webOS (and some other TV browsers) deliver the remote BACK button as a
// browser history navigation — a `popstate` — NOT a keydown. RemoteKeyService
// only listens for keydowns, so on those platforms BACK never reaches the app;
// worse, at the history root webOS just exits to its native "close app?"
// dialog before any JS runs.
//
// This bridge seeds a sentinel history entry so a Back press has something to
// pop (firing popstate instead of exiting), then re-arms the sentinel and
// re-emits BACK as a logical action — so the existing per-page handlers (exit
// confirm on Home, back-to-home in Settings/Player, modal cancel) work
// unchanged. Harmless on keydown-based platforms (Tizen/Vizio/Xbox/desktop):
// their BACK never produces a popstate, so onPopState simply never fires.
export class HardwareBackButton {
  private started = false;
  private readonly log = new Logger('HardwareBack');

  constructor(private readonly keys: RemoteKeyService) {}

  start(): void {
    if (this.started) return;
    this.started = true;
    this.arm();
    // Attach on the next task, not synchronously: some webOS builds emit a
    // spurious popstate right at launch. Deferring past the boot task means
    // that one can't fire BACK and pop the exit dialog on startup; a real Back
    // press only happens much later (after user input), well after attach.
    setTimeout(() => {
      if (this.started) window.addEventListener('popstate', this.onPopState);
    }, 0);
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    window.removeEventListener('popstate', this.onPopState);
  }

  // Push a sentinel so the next Back press pops *this* instead of leaving the
  // app. pushState itself never fires popstate, so re-arming can't recurse.
  private arm(): void {
    history.pushState({ __vsbBackSentinel: true }, '');
  }

  private onPopState = (): void => {
    this.log.debug('popstate → BACK (hardware back)');
    this.arm();
    this.keys.dispatch('BACK');
  };
}
