import { PlatformAdapter, DeviceInfo, PlatformName } from '../PlatformAdapter';

// LG webOS. The build injects webOSTV.js (PalmServiceBridge wrapper the Vizbee
// SDK needs) and the container injects window.webOSSystem.deviceInfo.
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
    // window.close() is sufficient for both webOS native and web in this sample.
    window.close();
  }

  dispose(): void {
    /* no-op */
  }
}
