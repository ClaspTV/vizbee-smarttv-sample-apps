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
    // The Vizbee SDK exposes its version here (window.VZB.VERSION) once loaded.
    VZB?: {
      VERSION?: string;
      [key: string]: unknown;
    };
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

  // App version (from package.json), injected by Vite (define).
  const __APP_VERSION__: string;
}

// Bridge the HomeSSO SDK namespace into the continuity SDK's window.vizbee type.
// The two SDKs use separate global declarations: the continuity SDK adds
// window.vizbee: VizbeeSDK (via import '@vizbeetv/sdk-qa/samsung') while the
// HomeSSO SDK adds window.vizbee.homesso via its own VizbeeNamespace interface.
// Augmenting VizbeeSDK here merges both into the same window.vizbee type so
// both continuity and homesso properties are accessible without casts.
import type { HomeSSONamespace } from '@vizbeetv/homesso-sdk-qa';
declare module '@vizbeetv/sdk-qa' {
  interface VizbeeSDK {
    homesso?: HomeSSONamespace;
  }
}

export {};
