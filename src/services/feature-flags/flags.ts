// Single source of truth for flag keys + defaults. Adding a new flag = one
// new entry here; everything else (Settings UI, persistence, URL overrides)
// adapts automatically.

export interface FeatureFlags {
  debugMode: boolean;
  syncConnection: 'pubnub' | 'local';
  vizbeeSdk: 'full-es5' | 'full-es6' | 'light-es5' | 'light-es6';
  videoPlayer: 'html';
}

export const DEFAULT_FLAGS: FeatureFlags = {
  debugMode: false,
  syncConnection: 'pubnub',
  vizbeeSdk: 'light-es5',
  videoPlayer: 'html',
};

export type FlagKey = keyof FeatureFlags;
export type FlagValue = FeatureFlags[FlagKey];

export const FLAG_LABELS: Record<FlagKey, string> = {
  debugMode: 'Debug mode',
  syncConnection: 'Sync Connection',
  vizbeeSdk: 'Vizbee SDK',
  videoPlayer: 'Video Player',
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
};
