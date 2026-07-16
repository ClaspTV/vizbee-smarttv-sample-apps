// Adapter pattern: every TV platform implements this surface. Feature/service
// code depends on this interface only, never on native window.* APIs directly.

export type PlatformName =
  | 'viziosmartcast'
  | 'tizen'
  | 'webos'
  | 'xbox'
  | 'firetv'
  | 'desktop';

export interface DeviceInfo {
  platform: PlatformName;
  model?: string;
  version?: string;
}

export interface PlatformAdapter {
  /** Lowercase platform identifier. */
  readonly name: PlatformName;

  /** Resolves once the platform's native libraries / APIs are ready. */
  awaitReady(): Promise<void>;

  /** Read device info once awaitReady() has resolved. */
  getDeviceInfo(): DeviceInfo;

  /** Exit the app. Called from app menu / root-back press. */
  exit(): void;

  /** Tear-down hook. Called on app shutdown. */
  dispose(): void;
}
