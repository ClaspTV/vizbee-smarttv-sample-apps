// Ambient declarations for untyped JS SDK packages.
//
// The continuity SDK (@vizbeetv/sdk) now ships its own TypeScript declarations,
// so its per-platform subpaths (./samsung, ./lg, ./xbox and their /es6 variants)
// are typed by the package itself — no ambient stubs needed here. Add a
// `declare module 'pkg';` line below only for SDK packages that remain
// side-effect-only and ship no .d.ts.
export {};
