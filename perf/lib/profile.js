// @ts-check
'use strict';

/**
 * @typedef {{ key: string, fn: string, url: string, line: number, value: number }} ProfRow
 */

/** @param {string} url @returns {string} */
function basename(url) {
  const u = String(url).split('?')[0];
  const parts = u.split('/');
  return parts[parts.length - 1] || u;
}

/**
 * @param {any} cf
 * @returns {{ fn: string, url: string, line: number, key: string }}
 */
function frameKey(cf) {
  const fn = cf?.functionName || '(anonymous)';
  const url = basename(cf?.url || '');
  const line = (cf?.lineNumber ?? -1) + 1;
  return { fn, url, line, key: `${fn}|${url}:${line}` };
}

/**
 * CPU profile for durationMs; self-time per frame in ms, descending.
 * @param {import('./cdp.js').Cdp} cdp
 * @param {number} durationMs
 * @returns {Promise<ProfRow[]>}
 */
export async function captureCpuProfile(cdp, durationMs) {
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await cdp.send('Profiler.start');
  await new Promise((r) => setTimeout(r, durationMs));
  const { profile } = await cdp.send('Profiler.stop');
  return aggregateCpu(profile);
}

/**
 * @param {any} profile
 * @returns {ProfRow[]}
 */
export function aggregateCpu(profile) {
  const nodes = profile?.nodes ?? [];
  /** @type {Map<number, any>} */
  const byId = new Map(nodes.map((/** @type {any} */ n) => [n.id, n]));
  /** @type {Map<number, number>} */
  const selfUs = new Map();
  const samples = profile?.samples ?? [];
  const deltas = profile?.timeDeltas ?? [];
  for (let i = 0; i < samples.length; i++) {
    const id = samples[i];
    selfUs.set(id, (selfUs.get(id) ?? 0) + (deltas[i] ?? 0));
  }
  /** @type {Map<string, ProfRow>} */
  const agg = new Map();
  for (const [id, us] of selfUs) {
    const n = byId.get(id);
    if (!n) continue;
    const { fn, url, line, key } = frameKey(n.callFrame);
    const row = agg.get(key) ?? { key, fn, url, line, value: 0 };
    row.value += us / 1000;
    agg.set(key, row);
  }
  return [...agg.values()].sort((a, b) => b.value - a.value);
}

/**
 * Heap allocation sampling for durationMs; self-size per frame in bytes, descending.
 * @param {import('./cdp.js').Cdp} cdp
 * @param {number} durationMs
 * @returns {Promise<ProfRow[]>}
 */
export async function captureHeapProfile(cdp, durationMs) {
  await cdp.send('HeapProfiler.enable');
  await cdp.send('HeapProfiler.startSampling', { samplingInterval: 32768 });
  await new Promise((r) => setTimeout(r, durationMs));
  const { profile } = await cdp.send('HeapProfiler.stopSampling');
  return aggregateHeap(profile);
}

/**
 * @param {any} profile
 * @returns {ProfRow[]}
 */
export function aggregateHeap(profile) {
  /** @type {Map<string, ProfRow>} */
  const agg = new Map();
  /** @param {any} node */
  const walk = (node) => {
    if (!node) return;
    const { fn, url, line, key } = frameKey(node.callFrame);
    const row = agg.get(key) ?? { key, fn, url, line, value: 0 };
    row.value += node.selfSize ?? 0;
    agg.set(key, row);
    for (const c of node.children ?? []) walk(c);
  };
  if (profile?.head) walk(profile.head);
  return [...agg.values()].sort((a, b) => b.value - a.value);
}
