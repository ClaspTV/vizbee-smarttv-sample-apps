/// <reference types="vite/client" />

// Platform-specific globals so adapters can reference window.VIZIO etc.
// without `any` casts.

declare global {

  interface Window {
    VIZIO?: {
      exitApplication?: () => void;
      getDeviceId?: (cb: (id: string) => void) => void;
      getIPAddress?: () => Promise<string>;
      [key: string]: unknown;
    };
    webapis?: {
      network?: { getIp: () => string };
      productinfo?: { getModelCode: () => string };
      [key: string]: unknown;
    };
    tizen?: {
      application?: {
        getCurrentApplication: () => { exit: () => void };
      };
      [key: string]: unknown;
    };
    PalmServiceBridge?: unknown;
    webOS?: {
      platformBack?: () => void;
      [key: string]: unknown;
    };
    cast?: { framework?: unknown };
    // The Vizbee SDK exposes its version here (window.VZB.VERSION) once loaded.
    VZB?: {
      VERSION?: string;
      [key: string]: unknown;
    };
  }

  // Xbox / UWP: defined globally on Windows TVs; declared loosely here.
  const Windows: unknown;

  // Build-time stamp injected by Vite; shown in Settings → Device.
  const __BUILD_TIME__: string;

  // Bundled Vizbee SDK npm package name (npm builds) or '' (script builds).
  const __SDK_NPM_PACKAGE__: string;

  // App version (from package.json), injected by Vite (define).
  const __APP_VERSION__: string;
}

// Merge the HomeSSO namespace into the continuity SDK's window.vizbee type
// so both continuity and homesso properties are accessible without casts.
import type { HomeSSONamespace } from '@vizbeetv/homesso-sdk-qa';
declare module '@vizbeetv/sdk-qa' {
  interface VizbeeSDK {
    homesso?: HomeSSONamespace;
  }
}

export {};
