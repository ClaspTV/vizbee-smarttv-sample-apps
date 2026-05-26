// Plain config bag. In a real app this would fetch /config.json or come from
// an environment-baked file; for the sample it returns hardcoded defaults.

export interface AppConfig {
  appName: string;
  vizbeeAppId: string;
  defaultPlayer: 'html' | 'shaka';
}

const DEFAULTS: AppConfig = {
  appName: 'Vizbee Sample Webapp',
  vizbeeAppId: 'vzb2057833111', // SmartTV SampleApp
  defaultPlayer: 'html',
};

export const CONFIG_SERVICE_PROD_URI = 'https://config.claspws.tv';
export const CONFIG_SERVICE_CDN_URI = 'https://d1d3x21uy9cxam.cloudfront.net/';

// Only user-editable fields are persisted (the Vizbee App ID, set in Settings).
const STORAGE_KEY = 'vsw.config.v1';

export class ConfigService {
  private cfg: AppConfig = { ...DEFAULTS };

  /** Apply any persisted overrides (e.g. the App ID edited in Settings). */
  load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) this.cfg = { ...this.cfg, ...(JSON.parse(raw) as Partial<AppConfig>) };
    } catch {
      /* ignore — fall back to defaults */
    }
  }

  get(): Readonly<AppConfig> {
    return this.cfg;
  }

  /** Allow overrides at boot (e.g., from URL, embedded JSON, etc.). */
  override(partial: Partial<AppConfig>): void {
    this.cfg = { ...this.cfg, ...partial };
  }

  /** Set + persist the Vizbee App ID (applied at the next launch/reload). */
  setVizbeeAppId(id: string): void {
    this.cfg = { ...this.cfg, vizbeeAppId: id };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ vizbeeAppId: id }));
    } catch {
      /* ignore */
    }
  }

  getConfigServiceBaseUri(useCdn: boolean): string {
    return useCdn ? CONFIG_SERVICE_CDN_URI : CONFIG_SERVICE_PROD_URI;
  }
}
