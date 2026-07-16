// Single source of truth for flag keys + defaults. Adding a flag = one entry
// here; Settings UI, persistence and URL overrides adapt automatically.

export interface FeatureFlags {
  vizbeeSdk: 'full-es5' | 'full-es6' | 'light-es5' | 'light-es6';
  // Whether the SDK gets a <video> element ('element') or runs element-less
  // ('elementless', state polled via getVideoInfo(); dev-origin -el builds).
  playerElement: 'element' | 'elementless';
  // Which env origin the SDK <script> loads from: dev/qa = S3 buckets, prod =
  // CDN. Script builds only; see services/sdkEnv.ts.
  sdkEnv: 'dev' | 'qa' | 'prod';
  videoPlayer: 'html';
  // Which hosted app build to run: 'script' (external <script> SDK) or 'npm'
  // (node_modules-bundled SDK). Selecting it redirects — see appBuild.ts.
  appBuild: 'script' | 'npm';
  // npm build only: which bundled module (es5 vs es6) to load. Surfaced in the
  // build-aware "Vizbee SDK" row (script builds use `vizbeeSdk`).
  npmModule: 'es5' | 'es6';
  // HomeSSO toast styling: 'default' (SDK look) or 'dazn' (DAZN mockups).
  // Applied at show time; rendered in the "HomeSSO modal preview" section.
  homeSSOStyle: 'default' | 'dazn';
  // HomeSSO modal localization: 'default' = LTR, 'rtl' mirrors the layout for
  // right-to-left locales. Rendered in the "HomeSSO modal preview" section.
  homeSSOLocale: 'default' | 'rtl';
}

// Key order here is the order rows appear in Settings. (npmModule renders
// inside the build-aware "Vizbee SDK" row, not as its own row.)
export const DEFAULT_FLAGS: FeatureFlags = {
  appBuild: 'script',
  vizbeeSdk: 'light-es5',
  sdkEnv: 'prod',
  videoPlayer: 'html',
  npmModule: 'es5',
  homeSSOStyle: 'dazn',
  homeSSOLocale: 'default',
  playerElement: 'element',
};

export type FlagKey = keyof FeatureFlags;
// Value universe the flag framework supports (boolean = toggle, string = radio).
// Decoupled from current flags so toggle code paths stay valid with no boolean flag.
export type FlagValue = string | boolean;

export const FLAG_LABELS: Record<FlagKey, string> = {
  vizbeeSdk: 'Vizbee SDK',
  sdkEnv: 'Vizbee SDK Env',
  videoPlayer: 'Video Player',
  appBuild: 'App Build',
  npmModule: 'NPM SDK Module',
  homeSSOStyle: 'HomeSSO Modal Style',
  homeSSOLocale: 'Localization',
  playerElement: 'Player Element',
};

// Labels for the options of each enum-typed flag. Boolean flags don't appear
// here — they render as a Toggle. Keys present here render as a RadioGroup.
export const FLAG_OPTIONS: Partial<Record<FlagKey, ReadonlyArray<{ value: string; label: string }>>> = {
  vizbeeSdk: [
    { value: 'full-es5', label: 'Use Full Vizbee SDK - ES5' },
    { value: 'full-es6', label: 'Use Full Vizbee SDK - ES6' },
    { value: 'light-es5', label: 'Use Light Vizbee SDK - ES5' },
    { value: 'light-es6', label: 'Use Light Vizbee SDK - ES6' },
  ],
  sdkEnv: [
    { value: 'dev', label: 'Dev (vzb-origin-dev)' },
    { value: 'qa', label: 'QA (vzb-origin-qa)' },
    { value: 'prod', label: 'Prod (sdk.claspws.tv)' },
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
  playerElement: [
    { value: 'element', label: 'Use player element' },
    { value: 'elementless', label: 'Do not use player element' },
  ],
};
