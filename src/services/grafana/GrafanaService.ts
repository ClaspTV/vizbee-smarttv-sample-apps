import { getWebInstrumentations, initializeFaro } from '@grafana/faro-web-sdk';
import { TracingInstrumentation } from '@grafana/faro-web-tracing';
import type { Faro } from '@grafana/faro-web-sdk';

export class GrafanaService {
  private faro: Faro | null = null;

  start(): void {
    this.faro = initializeFaro({
      url: 'https://faro-collector-prod-us-east-2.grafana.net/collect/e3628cf010e0f208348f8dcb608e00d6',
      app: {
        name: 'Vizbee Omni',
        version: '1.0.0',
        environment: 'production',
      },
      instrumentations: [
        ...getWebInstrumentations(),
        new TracingInstrumentation(),
      ],
    });
  }

  getFaro(): Faro | null {
    return this.faro;
  }
}
