// @ts-check
'use strict';

/*
 * The "Measurement tools" table every perf report ends with: each metric (and
 * each piece of the setup) -> the tool that produced it -> its version/engine,
 * so every number in the report has a source. Adapted to the smart-TV web
 * harness, which drives the TV browser over the Chrome DevTools Protocol (CDP).
 */

/** @typedef {import('./pdf.js').Column} Column */

/** @type {Column[]} */
export const TOOL_COLS = [['Metric', 165], ['Tool / source', 430], ['Engine / version', 125]];

/** Older runs did not save every version. */
const NR = '-';

/**
 * The engine string shown against each CDP-sourced row: the TV browser.
 * @param {any} meta
 */
function engineOf(meta) {
  const dev = meta.device || {};
  const parts = [meta.platform || dev.Platform, dev.Model, dev.Firmware && `firmware ${dev.Firmware}`].filter(Boolean);
  return parts.join(', ') || (meta.platform ?? NR);
}

/**
 * @param {any} meta  run meta (platform, device, sdkVariant, phone, mux*, node)
 * @param {{ script: string, vizbee?: boolean, mux?: boolean, phone?: boolean, vitals?: boolean, video?: boolean, external?: boolean }} o
 *   script: the runner (e.g. 'perf-long.js'); vizbee / mux: an SDK is measured;
 *   phone: a sender case; vitals: FCP/LCP/TTFB are in the report; video: VST and
 *   dropped frames are in the report; external: hide internal rows (runner, node).
 * @returns {string[][]}
 */
export function toolRows(meta, o) {
  const eng = engineOf(meta);
  /** @type {string[][]} */
  const rows = [
    ['CPU average / p95', 'CDP Performance.getMetrics TaskDuration every 5s (delta / wall %); where that domain is absent (webOS 4) the CDP Profiler sampling profile, idle-excluded. Average and p95 of the phase', eng],
    ['Memory used / p95 / peak', 'CDP Performance.getMetrics JSHeapUsedSize every 5s; average of the last 60s (steady), p95 and max over the phase', eng],
    ['DOM nodes', 'CDP Performance.getMetrics Nodes (document element count fallback on webOS 4), read per sample', eng],
  ];
  if (o.vitals) rows.push(['FCP / LCP / TTFB', 'In-page performance entries (paint, largest-contentful-paint, navigation) read over CDP; a render-proxy (vzb:first-render) where the browser emits no native paint/LCP timing', eng]);
  if (o.video) rows.push(
    ['Video start time (VST)', 'CDP Page.navigate to #/player/<id> -> poll video.readyState>=2 & currentTime>0, wall clock', eng],
    ['Dropped frames', 'HTMLVideoElement.getVideoPlaybackQuality() at the end of each playback: droppedVideoFrames / totalVideoFrames (n/a where the native pipeline reports 0/0)', eng]);
  rows.push(['Phases / attach', `${meta.platform ?? 'TV'} remote debugging over CDP: launch the app, hash deep-link to start playback, [VZBPERF] console markers for timing`, eng]);
  if (o.phone) rows.push(['Sender (phone)', 'adb drives the Vizbee demo app on the phone; connect/disconnect confirmed by the phone cast state', meta.phone || NR]);
  if (o.vizbee) rows.push(['Vizbee JS SDK', 'The elementless npm SDK variant built into the sample app (VZB_ENABLED gate)', meta.sdkVariant || (meta.device && meta.device['SDK variant']) || NR]);
  if (o.mux) rows.push(['Mux Data', `mux-embed monitoring the player${meta.muxEnvKey === false ? ' (no env key: loads and measures, sends no data)' : ''}`, meta.muxVersion || 'mux-embed']);
  if (!o.external) rows.push(['Runner', `perf/${o.script} (Node.js): builds each case, runs the phases and writes this report`, meta.node || `Node ${process.version}`]);
  return rows;
}
