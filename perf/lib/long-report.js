// @ts-check
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { pdfDoc } from './pdf.js';
import { median } from './report.js';

/**
 * Report of a long run (perf-long.js): report.pdf, summary.md, results.json.
 * Cases are shown in run order; costs are against "Without Vizbee".
 *
 * @typedef {import('./long.js').CaseResult} CaseResult
 * @typedef {import('./long.js').PlayResult} PlayResult
 * @typedef {import('./long.js').PhaseResult} PhaseResult
 * @typedef {import('./long.js').LongVideo} LongVideo
 * @typedef {Record<string, CaseResult>} LongResults
 */

/** Column order preference; only cases present in the results are shown. */
export const LONG_CASES = /** @type {Array<[string, string]>} */ ([
  ['nosender', 'With Vizbee (no sender)'],
  ['sender', 'With Vizbee (sender)'],
  ['without', 'Without Vizbee'],
]);

/** @param {(number | null | undefined)[]} xs @returns {number | null} */
function med(xs) {
  const v = /** @type {number[]} */ (xs.filter((x) => typeof x === 'number' && isFinite(x)));
  return v.length ? median(v) : null;
}

/** @param {number | null} v @param {number} d */
const fmtV = (v, d) => (v === null ? 'n/a' : v.toFixed(d));

/** @param {number | null} a @param {number | null} b @param {number} d */
function delta(a, b, d) {
  if (a === null || b === null) return 'n/a';
  const x = a - b;
  return `${x >= 0 ? '+' : ''}${x.toFixed(d)}`;
}

/** [label, unit, digits, value-of-a-case | null for a group heading, kind] */
const ROWS = /** @type {Array<[string, string, number, ((c: CaseResult) => number | null) | null, string]>} */ ([
  ['Home page', '', 0, null, ''],
  ['CPU average', '%', 2, (c) => (c.home ? c.home.cpu : null), 'cpu'],
  ['Memory used', 'MB', 1, (c) => (c.home ? c.home.usedEndMB : null), 'mem'],
  ['Heap slope', 'MB/min', 2, (c) => (c.home ? c.home.slopeMBMin : null), 'mem'],
  ['Playback (median of the playbacks)', '', 0, null, ''],
  ['CPU average', '%', 2, (c) => med(c.plays.map((p) => p.play.cpu)), 'cpu'],
  ['Memory used', 'MB', 1, (c) => med(c.plays.map((p) => p.play.usedEndMB)), 'mem'],
  ['Memory peak', 'MB', 1, (c) => med(c.plays.map((p) => p.play.usedPeakMB)), 'mem'],
  ['Heap slope (leak signal)', 'MB/min', 2, (c) => med(c.plays.map((p) => p.play.slopeMBMin)), 'mem'],
  ['Video start time (VST)', 's', 2, (c) => med(c.plays.map((p) => p.vstSecs)), 'vst'],
  ['Home page after each playback (median)', '', 0, null, ''],
  ['CPU average', '%', 2, (c) => med(c.plays.map((p) => (p.after ? p.after.cpu : null))), 'cpu'],
  ['Memory used', 'MB', 1, (c) => med(c.plays.map((p) => (p.after ? p.after.usedEndMB : null))), 'mem'],
]);

/**
 * Which metrics the capturing engine could actually provide. On Chromium 53 /
 * webOS 4 there is no CDP Performance domain (CPU TaskDuration is 0) and
 * performance.memory is quantized to a constant, so CPU and heap are degenerate
 * and must be shown as n/a rather than as measured 0.00 / flat values.
 * @param {LongResults} r
 */
function capability(r) {
  /** @type {import('./long.js').PhaseResult[]} */
  const ps = [];
  for (const k of Object.keys(r)) {
    const c = r[k];
    if (!c) continue;
    if (c.home) ps.push(c.home);
    for (const p of c.plays) {
      ps.push(p.play);
      if (p.after) ps.push(p.after);
    }
  }
  const cpuAvailable = ps.some((p) => p && p.cpu > 0);
  const mem = ps.map((p) => p && p.usedEndMB).filter((x) => typeof x === 'number');
  const memReliable = new Set(mem.map((v) => Math.round(/** @type {number} */ (v) * 10))).size > 1;
  return { cpuAvailable, memReliable };
}

/** Cases present, in preferred order. @param {LongResults} r */
function presentCases(r) {
  return LONG_CASES.filter(([k]) => r[k] && (r[k].home || r[k].plays.length));
}

/**
 * Main table rows: a group heading, or { label, unit, <case values...>, sdkCost, senderCost }.
 * @param {LongResults} r
 */
function longTable(r) {
  const cases = presentCases(r);
  const has = (/** @type {string} */ k) => cases.some(([x]) => x === k);
  const { cpuAvailable, memReliable } = capability(r);
  return ROWS.map(([label, unit, d, get, kind]) => {
    if (!get) return { group: label };
    const na = (kind === 'cpu' && !cpuAvailable) || (kind === 'mem' && !memReliable);
    /** @type {Record<string, number | null>} */
    const v = {};
    for (const [k] of cases) v[k] = get(r[k]);
    /** @type {Record<string, string>} */
    const cells = { label, unit };
    for (const [k] of cases) cells[k] = na ? 'n/a' : fmtV(v[k], d);
    cells.sdkCost = na ? 'n/a' : has('nosender') && has('without') ? delta(v.nosender, v.without, d) : 'n/a';
    cells.senderCost = na ? 'n/a' : has('sender') && has('nosender') ? delta(v.sender, v.nosender, d) : 'n/a';
    return cells;
  });
}

/** One row per playback. @param {LongResults} r @param {Record<string, LongVideo>} videos */
function playRows(r, videos) {
  const x = (/** @type {any} */ v, d = 1) => (typeof v === 'number' && isFinite(v) ? v.toFixed(d) : '-');
  const { cpuAvailable, memReliable } = capability(r);
  const cpuC = (/** @type {any} */ v) => (cpuAvailable ? x(v, 2) : 'n/a');
  const memC = (/** @type {any} */ v, d = 1) => (memReliable ? x(v, d) : 'n/a');
  /** @type {string[][]} */
  const rows = [];
  for (const [k, label] of presentCases(r)) {
    for (const p of r[k].plays) {
      rows.push([
        label,
        String(p.n),
        videos[p.video] ? videos[p.video].title.replace(/ \(.*\)$/, '') : p.video,
        `${Math.round(p.play.secs / 60)} min`,
        cpuC(p.play.cpu),
        memC(p.play.usedEndMB),
        memC(p.play.usedPeakMB),
        memC(p.play.slopeMBMin, 2),
        x(p.vstSecs, 2),
        p.after ? cpuC(p.after.cpu) : '-',
        p.after ? memC(p.after.usedEndMB) : '-',
      ]);
    }
  }
  return rows;
}

/** @param {any} meta @param {LongResults} r @param {Record<string, LongVideo>} videos */
function notesFor(meta, r, videos) {
  const mins = (/** @type {number} */ s) => (s >= 60 ? `${+(s / 60).toFixed(1)} min` : `${s} s`);
  /** @type {string[]} */
  const n = [
    `Run order: ${presentCases(r).map(([, l]) => l).join(' > ')}; one served build per case`,
    `Each case: warm-up playback ${meta.warmupSecs}s, home page ${mins(meta.idleSecs)}, then ${meta.plays} playbacks of ${mins(meta.playSecs)}, each followed by ${meta.afterSecs}s on the home page`,
    'One app session per case: after a single boot, phases move home <-> player through the app router (in-page, no reload), so the JS heap carries across playbacks like the Roku long run. Leak signals: the per-playback heap slope (MB/min) and the memory-by-playback progression below. If the __PERF_HOOKS__ build hook is absent the run falls back to full reloads between phases (noted per case) and only the within-playback slope is meaningful',
    'Costs: SDK cost = With Vizbee (no sender) - Without Vizbee; Sender cost = With Vizbee (sender) - With Vizbee (no sender) (differences of the values in the table)',
    'CPU average: Performance.getMetrics TaskDuration delta / wall per 5 s (main-thread proxy). Memory used = average of the last 60 s of each phase (JSHeapUsedSize); peak = max over the phase',
    'Heap slope: least-squares slope of JSHeapUsedSize over the whole phase, in MB/min - a steady positive playback slope is the leak signal',
    'Video start time (VST): deep-link navigate -> the [VZBPERF] video playing marker, wall clock',
  ];
  const cap = capability(r);
  if (cap.memReliable) {
    for (const [k, label] of presentCases(r)) {
      const c = r[k];
      if (c.plays.length < 2) continue;
      const list = (/** @type {Array<number | null>} */ xs) =>
        xs.map((v) => (typeof v === 'number' ? v.toFixed(1) : '-')).join(' -> ');
      n.push(
        `${label}, memory used by playback (MB): ${list(c.plays.map((p) => p.play.usedEndMB))}; home page after ${list(c.plays.map((p) => (p.after ? p.after.usedEndMB : null)))}`,
      );
    }
  }
  if (!cap.cpuAvailable || !cap.memReliable) {
    const missing = [
      !cap.cpuAvailable && 'CPU main-thread time (no CDP Performance domain)',
      !cap.memReliable && 'heap size and slope (performance.memory is quantized to a constant)',
    ]
      .filter(Boolean)
      .join(' and ');
    n.unshift(
      `Engine limits on this webview (Chromium 53 / webOS 4): ${missing} are not measurable here and are shown as n/a. VST is measured. For full CPU + memory fidelity, run the measurement on Vizio.`,
    );
  }
  return n;
}

/**
 * Write report.pdf, summary.md, results.json; return the markdown.
 * @param {string} outDir
 * @param {any} meta
 * @param {LongResults} r
 * @param {Record<string, LongVideo>} videos
 * @returns {string}
 */
export function writeLongReport(outDir, meta, r, videos) {
  const cases = presentCases(r);
  const table = longTable(r);
  const rows = playRows(r, videos);
  const notes = notesFor(meta, r, videos);
  const mins = (/** @type {number} */ s) => (s >= 60 ? `${+(s / 60).toFixed(1)} min` : `${s}s`);
  const title = 'Vizbee JS SDK - long playback (smart TV)';
  const dev = meta.device || {};
  const head = [
    `${meta.started}   |   ${dev.Model || meta.platform || '-'}${dev.Firmware ? `, firmware ${dev.Firmware}` : ''}   |   ${dev['SDK variant'] || meta.sdkVariant || '-'}`,
    `Video: ${videos[meta.video] ? videos[meta.video].title : meta.video}   |   home page ${mins(meta.idleSecs)}, ${meta.plays} x playback ${mins(meta.playSecs)}   |   phone: ${meta.phone || '-'}` +
      (meta.inProgress ? '   |   IN PROGRESS' : ''),
  ];

  /** @type {import('./pdf.js').Column[]} */
  const cols = [['Metric', 150], ['Unit', 46]];
  for (const [, label] of cases) cols.push([label, 96]);
  cols.push(['SDK cost', 70], ['Sender cost', 70]);
  const cells = (/** @type {any} */ x) => [
    x.label,
    x.unit,
    ...cases.map(([k]) => x[k]),
    x.sdkCost,
    x.senderCost,
  ];

  /** @type {import('./pdf.js').Column[]} */
  const pcols = [
    ['Case', 128], ['#', 18], ['Video', 92], ['Played', 44], ['CPU %', 42], ['Used MB', 48],
    ['Peak MB', 48], ['Slope MB/min', 62], ['VST s', 40], ['After CPU %', 58], ['After MB', 50],
  ];

  const doc = pdfDoc();
  doc.title(title);
  head.forEach((s) => doc.line(s));
  doc.gap(6);
  doc.table(cols, table.map((x) => ('group' in x ? { group: /** @type {string} */ (x.group) } : cells(x))));
  doc.gap(10);
  doc.heading('Each playback   (After = the home page right after that playback)');
  doc.table(pcols, rows);
  doc.gap(10);
  doc.heading('Notes');
  notes.forEach((s) => doc.para('- ' + s));
  const runNotes = cases.flatMap(([k, label]) => [
    ...(r[k].failed ? [`- ${label}: FAILED: ${r[k].failed}`] : []),
    ...r[k].notes.map((s) => `- ${label}: ${s}`),
    ...r[k].plays.flatMap((p) => p.notes.map((s) => `- ${label}, playback ${p.n}: ${s}`)),
  ]);
  if (runNotes.length) {
    doc.heading('Run notes');
    runNotes.forEach((s) => doc.para(s));
  }
  fs.writeFileSync(path.join(outDir, 'report.pdf'), doc.build());

  const mdRow = (/** @type {string[]} */ xs) => `| ${xs.join(' | ')} |\n`;
  const mdSep = (/** @type {number} */ n) => `|${'---|'.repeat(n)}\n`;
  let md = `# ${title}\n\n${head.map((s) => `- ${s}`).join('\n')}\n\n` + mdRow(cols.map((c) => c[0])) + mdSep(cols.length);
  for (const x of table) {
    md += 'group' in x ? `| **${x.group}** |${' |'.repeat(cols.length - 1)}\n` : mdRow(cells(x));
  }
  md += '\n## Each playback\n\n' + mdRow(pcols.map((c) => c[0])) + mdSep(pcols.length) + rows.map(mdRow).join('');
  md += `\n## Notes\n\n${notes.map((s) => `- ${s}`).join('\n')}\n`;
  if (runNotes.length) md += `\n## Run notes\n\n${runNotes.join('\n')}\n`;
  fs.writeFileSync(path.join(outDir, 'summary.md'), md);
  fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify({ meta, results: r }, null, 2));
  return md;
}
