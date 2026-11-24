// @ts-check
'use strict';

/**
 * @typedef {{ name: string, value: number }} Metric
 * @typedef {{
 *   t: number,
 *   taskDuration: number,
 *   jsHeapUsed: number,
 *   jsHeapTotal: number,
 *   nodes: number,
 *   listeners: number
 * }} Sample
 */

/**
 * @param {Metric[]} metrics
 * @param {string} name
 * @returns {number}
 */
function pick(metrics, name) {
  const m = metrics.find((x) => x.name === name);
  return m ? m.value : 0;
}

/**
 * One raw sample from Performance.getMetrics.
 * @param {import('./cdp.js').Cdp} cdp
 * @returns {Promise<Sample>}
 */
export async function sample(cdp) {
  try {
    const res = await cdp.send('Performance.getMetrics');
    /** @type {Metric[]} */
    const metrics = res?.metrics ?? [];
    if (metrics.length) {
      return {
        t: Date.now(),
        taskDuration: pick(metrics, 'TaskDuration'),
        jsHeapUsed: pick(metrics, 'JSHeapUsedSize'),
        jsHeapTotal: pick(metrics, 'JSHeapTotalSize'),
        nodes: pick(metrics, 'Nodes'),
        listeners: pick(metrics, 'JSEventListeners'),
      };
    }
  } catch {
    /* Performance domain absent (webOS 4 / Chromium 53) - fall back below */
  }
  const raw = await cdp
    .evaluate(
      "JSON.stringify({u:(window.performance&&performance.memory&&performance.memory.usedJSHeapSize)||0,h:(window.performance&&performance.memory&&performance.memory.totalJSHeapSize)||0,n:document.getElementsByTagName('*').length})",
    )
    .catch(() => null);
  const o = raw ? JSON.parse(raw) : {};
  return {
    t: Date.now(),
    taskDuration: 0,
    jsHeapUsed: o.u || 0,
    jsHeapTotal: o.h || 0,
    nodes: o.n || 0,
    listeners: 0,
  };
}

/**
 * CPU fraction between two samples: Δ main-thread task seconds / Δ wall seconds.
 * This is a main-thread CPU proxy (TaskDuration), not full-process CPU%.
 * @param {Sample} a
 * @param {Sample} b
 * @returns {number} percent (0..100+)
 */
export function cpuPercent(a, b) {
  const dWall = (b.t - a.t) / 1000;
  if (dWall <= 0) return 0;
  const dTask = b.taskDuration - a.taskDuration;
  return (dTask / dWall) * 100;
}

/**
 * Average of the numbers in the last `windowMs` of a sample series — used for
 * memory, where playback climbs for ~2 min while the stream buffers.
 * @param {Sample[]} samples
 * @param {(s: Sample) => number} get
 * @param {number} windowMs
 * @returns {number}
 */
export function lastWindowAvg(samples, get, windowMs) {
  if (samples.length === 0) return 0;
  const end = samples[samples.length - 1].t;
  const inWin = samples.filter((s) => end - s.t <= windowMs);
  const used = inWin.length ? inWin : samples;
  return used.reduce((acc, s) => acc + get(s), 0) / used.length;
}

/**
 * @typedef {{ fcp: number | null, lcp: number | null, ttfb: number | null, proxy: boolean }} WebVitals
 */

/**
 * Read FCP / LCP / TTFB from the page's performance entries (ms since nav start).
 * Where the browser emits no paint/LCP timing (e.g. Vizio), fall back to the
 * app's `vzb:first-render` mark and flag the result as a proxy.
 * @param {import('./cdp.js').Cdp} cdp
 * @returns {Promise<WebVitals>}
 */
export async function captureWebVitals(cdp) {
  const expr = `(() => {
    const paint = performance.getEntriesByType('paint');
    const fcpE = paint.find((e) => e.name === 'first-contentful-paint');
    const lcps = performance.getEntriesByType('largest-contentful-paint');
    const nav = performance.getEntriesByType('navigation')[0];
    const mark = performance.getEntriesByName('vzb:first-render')[0];
    const render = mark ? Math.round(mark.startTime) : null;
    const fcpNative = fcpE ? Math.round(fcpE.startTime) : null;
    const lcpNative = lcps.length ? Math.round(lcps[lcps.length - 1].startTime) : null;
    return JSON.stringify({
      fcp: fcpNative ?? render,
      lcp: lcpNative ?? render,
      ttfb: nav ? Math.round(nav.responseStart) : null,
      proxy: fcpNative == null && lcpNative == null,
    });
  })()`;
  try {
    return JSON.parse(await cdp.evaluate(expr));
  } catch {
    return { fcp: null, lcp: null, ttfb: null, proxy: false };
  }
}

/**
 * Sample every intervalMs until durationMs elapses.
 * @param {import('./cdp.js').Cdp} cdp
 * @param {number} durationMs
 * @param {number} intervalMs
 * @param {(s: Sample) => void} [onSample]
 * @returns {Promise<Sample[]>}
 */
export async function sampleFor(cdp, durationMs, intervalMs, onSample) {
  /** @type {Sample[]} */
  const out = [];
  try {
    await cdp.send('Performance.enable');
  } catch {
    /* Performance domain absent (webOS 4) - sample() falls back to evaluate */
  }
  const end = Date.now() + durationMs;
  while (Date.now() < end) {
    const s = await sample(cdp);
    out.push(s);
    if (onSample) onSample(s);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return out;
}
