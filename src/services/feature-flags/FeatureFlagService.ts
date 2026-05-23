import { EventEmitter } from '@/core/events/EventEmitter';
import { Logger } from '@/services/logger/Logger';
import { DEFAULT_FLAGS, FeatureFlags, FlagKey } from './flags';

const STORAGE_KEY = 'vsw.flags.v1';

type FlagEvents = {
  change: { key: FlagKey; value: FeatureFlags[FlagKey] };
};

// Persistence: localStorage by default.
// Override priority (highest wins): URL params (?ff_<key>=true) > localStorage > defaults.
// Subscribers get notified on toggle so the Settings page can re-render
// without polling.
export class FeatureFlagService {
  private flags: FeatureFlags = { ...DEFAULT_FLAGS };
  private readonly emitter = new EventEmitter<FlagEvents>();
  private readonly log = new Logger('FeatureFlagService');

  load(): void {
    let stored: Partial<FeatureFlags> = {};
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) stored = JSON.parse(raw) as Partial<FeatureFlags>;
    } catch (e) {
      this.log.warn('failed to read flags from localStorage', e);
    }

    const urlOverrides = this.parseUrlOverrides();
    this.flags = { ...DEFAULT_FLAGS, ...stored, ...urlOverrides };
    this.log.info('loaded flags', this.flags);
  }

  get<K extends FlagKey>(key: K): FeatureFlags[K] {
    return this.flags[key];
  }

  getAll(): Readonly<FeatureFlags> {
    return this.flags;
  }

  set<K extends FlagKey>(key: K, value: FeatureFlags[K]): void {
    if (this.flags[key] === value) return;
    this.flags = { ...this.flags, [key]: value };
    this.persist();
    this.emitter.emit('change', { key, value });
  }

  toggle(key: FlagKey): void {
    this.set(key, !this.flags[key]);
  }

  on(listener: (e: FlagEvents['change']) => void): () => void {
    return this.emitter.on('change', listener);
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.flags));
    } catch (e) {
      this.log.warn('failed to persist flags', e);
    }
  }

  private parseUrlOverrides(): Partial<FeatureFlags> {
    const overrides: Partial<FeatureFlags> = {};
    try {
      const params = new URLSearchParams(window.location.search);
      for (const key of Object.keys(DEFAULT_FLAGS) as FlagKey[]) {
        const v = params.get(`ff_${key}`);
        if (v !== null) {
          (overrides as Record<string, boolean>)[key] = v === 'true' || v === '1';
        }
      }
    } catch {
      /* ignore */
    }
    return overrides;
  }
}
