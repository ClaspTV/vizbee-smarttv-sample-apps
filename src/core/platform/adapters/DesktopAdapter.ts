import { PlatformAdapter, DeviceInfo, PlatformName } from '../PlatformAdapter';

// Used for browser-based dev. D-pad maps to keyboard arrows (handled in keymaps).
export class DesktopAdapter implements PlatformAdapter {
  readonly name: PlatformName = 'desktop';

  awaitReady(): Promise<void> {
    return Promise.resolve();
  }

  getDeviceInfo(): DeviceInfo {
    return {
      platform: 'desktop',
      model: navigator.userAgent,
      version: '1',
    };
  }

  exit(): void {
    // Browsers can't programmatically close themselves; closest we can do.
    window.close();
  }

  dispose(): void {
    /* no-op */
  }
}
