import { EventEmitter } from '@/core/events/EventEmitter';
import { Logger } from '@/services/logger/Logger';
import { DEFAULT_FLAGS, FeatureFlags, FlagKey, FlagValue, FLAG_OPTIONS } from './flags';

// Bumped to v2: `vizbeeSdk` values changed from full|light to the 4-way
// full/light × ES5/ES6 set. Stale v1 values would no longer match an option.
const STORAGE_KEY = 'vsw.flags.v2';

type FlagEvents = {
  change: { key: FlagKey; value: FeatureFlags[FlagKey] };
};

// Persistence via localStorage. Override priority: URL params (?ff_<key>=) >
// localStorage > defaults. Subscribers are notified on change for re-render.
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

  // Flip a boolean flag. Cast: set's value is narrowed to FeatureFlags[K], but
  // there are no boolean flags right now, so widen for this generic helper.
  toggle(key: FlagKey): void {
    this.set(key, !this.flags[key] as never);
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
        const raw = params.get(`ff_${key}`);
        if (raw === null) continue;
        const value = this.coerceOverride(key, raw);
        if (value !== undefined) {
          (overrides as Record<string, FlagValue>)[key] = value;
        }
      }
    } catch {
      /* ignore */
    }
    return overrides;
  }

  // Convert a raw ?ff_<key>= string to the flag's typed value. Boolean = true/1;
  // enum/string must match FLAG_OPTIONS (unknown → undefined, ignored).
  private coerceOverride(key: FlagKey, raw: string): FlagValue | undefined {
    if (typeof DEFAULT_FLAGS[key] === 'boolean') {
      return raw === 'true' || raw === '1';
    }
    const allowed = FLAG_OPTIONS[key];
    if (!allowed || allowed.some((o) => o.value === raw)) {
      return raw as FlagValue;
    }
    this.log.warn('ignoring invalid flag override', { key, value: raw });
    return undefined;
  }
}
