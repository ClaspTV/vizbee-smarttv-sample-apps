import { PlatformAdapter, DeviceInfo, PlatformName } from '../PlatformAdapter';

// LG webOS native (PalmServiceBridge) and webOS web (legacy) both flow through
// here for this sample app. webOSTV.js can be loaded later if you need
// device service APIs; not required for the sample.
export class LGWebOSAdapter implements PlatformAdapter {
  readonly name: PlatformName = 'webos';

  awaitReady(): Promise<void> {
    return Promise.resolve();
  }

  getDeviceInfo(): DeviceInfo {
    return { platform: 'webos' };
  }

  exit(): void {
    // webOS apps typically use the platformBack / luna service to exit; for the
    // sample, window.close() is sufficient for both webOS native and web.
    window.close();
  }

  dispose(): void {
    /* no-op */
  }
}
