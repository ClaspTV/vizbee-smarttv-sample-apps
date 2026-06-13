import { getWebInstrumentations, initializeFaro } from '@grafana/faro-web-sdk';
import { TracingInstrumentation } from '@grafana/faro-web-tracing';
import type { Faro } from '@grafana/faro-web-sdk';

export class GrafanaService {
  private faro: Faro | null = null;

  start(): void {
    this.faro = initializeFaro({
      url: 'https://faro-collector-prod-ap-south-1.grafana.net/collect/9dbe5ab1924398918716b20443338e23',
      app: {
        name: 'vizbee',
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
