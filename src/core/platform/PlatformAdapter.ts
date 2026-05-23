// Adapter pattern: every TV platform implements this same surface.
// Code in features/ and services/ should depend on this interface only —
// never on window.VIZIO / window.webapis / window.PalmServiceBridge directly.

export type PlatformName =
  | 'viziosmartcast'
  | 'tizen'
  | 'webos'
  | 'xbox'
  | 'desktop';

export interface DeviceInfo {
  platform: PlatformName;
  model?: string;
  version?: string;
}

export interface PlatformAdapter {
  /** Lowercase platform identifier. */
  readonly name: PlatformName;

  /**
   * Resolves once the platform's native libraries / APIs are ready.
   * For Vizio this awaits VIZIO_LIBRARY_DID_LOAD; for Tizen/webOS it
   * resolves immediately (libs already present at app launch).
   */
  awaitReady(): Promise<void>;

  /** Read device info once awaitReady() has resolved. */
  getDeviceInfo(): DeviceInfo;

  /** Exit the app. Called from app menu / root-back press. */
  exit(): void;

  /** Tear-down hook. Called on app shutdown. */
  dispose(): void;
}
