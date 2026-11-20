// @ts-check
'use strict';

import { pdfDoc } from './pdf.js';
import { phaseMetrics } from './report.js';

/**
 * Build report.pdf: numbers table, per-run table, tools used, method notes.
 * @param {object} args
 * @param {ReturnType<import('./report.js').summarize>} args.summary
 * @param {Record<string, import('./runner.js').RunResult[]>} args.byCase
 * @param {Record<string, import('./cases.js').Case>} args.caseDefs
 * @param {{ platform: string, date: string, homeMs: number, playMs: number }} args.meta
 * @returns {Buffer}
 */
export function buildReportPdf({ summary, byCase, caseDefs, meta }) {
  const doc = pdfDoc();
  const keys = Object.keys(summary.cases);
  const label = (/** @type {string} */ k) => caseDefs[k]?.label ?? k;

  const orNa = (/** @type {number | null} */ x) => (x == null ? 'n/a' : x.toFixed(0));

  doc.title(`Vizbee SDK perf - ${meta.platform}`);
  const runs = summary.cases[keys[0]]?.n ?? '';
  doc.line(
    `Run date ${meta.date}  ·  ${runs} runs per case  ·  each run sampled ~${Math.round(meta.homeMs / 1000)}s on home (idle) + ~${Math.round(meta.playMs / 1000)}s during playback`,
    9,
  );
  if (meta.device && Object.keys(meta.device).length) {
    doc.gap(3);
    doc.heading('Device & run');
    /** @type {import('./pdf.js').Column[]} */
    const devCols = [['Field', 170], ['Value', 390]];
    /** @type {string[][]} */
    const devRows = Object.entries(meta.device).map(([k, v]) => [k, String(v)]);
    doc.table(devCols, devRows);
    doc.gap(3);
  }
  for (const s of [
    'What this measures: the CPU and memory the Vizbee JS SDK (elementless npm variant) adds to the TV app.',
    'Cases: without Vizbee (baseline) | with Vizbee, no sender connected | with Vizbee, a phone sender connected.',
    'Phases: home page idle, then video playback started by a deep link (no casting).',
  ]) {
    doc.line(s, 8);
  }
  doc.gap(6);

  doc.heading('Numbers (median of runs)');
  doc.line('Each case column is the median of its runs. CPU is main-thread; memory is the avg of the last 60s of the phase.', 8);
  doc.line('FCP/LCP/TTFB are page-load web vitals read on the TV; n/a where the browser emits no paint/LCP timing.', 8);
  doc.gap(4);
  /** @type {import('./pdf.js').Column[]} */
  const numCols = [['Metric', 230], ...keys.map((k) => /** @type {[string, number]} */ ([label(k), 110]))];
  /** @type {string[][]} */
  const numRows = [
    ['Home CPU % (main-thread)', ...keys.map((k) => summary.cases[k].homeCpu.toFixed(2))],
    ['Home memory (MB)', ...keys.map((k) => summary.cases[k].homeMem.toFixed(1))],
    ['Playback CPU % (main-thread)', ...keys.map((k) => summary.cases[k].playCpu.toFixed(2))],
    ['Playback memory (MB)', ...keys.map((k) => summary.cases[k].playMem.toFixed(1))],
    [`FCP (ms)${summary.vitalsProxy ? ' *' : ''}`, ...keys.map((k) => orNa(summary.cases[k].fcp))],
    [`LCP (ms)${summary.vitalsProxy ? ' *' : ''}`, ...keys.map((k) => orNa(summary.cases[k].lcp))],
    ['TTFB (ms)', ...keys.map((k) => orNa(summary.cases[k].ttfb))],
    ['runs (n)', ...keys.map((k) => String(summary.cases[k].n))],
  ];
  doc.table(numCols, numRows);
  if (summary.vitalsProxy) {
    doc.line('* FCP/LCP are a render proxy (the app first-render mark): this browser emits no native paint/LCP timing.', 8);
  }

  if (summary.costs.sdk) {
    doc.heading('SDK cost  (no sender - without, paired per video)');
    const c = summary.costs.sdk;
    doc.line(`home: CPU ${c.homeCpu.toFixed(2)}%   mem ${c.homeMem.toFixed(1)} MB        play: CPU ${c.playCpu.toFixed(2)}%   mem ${c.playMem.toFixed(1)} MB   (n=${c.n})`);
  }
  if (summary.costs.sender) {
    doc.heading('Sender cost  (sender - no sender, paired per video)');
    const c = summary.costs.sender;
    doc.line(`home: CPU ${c.homeCpu.toFixed(2)}%   mem ${c.homeMem.toFixed(1)} MB        play: CPU ${c.playCpu.toFixed(2)}%   mem ${c.playMem.toFixed(1)} MB   (n=${c.n})`);
  }

  doc.title('Per-run');
  doc.line('Every run, grouped by case. Videos rotate in the same order across cases, so run i is paired for the cost.', 8);
  doc.gap(4);
  /** @type {import('./pdf.js').Column[]} */
  const prCols = [
    ['Run', 50],
    ['Video', 170],
    ['Home CPU%', 90],
    ['Home MB', 80],
    ['Play CPU%', 90],
    ['Play MB', 80],
  ];
  /** @type {import('./pdf.js').TableRow[]} */
  const prRows = [];
  for (const k of keys) {
    prRows.push({ group: label(k) });
    for (const r of byCase[k] ?? []) {
      const h = phaseMetrics(r.home);
      const p = phaseMetrics(r.play);
      prRows.push([
        String(r.run),
        r.video,
        h.cpu.toFixed(2),
        h.memMB.toFixed(1),
        p.cpu.toFixed(2),
        p.memMB.toFixed(1),
      ]);
    }
  }
  doc.table(prCols, prRows);

  doc.title('Tools & method');
  doc.heading('Tools used');
  /** @type {import('./pdf.js').Column[]} */
  const toolCols = [['Metric', 200], ['Source', 360]];
  /** @type {import('./pdf.js').TableRow[]} */
  const toolRows = [
    ['CPU (main-thread)', 'CDP Performance.getMetrics TaskDuration, delta / wall per 5s sample'],
    ['Memory', 'CDP Performance.getMetrics JSHeapUsedSize, avg of last 60s of phase'],
    ['FCP / LCP / TTFB', 'In-page performance entries (paint, largest-contentful-paint, navigation) read over CDP'],
    ['Attach', `${meta.platform} remote debugging over CDP`],
  ];
  doc.table(toolCols, toolRows);

  doc.heading('Method');
  for (const s of [
    'Cases: without Vizbee; with Vizbee, no sender; with Vizbee, sender connected (phone).',
    'Phases: home/idle then playback (hash deep-link, no casting); fresh relaunch per run; videos rotated in a fixed order.',
    'Builds differ only by the SDK (VZB_ENABLED gate + elementless npm package). Grafana and HomeSSO are constant, so they cancel.',
    'Costs: median of paired per-video run differences, never median minus median (streams vary more than the SDK, memory above all).',
    'CPU is a main-thread proxy (TaskDuration); consistent across cases, so it cancels in the cost.',
    'Memory uses the last 60s of each phase: playback memory climbs ~2 min while the stream buffers, so a whole-phase average measures buffering.',
  ]) {
    doc.para('- ' + s, 150);
  }

  doc.heading('Caveats');
  for (const s of [
    'FCP/LCP are n/a on platforms whose browser emits no paint/LCP timing (e.g. Vizio). There, use the app-render / synthetic web-vitals reported to Grafana instead.',
    'CPU is main-thread only, not full-process %; GPU/compositor/network threads are excluded.',
    'Short runs overweight the launch and buffer burst; use the full 180s / 3-run run for representative numbers.',
    'Web vitals are also sent to Grafana by the app; this report reads them directly from the page for an at-a-glance view.',
  ]) {
    doc.para('- ' + s, 150);
  }
  if (summary.costs.sender) {
    doc.para(
      '- Sender playback memory carries ~2-3 MB of in-page-navigation overhead: to keep the phone session connected, the player is reached by an in-page route (no reload), so part of the home page is retained (a forced GC removes most, not all). The representative sender memory cost is ~+1 MB, measured on the home phase where both cases load fresh.',
      150,
    );
  }

  return doc.build();
}
