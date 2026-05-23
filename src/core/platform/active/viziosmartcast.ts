// Per-platform adapter shim. vite.config.ts aliases `@active-adapter` to the
// shim matching the build mode, so PlatformFactory's single static import
// resolves to one — and only one — adapter per build.
export { VizioSmartCastAdapter as ActiveAdapter } from '../adapters/VizioSmartCastAdapter';
