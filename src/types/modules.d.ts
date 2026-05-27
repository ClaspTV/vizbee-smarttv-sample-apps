// Ambient declarations for untyped JS SDK packages — the bundled Vizbee SDK
// modules are side-effect-only (they populate window.vizbee) and ship no .d.ts.
// Kept in this non-module file (no top-level import/export) so they are true
// ambient module declarations, not augmentations — which silences TS7016 for
// `import('vizbee-qa-sdk-tizen-es5')` and friends.
//
// Add one line per bundled SDK package as more ship.
declare module 'vizbee-qa-sdk-tizen-es5';
declare module 'vizbee-qa-sdk-lgwebos-es6';
