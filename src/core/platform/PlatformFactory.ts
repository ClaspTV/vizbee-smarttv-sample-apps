import { PlatformAdapter, PlatformName } from './PlatformAdapter';
import { ActiveAdapter } from '@active-adapter';
import { Logger } from '@/services/logger/Logger';

const log = new Logger('PlatformFactory');

// `@active-adapter` is a Vite alias (see vite.config.ts) resolved at build time
// to the matched platform's shim, so only that adapter reaches the bundle.
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
    return ['viziosmartcast', 'tizen', 'webos', 'xbox', 'firetv', 'desktop'] as const;
  }
}
