import { PlatformAdapter, DeviceInfo, PlatformName } from '../PlatformAdapter';

// Xbox UWP web app. Windows.* APIs are available globally on the device.
export class XboxAdapter implements PlatformAdapter {
  readonly name: PlatformName = 'xbox';

  awaitReady(): Promise<void> {
    return Promise.resolve();
  }

  getDeviceInfo(): DeviceInfo {
    return { platform: 'xbox' };
  }

  exit(): void {
    // UWP apps don't typically force-exit; suspending behavior is handled
    // by the OS lifecycle. window.close() is the safe fallback.
    window.close();
  }

  dispose(): void {
    /* no-op */
  }
}
