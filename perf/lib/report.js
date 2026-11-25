// @ts-check
'use strict';

import fs from 'node:fs';
import { cpuPercent, lastWindowAvg } from './metrics.js';
import { MEM_WINDOW_MS } from './constants.js';

/**
 * Rebuild per-case run results from a samples.jsonl file (re-runnable reports).
 * @param {string} jsonlPath
 * @returns {Record<string, import('./runner.js').RunResult[]>}
 */
export function loadRuns(jsonlPath) {
  const lines = fs.readFileSync(jsonlPath, 'utf8').split('\n').filter(Boolean);
  /** @type {Record<string, Record<number, import('./runner.js').RunResult>>} */
  const acc = {};
  for (const ln of lines) {
    /** @type {any} */
    const r = JSON.parse(ln);
    acc[r.case] ??= {};
    acc[r.case][r.run] ??= { run: r.run, video: r.video, home: [], play: [] };
    if (r.phase === 'vitals') {
      acc[r.case][r.run].vitals = {
        fcp: r.fcp ?? null,
        lcp: r.lcp ?? null,
        ttfb: r.ttfb ?? null,
        proxy: Boolean(r.proxy),
      };
      continue;
    }
    /** @type {import('./metrics.js').Sample} */
    const s = {
      t: r.t,
      taskDuration: r.taskDuration,
      jsHeapUsed: r.jsHeapUsed,
      jsHeapTotal: r.jsHeapTotal,
      nodes: r.nodes,
      listeners: r.listeners,
    };
    if (r.phase === 'home') acc[r.case][r.run].home.push(s);
    else acc[r.case][r.run].play.push(s);
  }
  /** @type {Record<string, import('./runner.js').RunResult[]>} */
  const out = {};
  for (const [k, runs] of Object.entries(acc)) {
    out[k] = Object.values(runs).sort((a, b) => a.run - b.run);
  }
  return out;
}

/**
 * @typedef {import('./metrics.js').Sample} Sample
 * @typedef {import('./runner.js').RunResult} RunResult
 * @typedef {{ cpu: number, cpuP95: number, memMB: number, memP95MB: number, memPeakMB: number }} PhaseMetric
 */

/**
 * Per-phase metrics for one run: average and p95 main-thread CPU, memory over
 * the last 60s (steady), memory p95 and peak over the whole phase.
 * @param {Sample[]} samples
 * @returns {PhaseMetric}
 */
export function phaseMetrics(samples) {
  /** @type {number[]} */
  const cpus = [];
  for (let i = 1; i < samples.length; i++) cpus.push(cpuPercent(samples[i - 1], samples[i]));
  const cpu = cpus.length ? cpus.reduce((a, b) => a + b, 0) / cpus.length : 0;
  const cpuP95 = p95(cpus) ?? 0;
  const memMB = lastWindowAvg(samples, (s) => s.jsHeapUsed, MEM_WINDOW_MS) / 1e6;
  const mems = samples.map((s) => s.jsHeapUsed / 1e6);
  const memP95MB = p95(mems) ?? 0;
  const memPeakMB = mems.length ? Math.max(...mems) : 0;
  return { cpu, cpuP95, memMB, memP95MB, memPeakMB };
}

/** @param {number[]} nums @returns {number} */
export function median(nums) {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * 95th percentile, nearest rank: the value 95% of the samples are at or below.
 * With few samples it is (close to) the largest one. Null when empty.
 * @param {(number | null | undefined)[]} nums
 * @returns {number | null}
 */
export function p95(nums) {
  const v = /** @type {number[]} */ (nums.filter((n) => typeof n === 'number' && isFinite(n))).sort((a, b) => a - b);
  return v.length ? v[Math.max(0, Math.ceil(0.95 * v.length) - 1)] : null;
}

/** p95 over per-run values, or null. @param {(number | null | undefined)[]} nums */
export function p95OrNull(nums) {
  return p95(nums);
}

/** The phrase explaining average / p95 / peak, shared by every report. */
export const P95_NOTE =
  'Average = steady cost (memory: avg of the last 60s of the phase); p95 = 95% of the 5s samples in the phase are at or below it (bursts); peak = highest sample.';

/** @param {(number | null | undefined)[]} nums @returns {number | null} */
export function medianOrNull(nums) {
  const vals = /** @type {number[]} */ (nums.filter((n) => typeof n === 'number'));
  return vals.length ? median(vals) : null;
}

/**
 * Build the numbers table: per-case medians + paired SDK/sender cost.
 * @param {Record<string, RunResult[]>} byCase
 * @returns {{
 *   cases: Record<string, { homeCpu:number, homeCpuP95:number, homeMem:number, homeMemP95:number, homeMemPeak:number, playCpu:number, playCpuP95:number, playMem:number, playMemP95:number, playMemPeak:number, fcp:number|null, lcp:number|null, ttfb:number|null, n:number }>,
 *   costs: { sdk?: PairedCost, sender?: PairedCost },
 *   vitalsProxy: boolean
 * }}
 */
export function summarize(byCase) {
  /** @type {Record<string, any>} */
  const cases = {};
  /** @type {Record<string, { home: PhaseMetric[], play: PhaseMetric[] }>} */
  const perRun = {};

  for (const [key, runs] of Object.entries(byCase)) {
    perRun[key] = {
      home: runs.map((r) => phaseMetrics(r.home)),
      play: runs.map((r) => phaseMetrics(r.play)),
    };
    cases[key] = {
      homeCpu: median(perRun[key].home.map((m) => m.cpu)),
      homeCpuP95: median(perRun[key].home.map((m) => m.cpuP95)),
      homeMem: median(perRun[key].home.map((m) => m.memMB)),
      homeMemP95: median(perRun[key].home.map((m) => m.memP95MB)),
      homeMemPeak: median(perRun[key].home.map((m) => m.memPeakMB)),
      playCpu: median(perRun[key].play.map((m) => m.cpu)),
      playCpuP95: median(perRun[key].play.map((m) => m.cpuP95)),
      playMem: median(perRun[key].play.map((m) => m.memMB)),
      playMemP95: median(perRun[key].play.map((m) => m.memP95MB)),
      playMemPeak: median(perRun[key].play.map((m) => m.memPeakMB)),
      fcp: medianOrNull(runs.map((r) => r.vitals?.fcp)),
      lcp: medianOrNull(runs.map((r) => r.vitals?.lcp)),
      ttfb: medianOrNull(runs.map((r) => r.vitals?.ttfb)),
      n: runs.length,
    };
  }

  const costs = {};
  if (byCase.without && byCase.nosender) costs.sdk = pairedCost(byCase.without, byCase.nosender);
  if (byCase.nosender && byCase.sender) costs.sender = pairedCost(byCase.nosender, byCase.sender);
  const vitalsProxy = Object.values(byCase).some((runs) => runs.some((r) => r.vitals?.proxy));
  return { cases, costs, vitalsProxy };
}

/**
 * @typedef {{ homeCpu:number, homeMem:number, playCpu:number, playMem:number, n:number }} PairedCost
 */

/**
 * Median of per-run paired differences (b − a) for runs that played the same
 * video. Never median(b) − median(a): streams vary more than the SDK does.
 * @param {RunResult[]} a
 * @param {RunResult[]} b
 * @returns {PairedCost}
 */
export function pairedCost(a, b) {
  /** @type {number[]} */ const hc = [];
  /** @type {number[]} */ const hm = [];
  /** @type {number[]} */ const pc = [];
  /** @type {number[]} */ const pm = [];
  for (const rb of b) {
    const ra = a.find((x) => x.run === rb.run && x.video === rb.video);
    if (!ra) continue;
    const a1 = { home: phaseMetrics(ra.home), play: phaseMetrics(ra.play) };
    const b1 = { home: phaseMetrics(rb.home), play: phaseMetrics(rb.play) };
    hc.push(b1.home.cpu - a1.home.cpu);
    hm.push(b1.home.memMB - a1.home.memMB);
    pc.push(b1.play.cpu - a1.play.cpu);
    pm.push(b1.play.memMB - a1.play.memMB);
  }
  return {
    homeCpu: median(hc),
    homeMem: median(hm),
    playCpu: median(pc),
    playMem: median(pm),
    n: hc.length,
  };
}

/**
 * @typedef {ReturnType<typeof summarize>['cases'][string]} CaseSummary
 */

/**
 * Plain-text numbers table for the console / summary.md.
 * @param {ReturnType<typeof summarize>} s
 * @param {Record<string, { label?: string }>} caseDefs
 * @returns {string}
 */
export function textTable(s, caseDefs) {
  const rows = [];
  rows.push('Metric                         ' + Object.keys(s.cases).map((k) => k.padStart(12)).join(''));
  /** @param {string} label @param {(c: CaseSummary) => string} get */
  const line = (label, get) =>
    label.padEnd(30) + Object.keys(s.cases).map((k) => get(s.cases[k]).padStart(12)).join('');
  const orNa = (/** @type {number|null} */ x) => (x == null ? 'n/a' : x.toFixed(0));
  rows.push(line('Home CPU % (main-thread)', (c) => c.homeCpu.toFixed(2)));
  rows.push(line('Home CPU p95 %', (c) => c.homeCpuP95.toFixed(2)));
  rows.push(line('Home memory (MB)', (c) => c.homeMem.toFixed(1)));
  rows.push(line('Home memory p95 (MB)', (c) => c.homeMemP95.toFixed(1)));
  rows.push(line('Home memory peak (MB)', (c) => c.homeMemPeak.toFixed(1)));
  rows.push(line('Playback CPU % (main-thread)', (c) => c.playCpu.toFixed(2)));
  rows.push(line('Playback CPU p95 %', (c) => c.playCpuP95.toFixed(2)));
  rows.push(line('Playback memory (MB)', (c) => c.playMem.toFixed(1)));
  rows.push(line('Playback memory p95 (MB)', (c) => c.playMemP95.toFixed(1)));
  rows.push(line('Playback memory peak (MB)', (c) => c.playMemPeak.toFixed(1)));
  const px = s.vitalsProxy ? ' *' : '';
  rows.push(line('FCP (ms)' + px, (c) => orNa(c.fcp)));
  rows.push(line('LCP (ms)' + px, (c) => orNa(c.lcp)));
  rows.push(line('TTFB (ms)', (c) => orNa(c.ttfb)));
  rows.push(line('runs (n)', (c) => String(c.n)));
  if (s.vitalsProxy) {
    rows.push('* FCP/LCP = render proxy (vzb:first-render); this browser emits no native paint/LCP timing');
  }
  if (s.costs.sdk) {
    rows.push('');
    rows.push(`SDK cost (nosender − without, paired, n=${s.costs.sdk.n}):`);
    rows.push(`  home: CPU ${s.costs.sdk.homeCpu.toFixed(2)}%  mem ${s.costs.sdk.homeMem.toFixed(1)}MB`);
    rows.push(`  play: CPU ${s.costs.sdk.playCpu.toFixed(2)}%  mem ${s.costs.sdk.playMem.toFixed(1)}MB`);
  }
  if (s.costs.sender) {
    rows.push(`Sender cost (sender − nosender, paired, n=${s.costs.sender.n}):`);
    rows.push(`  home: CPU ${s.costs.sender.homeCpu.toFixed(2)}%  mem ${s.costs.sender.homeMem.toFixed(1)}MB`);
    rows.push(`  play: CPU ${s.costs.sender.playCpu.toFixed(2)}%  mem ${s.costs.sender.playMem.toFixed(1)}MB`);
  }
  return rows.join('\n');
}
