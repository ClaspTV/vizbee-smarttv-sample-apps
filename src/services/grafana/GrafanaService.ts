import type { Faro } from '@grafana/faro-web-sdk';

export class GrafanaService {
  private faro: Faro | null = null;
  private firstRenderMarked = false;
  private pendingRenderMs: number | null = null;

  start(): void {
    void this.init();
  }

  private async init(): Promise<void> {
    try {
      const { getWebInstrumentations, initializeFaro } = await import('@grafana/faro-web-sdk');
      const { TracingInstrumentation } = await import('@grafana/faro-web-tracing');
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
        instrumentations: [...getWebInstrumentations(), new TracingInstrumentation()],
      });
      if (this.pendingRenderMs !== null) {
        const ms = this.pendingRenderMs;
        this.pendingRenderMs = null;
        this.markFirstRender(ms);
      }
    } catch {
      this.faro = null;
    }
  }

  markFirstRender(renderMsOverride?: number): void {
    if (this.firstRenderMarked) return;
    const renderMs = renderMsOverride ?? Math.round(performance.now());
    if (!this.faro) {
      if (this.pendingRenderMs === null) this.pendingRenderMs = renderMs;
      return;
    }
    this.firstRenderMarked = true;
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
