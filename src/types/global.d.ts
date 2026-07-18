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

// The HomeSSO SDK types window.vizbee as VizbeeNamespace (already carrying
// `homesso`); augment that same interface to add continuity, per its docs.
import type { ContinuityFramework } from '@vizbeetv/sdk';
declare global {
  interface VizbeeNamespace {
    continuity: ContinuityFramework;
  }
}

export {};
