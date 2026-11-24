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
    __perf?: {
      router: import('../app/Router').Router;
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

  // Whether Vizbee continuity init runs; false in the perf "without Vizbee" build.
  const __VZB_ENABLED__: boolean;

  // Whether Mux Data monitoring runs; true only in the perf "with Mux" build.
  const __MUX_ENABLED__: boolean;

  // Mux Data env key for the "with Mux" build; '' when unset.
  const __MUX_ENV_KEY__: string;

  // Exposes window.__perf.router for the long-playback perf harness; false
  // (dead-code-eliminated) in every normal build. Set by PERF_HOOKS=true.
  const __PERF_HOOKS__: boolean;
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
