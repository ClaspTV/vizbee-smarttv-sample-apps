// Ambient declarations for untyped JS SDK packages — the bundled Vizbee SDK
// modules are side-effect-only (they populate window.vizbee) and ship no .d.ts.
// Kept in this non-module file (no top-level import/export) so they are true
// ambient module declarations, not augmentations — which silences TS7016 for
// `import('@vizbeetv/sdk/samsung')` and friends.
//
// One line per bundled Vizbee SDK subpath the npm builds import. The continuity
// SDK (@vizbeetv/sdk) exposes a subpath per platform × ES target; declare each
// one that loadBundledSdk() may import.
declare module '@vizbeetv/sdk/samsung';
declare module '@vizbeetv/sdk/samsung/es6';
declare module '@vizbeetv/sdk/lg';
declare module '@vizbeetv/sdk/lg/es6';
declare module '@vizbeetv/sdk/xbox';
declare module '@vizbeetv/sdk/xbox/es6';
