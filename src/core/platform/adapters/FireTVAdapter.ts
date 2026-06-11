import { PlatformAdapter, DeviceInfo, PlatformName } from '../PlatformAdapter';

/**
 * Shape of window.VizbeeBridge — injected by VizbeeBridgePlugin.java via
 * Android's addJavascriptInterface. Available on all pages loaded in the
 * FireTV WebView, including external (non-www) URLs.
 */
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
 * Platform adapter for Amazon FireTV (Cordova WebView).
 *
 * Device info and exit are delegated to window.VizbeeBridge, injected by
 * VizbeeBridgePlugin via Android's addJavascriptInterface. Falls back to
 * stub values when the bridge is absent (desktop browser testing).
 */
export class FireTVAdapter implements PlatformAdapter {
  readonly name: PlatformName = 'firetv';

  awaitReady(): Promise<void> {
    return new Promise((resolve) => {
      if (typeof window.VizbeeBridge !== 'undefined') {
        resolve();
        return;
      }
      // On the device the bridge is ready after Cordova's deviceready event.
      // In a browser there is no deviceready, so DOMContentLoaded is the fallback.
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
