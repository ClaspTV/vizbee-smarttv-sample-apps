// Single source of truth for flag keys + defaults. Adding a new flag = one
// new entry here; everything else (Settings UI, persistence, URL overrides)
// adapts automatically.

export interface FeatureFlags {
  syncConnection: 'pubnub' | 'local';
  vizbeeSdk: 'full-es5' | 'full-es6' | 'light-es5' | 'light-es6';
  videoPlayer: 'html';
  // Which hosted app build to run: 'script' (external <script> SDK, …/webos/)
  // or 'npm' (node_modules-bundled SDK, …/webos-with-nodemodule/<module>/).
  // Selecting it redirects to that build's URL — see core/platform/appBuild.ts.
  appBuild: 'script' | 'npm';
  // For the npm build only: which bundled module to load — maps to the
  // …/webos-with-nodemodule/es5 vs /es6 hosted folders. Surfaced in the
  // build-aware "Vizbee SDK" row (the script build uses `vizbeeSdk` instead).
  npmModule: 'es5' | 'es6';
  // HomeSSO sign-in toast styling: 'default' = the SDK's out-of-box look;
  // 'dazn' = spacing/border matched to the DAZN mockups. Applied at show time
  // by HomeSSOService. Rendered in the "HomeSSO modal preview" section, not the
  // generic flags loop.
  homeSSOStyle: 'default' | 'dazn';
  // HomeSSO modal localization: 'default' = LTR (the SDK default); 'rtl' mirrors
  // the layout for right-to-left locales (icon trailing, text right-aligned).
  // Applied at show time by HomeSSOService via the modal config's `direction`.
  // Rendered in the "HomeSSO modal preview" section, not the generic flags loop.
  homeSSOLocale: 'default' | 'rtl';
}

// Key order here is the order rows appear in Settings. (npmModule renders
// inside the build-aware "Vizbee SDK" row, not as its own row.)
export const DEFAULT_FLAGS: FeatureFlags = {
  appBuild: 'script',
  vizbeeSdk: 'light-es5',
  syncConnection: 'pubnub',
  videoPlayer: 'html',
  npmModule: 'es5',
  homeSSOStyle: 'dazn',
  homeSSOLocale: 'default',
};

export type FlagKey = keyof FeatureFlags;
// The value universe the flag framework supports (toggle = boolean, radio =
// string). Decoupled from the current flags so the boolean/toggle code paths
// stay valid even when no boolean flag happens to exist right now.
export type FlagValue = string | boolean;

export const FLAG_LABELS: Record<FlagKey, string> = {
  syncConnection: 'Sync Connection',
  vizbeeSdk: 'Vizbee SDK',
  videoPlayer: 'Video Player',
  appBuild: 'App Build',
  npmModule: 'NPM SDK Module',
  homeSSOStyle: 'HomeSSO Modal Style',
  homeSSOLocale: 'Localization',
};

// Labels for the options of each enum-typed flag. Boolean flags don't appear
// here — they render as a Toggle. Keys present here render as a RadioGroup.
export const FLAG_OPTIONS: Partial<Record<FlagKey, ReadonlyArray<{ value: string; label: string }>>> = {
  syncConnection: [
    { value: 'pubnub', label: 'Use PubNub' },
    { value: 'local', label: 'Use Local Communication' },
  ],
  vizbeeSdk: [
    { value: 'full-es5', label: 'Use Full Vizbee SDK - ES5' },
    { value: 'full-es6', label: 'Use Full Vizbee SDK - ES6' },
    { value: 'light-es5', label: 'Use Light Vizbee SDK - ES5' },
    { value: 'light-es6', label: 'Use Light Vizbee SDK - ES6' },
  ],
  videoPlayer: [
    { value: 'html', label: 'Use HTML Player' },
  ],
  appBuild: [
    { value: 'script', label: 'Use Script build (external SDK)' },
    { value: 'npm', label: 'Use NPM build (bundled SDK)' },
  ],
  npmModule: [
    { value: 'es5', label: 'Use ES5 Module' },
    { value: 'es6', label: 'Use ES6 Module' },
  ],
  homeSSOStyle: [
    { value: 'default', label: 'Default style' },
    { value: 'dazn', label: 'DAZN style' },
  ],
  homeSSOLocale: [
    { value: 'default', label: 'Use Default' },
    { value: 'rtl', label: 'Use RTL (Arabic)' },
  ],
};
