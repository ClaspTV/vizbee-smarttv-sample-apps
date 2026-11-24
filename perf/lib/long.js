// @ts-check
'use strict';

import { cpuPercent, lastWindowAvg, sampleFor, captureWebVitals } from './metrics.js';
import { INTERVAL_MS, MARKER_TIMEOUT_MS, MEM_WINDOW_MS } from './constants.js';

/**
 * Long run: one served build per case, a long home page, then several long
 * playbacks, measured in ONE app session — matching the Roku long run. After a
 * single boot, phases move home <-> player through the app's own in-memory
 * router (window.__perf.router, exposed by the __PERF_HOOKS__ build), so the JS
 * heap carries across playbacks: the leak signals are both the per-playback
 * heap slope (MB/min) and the memory-by-playback progression. router.navigate
 * never touches history, so it never trips the hardware-BACK -> exit-modal path
 * (that modal is only a real BACK keypress on the home page).
 *
 * If the hook is absent (a build without __PERF_HOOKS__), the run falls back to
 * a full deep-link reload per phase; memory then does not carry across
 * playbacks and only the within-playback slope is meaningful (noted per case).
 *
 * @typedef {import('./metrics.js').Sample} Sample
 * @typedef {{ id: string, title: string, url: string, durationSec?: number, isLive?: boolean }} LongVideo
 *
 * @typedef {{
 *   cpu: number,
 *   usedEndMB: number,
 *   usedPeakMB: number,
 *   slopeMBMin: number,
 *   nodes: number,
 *   listeners: number,
 *   secs: number
 * }} PhaseResult
 *
 * @typedef {{
 *   n: number,
 *   video: string,
 *   play: PhaseResult,
 *   vstSecs: number | null,
 *   after: PhaseResult | null,
 *   notes: string[]
 * }} PlayResult
 *
 * @typedef {{
 *   key: string,
 *   label: string,
 *   withVizbee: boolean,
 *   video: string,
 *   notes: string[],
 *   failed?: string,
 *   home: PhaseResult | null,
 *   plays: PlayResult[]
 * }} CaseResult
 */

/** @param {number} ms */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Whether `v` can carry a playback of `secs` (live always can; a VOD needs a
 * minute to spare).
 * @param {LongVideo | undefined} v
 * @param {number} secs
 * @returns {boolean}
 */
export function longEnough(v, secs) {
  if (!v) return false;
  if (v.isLive) return true;
  return typeof v.durationSec === 'number' && v.durationSec >= secs + 60;
}

/**
 * Least-squares slope of ys over xs (ys units per one x unit).
 * @param {number[]} xs
 * @param {number[]} ys
 * @returns {number}
 */
function slope(xs, ys) {
  const n = xs.length;
  if (n < 2) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den ? num / den : 0;
}

/**
 * Phase metrics for one sample series: avg main-thread CPU, memory over the
 * last 60s, peak memory, heap slope (MB/min) over the whole phase, DOM nodes.
 * @param {Sample[]} samples
 * @returns {PhaseResult}
 */
export function phaseStats(samples) {
  /** @type {number[]} */
  const cpus = [];
  for (let i = 1; i < samples.length; i++) cpus.push(cpuPercent(samples[i - 1], samples[i]));
  const cpu = cpus.length ? cpus.reduce((a, b) => a + b, 0) / cpus.length : 0;
  const usedEndMB = lastWindowAvg(samples, (s) => s.jsHeapUsed, MEM_WINDOW_MS) / 1e6;
  const usedPeakMB = samples.length ? Math.max(...samples.map((s) => s.jsHeapUsed)) / 1e6 : 0;
  const t0 = samples.length ? samples[0].t : 0;
  const mins = samples.map((s) => (s.t - t0) / 60000);
  const slopeMBMin = slope(mins, samples.map((s) => s.jsHeapUsed / 1e6));
  const last = samples[samples.length - 1];
  const secs = last ? (last.t - t0) / 1000 : 0;
  return {
    cpu,
    usedEndMB,
    usedPeakMB,
    slopeMBMin,
    nodes: last ? last.nodes : 0,
    listeners: last ? last.listeners : 0,
    secs,
  };
}

/**
 * Run one case: one served build, long home page, then `plays` long playbacks.
 * `onProgress` is called after every phase so a partial report can be written.
 * @param {object} p
 * @param {import('./device/index.js').Device} p.dev
 * @param {string} p.url
 * @param {import('./cases.js').Case} p.case_
 * @param {{
 *   idle: number, play: number, plays: number, after: number, warmup: number,
 *   video: string, fallbacks: string[], videos: Record<string, LongVideo>,
 *   phone?: import('./phone.js').Phone | null, tvName?: string
 * }} p.o
 * @param {(line: string) => void} p.log
 * @param {(rec: Record<string, unknown>) => void} p.writeSample
 * @param {(r: CaseResult) => void} p.onProgress
 * @returns {Promise<CaseResult>}
 */
export async function runLongCase({ dev, url, case_, o, log, writeSample, onProgress }) {
  /** @type {CaseResult} */
  const r = {
    key: case_.key,
    label: case_.label,
    withVizbee: case_.withVizbee,
    video: o.video,
    notes: [],
    home: null,
    plays: [],
  };
  const cdp = await dev.attach();
  await cdp.send('Runtime.enable');
  try {
    await cdp.send('Performance.enable');
  } catch {
    /* Performance domain absent (webOS 4 / Chromium 53) - sample() falls back */
  }

  /** @type {Set<string>} */
  const dead = new Set();
  let video = o.video;
  let inPage = false;

  const HOME_READY = "document.querySelectorAll('.video-card').length>0";
  const VIDEO_PLAYING =
    "(function(){var v=document.querySelector('video');return !!(v&&v.readyState>=2&&!v.paused&&v.currentTime>0)})()";

  /** Poll an expression over CDP instead of relying on console markers (which
   * do not surface on Chromium 53). @param {string} expr @param {number} timeoutMs @param {string} label */
  const waitUntil = async (expr, timeoutMs, label) => {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      const ok = await cdp.evaluate(expr).catch(() => false);
      if (ok) return;
      await sleep(500);
    }
    throw new Error(`timeout waiting for ${label}`);
  };

  const bootHome = async () => {
    await dev.navigate(url);
    await waitUntil(HOME_READY, MARKER_TIMEOUT_MS, 'home ready');
  };

  const gotoHome = async () => {
    if (inPage) {
      await cdp.evaluate("window.__perf.router.back('/home')");
      await waitUntil(HOME_READY, MARKER_TIMEOUT_MS, 'home ready').catch(() => {});
    } else {
      await bootHome();
    }
  };

  /** @param {string[]} notes @returns {Promise<number>} navigation time */
  const startPlayback = async (notes) => {
    for (let attempt = 0; ; attempt++) {
      const tp = Date.now();
      if (inPage) await cdp.evaluate(`window.__perf.router.navigate('/player/${video}')`);
      else await dev.navigate(`${url}#/player/${video}`);
      try {
        await waitUntil(VIDEO_PLAYING, MARKER_TIMEOUT_MS, 'video playing');
        return tp;
      } catch {
        dead.add(video);
      }
      const next = o.fallbacks.find((v) => !dead.has(v) && longEnough(o.videos[v], o.play));
      if (!next || attempt >= 3) {
        throw new Error(
          `stream failed: ${o.videos[video]?.title ?? video} would not play and no working fallback long enough`,
        );
      }
      notes.push(`${o.videos[video]?.title ?? video} would not play; ${o.videos[next].title} used from here on`);
      log(`  ${o.videos[video]?.title ?? video} would not play; switching to ${o.videos[next].title}`);
      video = next;
      r.video = video;
    }
  };

  await bootHome();
  inPage = await cdp.evaluate('!!(window.__perf && window.__perf.router)').catch(() => false);
  if (!inPage) {
    r.notes.push(
      'perf router hook (__PERF_HOOKS__) absent in this build; used full reloads between phases, so memory does not carry across playbacks',
    );
  }
  log(`${case_.label}: app launched${inPage ? ' (single session, in-page nav)' : ' (full-reload fallback)'}`);

  if (case_.sender) {
    if (o.phone && o.tvName) {
      try {
        await o.phone.restartApp();
        await o.phone.ensureDisconnected();
        const c = await o.phone.connect(o.tvName);
        if (!c.connectedAt) r.notes.push('phone connect not seen in logcat');
        else log(`${case_.label}: sender connected`);
      } catch (e) {
        r.notes.push(`sender connect failed: ${/** @type {Error} */ (e).message}`);
      }
    } else {
      r.notes.push('sender case requested but no phone available (connect step is a stub)');
    }
  }

  if (o.warmup) {
    /** @type {string[]} */
    const notes = [];
    await startPlayback(notes);
    r.notes.push(...notes);
    await sleep(o.warmup * 1000);
    await gotoHome();
    log(`${case_.label}: warm-up playback ${o.warmup}s done`);
  }

  const home = await sampleFor(cdp, o.idle * 1000, INTERVAL_MS, (s) =>
    writeSample({ case: case_.key, phase: 'home', video, ...s }),
  );
  r.home = phaseStats(home);
  log(`  RESULT ${case_.label}, home page ${o.idle}s: ${phaseLine(r.home)}`);
  onProgress(r);

  for (let n = 1; n <= o.plays; n++) {
    /** @type {string[]} */
    const notes = [];
    const tp = await startPlayback(notes);
    const vstSecs = (Date.now() - tp) / 1000;
    const vitals = await captureWebVitals(cdp);
    writeSample({ case: case_.key, phase: 'vitals', play: n, video, ...vitals });

    const pb = await sampleFor(cdp, o.play * 1000, INTERVAL_MS, (s) =>
      writeSample({ case: case_.key, phase: `play-${n}`, video, ...s }),
    );

    /** @type {PhaseResult | null} */
    let after = null;
    await gotoHome();
    if (o.after > 0) {
      const a = await sampleFor(cdp, o.after * 1000, INTERVAL_MS, (s) =>
        writeSample({ case: case_.key, phase: `after-${n}`, video, ...s }),
      );
      after = phaseStats(a);
    }

    /** @type {PlayResult} */
    const pr = { n, video, play: phaseStats(pb), vstSecs, after, notes };
    r.plays.push(pr);
    log(`  RESULT ${case_.label}, playback ${n}/${o.plays}: ${playLine(pr, o.videos)}`);
    onProgress(r);
  }

  if (case_.sender && o.phone) {
    try {
      await o.phone.ensureDisconnected();
    } catch {
      /* ignore */
    }
  }
  return r;
}

/** @param {number | null | undefined} v @param {number} [d] */
const f = (v, d = 1) => (v === null || v === undefined ? 'n/a' : (+v).toFixed(d));

/** @param {PhaseResult} p */
export function phaseLine(p) {
  return `cpu ${f(p.cpu)}% used ${f(p.usedEndMB)} MB peak ${f(p.usedPeakMB)} slope ${f(p.slopeMBMin, 2)} MB/min nodes ${f(p.nodes, 0)}`;
}

/** @param {PlayResult} p @param {Record<string, LongVideo>} videos */
export function playLine(p, videos) {
  const title = videos[p.video] ? videos[p.video].title : p.video;
  return (
    `${title}, ${Math.round(p.play.secs)}s: ${phaseLine(p.play)} vst ${f(p.vstSecs, 2)}s` +
    (p.after ? ` | after: ${phaseLine(p.after)}` : '') +
    (p.notes.length ? ` | ${p.notes.join('; ')}` : '')
  );
}
