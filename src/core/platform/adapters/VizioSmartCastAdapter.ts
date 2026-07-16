import { PlatformAdapter, DeviceInfo, PlatformName } from '../PlatformAdapter';
import { Logger } from '@/services/logger/Logger';

const VIZIO_READY_EVENT = 'VIZIO_LIBRARY_DID_LOAD';
const VIZIO_READY_TIMEOUT_MS = 5000;

// Waits for the Vizio companion library (window.VIZIO / VIZIO_LIBRARY_DID_LOAD).
// If it never loads (e.g. desktop), resolves with a warning so the app still boots.
export class VizioSmartCastAdapter implements PlatformAdapter {
  readonly name: PlatformName = 'viziosmartcast';
  private readonly log = new Logger('VizioSmartCastAdapter');

  awaitReady(): Promise<void> {
    if (window.VIZIO) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      let done = false;
      const finish = (timedOut: boolean): void => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        document.removeEventListener(VIZIO_READY_EVENT, onReady);
        if (timedOut) {
          this.log.warn(
            `Vizio companion library not loaded within ${VIZIO_READY_TIMEOUT_MS}ms; ` +
              'continuing without it (expected when running a Vizio build outside a SmartCast TV).',
          );
        }
        resolve();
      };

      const onReady = (): void => finish(false);

      this.log.info('awaiting VIZIO_LIBRARY_DID_LOAD (5s budget)');
      document.addEventListener(VIZIO_READY_EVENT, onReady);
      const timer = window.setTimeout(() => finish(true), VIZIO_READY_TIMEOUT_MS);
    });
  }

  getDeviceInfo(): DeviceInfo {
    return { platform: 'viziosmartcast' };
  }

  exit(): void {
    if (window.VIZIO?.exitApplication) window.VIZIO.exitApplication();
    else window.close();
  }

  dispose(): void {
    /* no-op */
  }
}
