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

export class ConfigService {
  private cfg: AppConfig = { ...DEFAULTS };

  get(): Readonly<AppConfig> {
    return this.cfg;
  }

  /** Allow overrides at boot (e.g., from URL, embedded JSON, etc.). */
  override(partial: Partial<AppConfig>): void {
    this.cfg = { ...this.cfg, ...partial };
  }

  getConfigServiceBaseUri(useCdn: boolean): string {
    return useCdn ? CONFIG_SERVICE_CDN_URI : CONFIG_SERVICE_PROD_URI;
  }
}
