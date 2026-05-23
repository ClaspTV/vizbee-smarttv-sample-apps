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
}

export {};
