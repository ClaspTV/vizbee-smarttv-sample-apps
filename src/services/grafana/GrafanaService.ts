import { getWebInstrumentations, initializeFaro } from '@grafana/faro-web-sdk';
import { TracingInstrumentation } from '@grafana/faro-web-tracing';
import type { Faro } from '@grafana/faro-web-sdk';

export class GrafanaService {
  private faro: Faro | null = null;
  private firstRenderMarked = false;

  start(): void {
    this.faro = initializeFaro({
      url: 'https://faro-collector-prod-us-east-2.grafana.net/collect/153ab205bac62e67c8ec0772dbabf62f',
      app: {
        name: 'Vizbee Demo App',
        version: '1.0.0',
        environment: 'production',
      },
      webVitalsInstrumentation: {
        reportAllChanges: true,
      },
      instrumentations: [
        ...getWebInstrumentations(),
        new TracingInstrumentation(),
      ],
    });
  }

  markFirstRender(): void {
    if (this.firstRenderMarked || !this.faro) return;
    this.firstRenderMarked = true;
    const renderMs = Math.round(performance.now());
    this.faro.api.pushMeasurement({
      type: 'app-render',
      values: { first_render: renderMs },
    });
    setTimeout(() => this.backfillWebVitals(renderMs), 2000);
  }

  private backfillWebVitals(renderMs: number): void {
    if (!this.faro) return;
    const hasFcp = performance
      .getEntriesByType('paint')
      .some((e) => e.name === 'first-contentful-paint');
    const hasLcp = performance.getEntriesByType('largest-contentful-paint').length > 0;
    if (!hasFcp) this.pushSyntheticVital('fcp', renderMs, 1800, 3000);
    if (!hasLcp) this.pushSyntheticVital('lcp', renderMs, 2500, 4000);
  }

  private pushSyntheticVital(name: 'fcp' | 'lcp', value: number, good: number, poor: number): void {
    if (!this.faro) return;
    const rating = value <= good ? 'good' : value <= poor ? 'needs-improvement' : 'poor';
    this.faro.api.pushMeasurement(
      { type: 'web-vitals', values: { [name]: value, delta: value } },
      {
        context: {
          id: `synthetic-${name}-${Date.now()}`,
          rating,
          navigation_type: 'navigate',
          synthetic: 'true',
        },
      },
    );
  }

  getFaro(): Faro | null {
    return this.faro;
  }
}
