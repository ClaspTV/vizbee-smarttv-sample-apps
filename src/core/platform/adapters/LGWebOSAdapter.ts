import { PlatformAdapter, DeviceInfo, PlatformName } from '../PlatformAdapter';

// LG webOS. The webOS build injects LG's webOSTV.js (see vite.config.ts), which
// defines window.webOS.service.request — the PalmServiceBridge wrapper the Vizbee
// SDK needs to read device info. window.webOSSystem.deviceInfo (model/version) is
// also injected by the webOS app container; we surface it in Settings → Device.
export class LGWebOSAdapter implements PlatformAdapter {
  readonly name: PlatformName = 'webos';

  awaitReady(): Promise<void> {
    return Promise.resolve();
  }

  getDeviceInfo(): DeviceInfo {
    // window.webOSSystem.deviceInfo is a JSON string the container injects.
    try {
      const raw = (window as any).webOSSystem?.deviceInfo ?? (window as any).PalmSystem?.deviceInfo;
      if (raw) {
        const info = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return {
          platform: 'webos',
          model: info.modelName,
          version: info.platformVersion ?? info.sdkVersion,
        };
      }
    } catch {
      /* fall through to the bare platform name */
    }
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
