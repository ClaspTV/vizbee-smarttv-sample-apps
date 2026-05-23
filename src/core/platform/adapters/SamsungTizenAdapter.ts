import { PlatformAdapter, DeviceInfo, PlatformName } from '../PlatformAdapter';

// Tizen webapis is available at app launch via the magic $WEBAPIS path
// configured in config.xml. By the time our JS runs, window.webapis is ready.
export class SamsungTizenAdapter implements PlatformAdapter {
  readonly name: PlatformName = 'tizen';

  awaitReady(): Promise<void> {
    return Promise.resolve();
  }

  getDeviceInfo(): DeviceInfo {
    let model: string | undefined;
    try {
      model = window.webapis?.productinfo?.getModelCode();
    } catch {
      /* ignore */
    }
    return {
      platform: 'tizen',
      model,
    };
  }

  exit(): void {
    try {
      window.tizen?.application?.getCurrentApplication().exit();
    } catch {
      window.close();
    }
  }

  dispose(): void {
    /* no-op */
  }
}
