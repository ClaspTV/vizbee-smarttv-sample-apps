import { PlatformAdapter, PlatformName } from './PlatformAdapter';
import { ActiveAdapter } from '@active-adapter';
import { Logger } from '@/services/logger/Logger';

const log = new Logger('PlatformFactory');

// `@active-adapter` is a Vite alias resolved at build time to one of
// src/core/platform/active/<platform>.ts (see vite.config.ts → resolve.alias).
// Each shim re-exports its adapter as `ActiveAdapter`, so this factory's
// single static import pulls in only the matched adapter — the others never
// reach the bundle.
export class PlatformFactory {
  static async detect(): Promise<PlatformAdapter> {
    if (typeof window === 'undefined') {
      throw new Error('PlatformFactory.detect must be called in a browser context');
    }
    const adapter = new ActiveAdapter();
    log.info(`build platform: ${adapter.name}`);
    return adapter;
  }

  static get supportedPlatforms(): readonly PlatformName[] {
    return ['viziosmartcast', 'tizen', 'webos', 'xbox', 'desktop'] as const;
  }
}
