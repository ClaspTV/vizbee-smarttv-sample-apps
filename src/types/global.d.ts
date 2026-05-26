/// <reference types="vite/client" />

// Platform-specific globals that TS doesn't know about by default.
// These let our adapter implementations reference window.VIZIO etc.
// without `any` casts everywhere.

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
  }

  // Xbox / UWP
  // Defined globally on Windows TVs; declared loosely here.
  const Windows: unknown;

  // Build-time stamp injected by Vite (see vite.config.ts → define). Shown in
  // Settings → Device so you can tell which deployed build is actually running.
  const __BUILD_TIME__: string;

  // Name of the bundled Vizbee SDK npm package to import (npm builds), or ''
  // for script builds. Injected by Vite (define), driven by VIZBEE_SDK_NPM_PACKAGE.
  const __SDK_NPM_PACKAGE__: string;
}

export {};
