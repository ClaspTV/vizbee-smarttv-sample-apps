import { PlatformAdapter, DeviceInfo, PlatformName } from '../PlatformAdapter';
import { Logger } from '@/services/logger/Logger';

const VIZIO_READY_EVENT = 'VIZIO_LIBRARY_DID_LOAD';
const VIZIO_READY_TIMEOUT_MS = 5000;

// Detect VizioSmartCast strictly via window.VIZIO. The companion library
// <script> is injected into index.html by the Vizio build (see
// vite.config.ts → vizioCompanionScript plugin); here we just wait for it
// to populate window.VIZIO and fire VIZIO_LIBRARY_DID_LOAD.
//
// Graceful degradation: if the lib never shows up — the common case when a
// Vizio build is opened in a desktop browser for testing, since the lib
// URL only resolves on the TV's own loopback — we resolve with a warning
// instead of rejecting. The app boots without Vizio-specific features;
// every site that calls into window.VIZIO already uses optional chaining
// and a window.close() fallback (see exit() below). Hard-rejecting here
// would block dev-on-desktop testing of Vizio-targeted builds.
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
