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
 * Main-thread busy % from a CPU profile (idle-excluded hits / total hits).
 * Handles both the legacy `head` tree (Chromium 53 / webOS 4) and the flat
 * `nodes`+`samples` format (newer engines).
 * @param {any} p
 * @returns {number | null}
 */
function busyFromProfile(p) {
  if (!p) return null;
  if (p.head) {
    /** @param {any} node @param {string} [name] @returns {number} */
    const hits = (node, name) => {
      let h = !name || node.functionName === name ? node.hitCount || 0 : 0;
      for (const c of node.children || []) h += hits(c, name);
      return h;
    };
    const total = hits(p.head);
    if (!total) return null;
    return (100 * (total - hits(p.head, '(idle)'))) / total;
  }
  if (p.nodes && p.samples) {
    /** @type {Map<number, any>} */
    const byId = new Map(p.nodes.map((/** @type {any} */ n) => [n.id, n]));
    let total = 0;
    let idle = 0;
    for (const s of p.samples) {
      total++;
      const n = byId.get(s);
      const fn = n && (n.callFrame ? n.callFrame.functionName : n.functionName);
      if (fn === '(idle)') idle++;
    }
    return total ? (100 * (total - idle)) / total : null;
  }
  return null;
}

/**
 * Begin a CPU profile (the only main-thread-CPU source on webOS 4, where the
 * Performance domain is absent). Returns true if the Profiler domain is usable.
 * @param {import('./cdp.js').Cdp} cdp
 * @returns {Promise<boolean>}
 */
export async function startCpuProfile(cdp) {
  try {
    await cdp.send('Profiler.enable');
    try {
      await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
    } catch {
      /* default interval */
    }
    await cdp.send('Profiler.start');
    return true;
  } catch {
    return false;
  }
}

/**
 * Stop the CPU profile and return main-thread busy % over the window.
 * @param {import('./cdp.js').Cdp} cdp
 * @returns {Promise<number | null>}
 */
export async function stopCpuProfile(cdp) {
  try {
    const r = await cdp.send('Profiler.stop');
    return busyFromProfile(r && r.profile);
  } catch {
    return null;
  }
}

/**
 * Begin allocation sampling (HeapProfiler). On webOS 4 the retained-heap sources
 * (performance.memory, Runtime.getHeapUsage) are stubbed/absent and full heap
 * snapshots hang, but the sampling allocation profiler works and reports real
 * bytes allocated over the window - a memory-churn signal.
 * @param {import('./cdp.js').Cdp} cdp
 * @returns {Promise<boolean>}
 */
export async function startHeapSampling(cdp) {
  try {
    await cdp.send('HeapProfiler.enable');
    await cdp.send('HeapProfiler.startSampling', { samplingInterval: 16384 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Stop allocation sampling; return total bytes allocated over the window.
 * @param {import('./cdp.js').Cdp} cdp
 * @returns {Promise<number | null>}
 */
export async function stopHeapSampling(cdp) {
  try {
    const r = await cdp.send('HeapProfiler.stopSampling');
    const p = r && r.profile;
    if (!p || !p.head) return null;
    /** @param {any} n @returns {number} */
    const sum = (n) => {
      let s = n.selfSize || 0;
      for (const c of n.children || []) s += sum(c);
      return s;
    };
    return sum(p.head);
  } catch {
    return null;
  }
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
 * Video playback quality for the current <video> (cumulative over the element's
 * life = this playback). Uses getVideoPlaybackQuality (Chrome 42+, so webOS 4
 * works), falling back to the legacy webkitDroppedFrameCount counters.
 * @param {import('./cdp.js').Cdp} cdp
 * @returns {Promise<{ droppedFrames: number | null, totalFrames: number | null, droppedPct: number | null }>}
 */
export async function captureVideoQuality(cdp) {
  const expr = `(function(){
    var v=document.querySelector('video'); if(!v) return null;
    if (v.getVideoPlaybackQuality){ var q=v.getVideoPlaybackQuality(); return JSON.stringify({d:q.droppedVideoFrames,t:q.totalVideoFrames}); }
    if (typeof v.webkitDroppedFrameCount==='number') return JSON.stringify({d:v.webkitDroppedFrameCount,t:(v.webkitDecodedFrameCount||0)+(v.webkitDroppedFrameCount||0)});
    return null;
  })()`;
  try {
    const raw = await cdp.evaluate(expr);
    if (!raw) return { droppedFrames: null, totalFrames: null, droppedPct: null };
    const o = JSON.parse(raw);
    const droppedPct = o.t > 0 ? (100 * o.d) / o.t : null;
    return { droppedFrames: o.d, totalFrames: o.t, droppedPct };
  } catch {
    return { droppedFrames: null, totalFrames: null, droppedPct: null };
  }
}

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
