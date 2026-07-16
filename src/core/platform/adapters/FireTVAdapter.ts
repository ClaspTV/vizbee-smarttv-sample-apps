import { PlatformAdapter, DeviceInfo, PlatformName } from '../PlatformAdapter';

/** Shape of window.VizbeeBridge, injected by VizbeeBridgePlugin.java. */
interface VizbeeBridgeInterface {
  getPlatformName(): string;
  getDeviceInfo(): string;   // JSON string
  exit(): void;
  getVizbeeDeviceId(): string;
  getHomeSSOStatus(): string; // JSON string
}

declare global {
  interface Window {
    VizbeeBridge?: VizbeeBridgeInterface;
  }
}

/**
 * Amazon FireTV (Cordova WebView). Delegates device info and exit to
 * window.VizbeeBridge, falling back to stubs when the bridge is absent.
 */
export class FireTVAdapter implements PlatformAdapter {
  readonly name: PlatformName = 'firetv';

  awaitReady(): Promise<void> {
    return new Promise((resolve) => {
      if (typeof window.VizbeeBridge !== 'undefined') {
        resolve();
        return;
      }
      // Bridge is ready after Cordova's deviceready; DOMContentLoaded is the browser fallback.
      const onReady = () => resolve();
      document.addEventListener('deviceready', onReady, { once: true });
      window.addEventListener('DOMContentLoaded', onReady, { once: true });
    });
  }

  getDeviceInfo(): DeviceInfo {
    const bridge = window.VizbeeBridge;
    if (!bridge) {
      return { platform: 'firetv' };
    }
    try {
      const raw = bridge.getDeviceInfo();
      const parsed = JSON.parse(raw) as { model?: string; osVersion?: string };
      return {
        platform: 'firetv',
        model: parsed.model,
        version: parsed.osVersion,
      };
    } catch {
      return { platform: 'firetv' };
    }
  }

  exit(): void {
    try {
      window.VizbeeBridge?.exit();
    } catch {
      window.close();
    }
  }

  dispose(): void {
    /* no-op */
  }
}
