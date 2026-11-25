// @ts-check
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { pdfDoc } from './pdf.js';
import { median, p95, P95_NOTE } from './report.js';
import { TOOL_COLS, toolRows } from './tools.js';

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
  ['mux', 'Only Mux'],
  ['without', 'Without Vizbee'],
]);

/** @param {(number | null | undefined)[]} xs @returns {number | null} */
function med(xs) {
  const v = /** @type {number[]} */ (xs.filter((x) => typeof x === 'number' && isFinite(x)));
  return v.length ? median(v) : null;
}

/** Dropped-frame % over a case's playbacks: total dropped / total frames.
 * @param {PlayResult[]} plays @returns {number | null} */
function droppedPctFor(plays) {
  const ok = plays.filter((p) => typeof p.totalFrames === 'number' && p.totalFrames > 0);
  if (!ok.length) return null;
  return (
    (100 * ok.reduce((a, p) => a + (p.droppedFrames || 0), 0)) /
    ok.reduce((a, p) => a + /** @type {number} */ (p.totalFrames), 0)
  );
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
  ['CPU p95', '%', 2, (c) => (c.home ? c.home.cpuP95 ?? null : null), 'cpu'],
  ['Memory used (average)', 'MB', 1, (c) => (c.home ? c.home.usedEndMB : null), 'mem'],
  ['Memory p95', 'MB', 1, (c) => (c.home ? c.home.usedP95MB ?? null : null), 'mem'],
  ['Memory allocated', 'MB', 2, (c) => (c.home ? c.home.allocMB : null), 'alloc'],
  ['Heap slope', 'MB/min', 2, (c) => (c.home ? c.home.slopeMBMin : null), 'mem'],
  ['DOM nodes', '', 0, (c) => (c.home ? c.home.nodes : null), 'nodes'],
  ['Playback (median of the playbacks)', '', 0, null, ''],
  ['CPU average', '%', 2, (c) => med(c.plays.map((p) => p.play.cpu)), 'cpu'],
  ['CPU p95', '%', 2, (c) => med(c.plays.map((p) => p.play.cpuP95)), 'cpu'],
  ['Memory used (average)', 'MB', 1, (c) => med(c.plays.map((p) => p.play.usedEndMB)), 'mem'],
  ['Memory p95', 'MB', 1, (c) => med(c.plays.map((p) => p.play.usedP95MB)), 'mem'],
  ['Memory peak', 'MB', 1, (c) => med(c.plays.map((p) => p.play.usedPeakMB)), 'mem'],
  ['Memory allocated', 'MB', 2, (c) => med(c.plays.map((p) => p.play.allocMB)), 'alloc'],
  ['Heap slope (leak signal)', 'MB/min', 2, (c) => med(c.plays.map((p) => p.play.slopeMBMin)), 'mem'],
  ['DOM nodes', '', 0, (c) => med(c.plays.map((p) => p.play.nodes)), 'nodes'],
  ['Video start time (VST) median', 's', 2, (c) => med(c.plays.map((p) => p.vstSecs)), 'vst'],
  ['Video start time (VST) p95', 's', 2, (c) => p95(c.plays.map((p) => p.vstSecs)), 'vst'],
  ['Dropped frames', '%', 2, (c) => droppedPctFor(c.plays), 'frames'],
  ['Home page after each playback (median, all idle metrics)', '', 0, null, ''],
  ['CPU average', '%', 2, (c) => med(c.plays.map((p) => (p.after ? p.after.cpu : null))), 'cpu'],
  ['CPU p95', '%', 2, (c) => med(c.plays.map((p) => (p.after ? p.after.cpuP95 : null))), 'cpu'],
  ['Memory used (average)', 'MB', 1, (c) => med(c.plays.map((p) => (p.after ? p.after.usedEndMB : null))), 'mem'],
  ['Memory p95', 'MB', 1, (c) => med(c.plays.map((p) => (p.after ? p.after.usedP95MB : null))), 'mem'],
  ['Memory peak', 'MB', 1, (c) => med(c.plays.map((p) => (p.after ? p.after.usedPeakMB : null))), 'mem'],
  ['Memory allocated', 'MB', 2, (c) => med(c.plays.map((p) => (p.after ? p.after.allocMB : null))), 'alloc'],
  ['Heap slope', 'MB/min', 2, (c) => med(c.plays.map((p) => (p.after ? p.after.slopeMBMin : null))), 'mem'],
  ['DOM nodes', '', 0, (c) => med(c.plays.map((p) => (p.after ? p.after.nodes : null))), 'nodes'],
]);

/**
 * Which metrics the capturing engine could actually provide. On Chromium 53 /
 * webOS 4 there is no CDP Performance domain (CPU TaskDuration is 0) and
 * performance.memory is quantized to a constant, so CPU and heap are degenerate
 * and must be shown as n/a rather than as measured 0.00 / flat values.
 * @param {LongResults} r
 */
export function capability(r) {
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
  const allocAvailable = ps.some((p) => p && typeof p.allocMB === 'number' && p.allocMB > 0);
  let framesAvailable = false;
  for (const k of Object.keys(r)) {
    const c = r[k];
    if (!c) continue;
    for (const p of c.plays) if (typeof p.totalFrames === 'number' && p.totalFrames > 0) framesAvailable = true;
  }
  return { cpuAvailable, memReliable, allocAvailable, framesAvailable };
}

/** Cases present, in preferred order. @param {LongResults} r */
export function presentCases(r) {
  return LONG_CASES.filter(([k]) => r[k] && (r[k].home || r[k].plays.length));
}

/**
 * Cost columns for the present cases. With a baseline (Without) and an Only Mux
 * case, show each add-on's cost against the baseline (Vizbee cost, Mux cost);
 * otherwise the usual SDK cost and sender cost.
 * @param {Array<[string, string]>} cases
 * @returns {Array<{ label: string, a: string, b: string }>}
 */
export function costDefs(cases) {
  const has = (/** @type {string} */ k) => cases.some(([x]) => x === k);
  /** @type {Array<{ label: string, a: string, b: string }>} */
  const defs = [];
  if (has('mux') && has('without')) {
    const vz = has('sender') ? 'sender' : has('nosender') ? 'nosender' : null;
    if (vz) defs.push({ label: 'Vizbee cost', a: vz, b: 'without' });
    defs.push({ label: 'Mux cost', a: 'mux', b: 'without' });
    return defs;
  }
  if (has('nosender') && has('without')) defs.push({ label: 'SDK cost', a: 'nosender', b: 'without' });
  if (has('sender') && has('nosender')) defs.push({ label: 'Sender cost', a: 'sender', b: 'nosender' });
  return defs;
}

/** Idle metrics shown for the sender-disconnect return-to-normal check. */
const DISC_METRICS = /** @type {Array<[string, string, number, (p: PhaseResult) => number | null, string]>} */ ([
  ['CPU average', '%', 2, (p) => p.cpu, 'cpu'],
  ['Memory used', 'MB', 1, (p) => p.usedEndMB, 'mem'],
  ['Memory peak', 'MB', 1, (p) => p.usedPeakMB, 'mem'],
  ['Memory allocated', 'MB', 2, (p) => p.allocMB, 'alloc'],
  ['Heap slope', 'MB/min', 2, (p) => p.slopeMBMin, 'mem'],
  ['DOM nodes', '', 0, (p) => p.nodes, 'nodes'],
]);

/**
 * The sender case's disconnect check, if it ran: home with the sender connected,
 * home after disconnect, and the no-sender reference (nosender case if present,
 * else the Without baseline) to judge "back to normal".
 * @param {LongResults} r
 */
export function disconnectView(r) {
  const c = r.sender;
  if (!c || !c.disconnected || !c.home) return null;
  const refKey = r.nosender && r.nosender.home ? 'nosender' : r.without && r.without.home ? 'without' : null;
  const refLabel = refKey ? LONG_CASES.find(([k]) => k === refKey)?.[1] ?? refKey : null;
  return {
    withSender: c.home,
    disc: c.disconnected,
    ref: refKey ? r[refKey].home : null,
    refKey,
    refLabel,
    confirmed: c.disconnectConfirmed !== false,
  };
}

/** Table rows for the disconnect check. @param {LongResults} r */
function disconnectRows(r) {
  const v = disconnectView(r);
  if (!v) return null;
  const { cpuAvailable, memReliable, allocAvailable } = capability(r);
  const bad = (/** @type {string} */ kind) =>
    (kind === 'cpu' && !cpuAvailable) || (kind === 'mem' && !memReliable) || (kind === 'alloc' && !allocAvailable);
  const cell = (/** @type {number | null} */ val, /** @type {number} */ d, /** @type {boolean} */ b) =>
    b || val === null || val === undefined ? 'n/a' : (+val).toFixed(d);
  /** @type {string[][]} */
  const rows = [];
  for (const [label, unit, d, get, kind] of DISC_METRICS) {
    const b = bad(kind);
    const w = get(v.withSender);
    const di = get(v.disc);
    const rf = v.ref ? get(v.ref) : null;
    rows.push([
      label,
      unit,
      cell(w, d, b),
      cell(di, d, b),
      b || w === null || di === null ? 'n/a' : delta(di, w, d),
      v.ref ? cell(rf, d, b) : '-',
      v.ref && !b && di !== null && rf !== null ? delta(di, rf, d) : 'n/a',
    ]);
  }
  return { rows, refLabel: v.refLabel, confirmed: v.confirmed };
}

/** One-line verdict: did CPU / memory return to the no-sender level after disconnect?
 * @param {LongResults} r @returns {string | null} */
export function disconnectVerdict(r) {
  const v = disconnectView(r);
  if (!v) return null;
  if (!v.confirmed) return 'Sender disconnect NOT confirmed (phone still shows connected); the return-to-normal read may be invalid';
  const { cpuAvailable, memReliable } = capability(r);
  if (!cpuAvailable && !memReliable) return 'After sender disconnect: CPU/memory not measurable on this engine';
  /** @type {string[]} */
  const released = [];
  if (cpuAvailable) {
    const d = v.disc.cpu - v.withSender.cpu;
    released.push(`CPU ${d >= 0 ? '+' : ''}${d.toFixed(2)}%`);
  }
  if (memReliable) {
    const d = v.disc.usedEndMB - v.withSender.usedEndMB;
    released.push(`Memory ${d >= 0 ? '+' : ''}${d.toFixed(1)} MB`);
  }
  let s = `On disconnect (vs with-sender): ${released.join('; ')}`;
  if (v.ref) {
    /** @type {string[]} */
    const resid = [];
    if (cpuAvailable) {
      const d = v.disc.cpu - v.ref.cpu;
      resid.push(`CPU ${d >= 0 ? '+' : ''}${d.toFixed(2)}% (${Math.abs(d) <= 1 ? 'back to normal' : 'still above'})`);
    }
    if (memReliable) {
      const d = v.disc.usedEndMB - v.ref.usedEndMB;
      resid.push(`Memory ${d >= 0 ? '+' : ''}${d.toFixed(1)} MB (${Math.abs(d) <= 5 ? 'back to normal' : 'still above'})`);
    }
    const caveat =
      v.refKey === 'without'
        ? ' [Without Vizbee has no SDK at all, so some residual is the SDK idle cost, not a sender leak; add the no-sender case for a clean check]'
        : '';
    s += `. Residual vs ${v.refLabel}: ${resid.join('; ')}${caveat}`;
  } else {
    s += '. No no-sender reference in this run to judge "back to normal" (add the nosender case)';
  }
  return s;
}

/**
 * Main table rows: a group heading, or { label, unit, <case values...>, sdkCost, senderCost }.
 * @param {LongResults} r
 */
export function longTable(r) {
  const cases = presentCases(r);
  const costs = costDefs(cases);
  const { cpuAvailable, memReliable, allocAvailable, framesAvailable } = capability(r);
  return ROWS.map(([label, unit, d, get, kind]) => {
    if (!get) return { group: label };
    const na =
      (kind === 'cpu' && !cpuAvailable) ||
      (kind === 'mem' && !memReliable) ||
      (kind === 'alloc' && !allocAvailable) ||
      (kind === 'frames' && !framesAvailable);
    /** @type {Record<string, number | null>} */
    const v = {};
    for (const [k] of cases) v[k] = get(r[k]);
    /** @type {any} */
    const cells = { label, unit };
    for (const [k] of cases) cells[k] = na ? 'n/a' : fmtV(v[k], d);
    cells.costs = costs.map((c) => (na ? 'n/a' : delta(v[c.a], v[c.b], d)));
    return cells;
  });
}

/** One row per playback. @param {LongResults} r @param {Record<string, LongVideo>} videos */
function playRows(r, videos) {
  const x = (/** @type {any} */ v, d = 1) => (typeof v === 'number' && isFinite(v) ? v.toFixed(d) : '-');
  const { cpuAvailable, memReliable, framesAvailable } = capability(r);
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
        !framesAvailable ? 'n/a' : p.totalFrames ? `${x(p.droppedPct, 2)} (${p.droppedFrames}/${p.totalFrames})` : '-',
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
  const present = presentCases(r);
  const labelOf = (/** @type {string} */ k) => present.find(([x]) => x === k)?.[1] ?? k;
  const costs = costDefs(present);
  const costNote = costs.length
    ? `Costs: ${costs.map((c) => `${c.label} = ${labelOf(c.a)} - ${labelOf(c.b)}`).join('; ')} (differences of the values in the table)`
    : 'Costs: none shown (a baseline case is needed to compare against)';
  /** @type {string[]} */
  const n = [
    `Run order: ${(meta.parts ?? []).map((/** @type {string} */ k) => r[k]?.label ?? k).join(' > ') || present.map(([, l]) => l).join(' > ')}; one served build per case`,
    `Each case: warm-up playback ${meta.warmupSecs}s, home page ${mins(meta.idleSecs)}, then ${meta.plays} playbacks of ${mins(meta.playSecs)}, each followed by ${meta.afterSecs}s on the home page`,
    'One app session per case: after a single boot, phases move home <-> player through the app router (in-page, no reload), so the JS heap carries across playbacks like the Roku long run. Leak signals: the per-playback heap slope (MB/min) and the memory-by-playback progression below. If the __PERF_HOOKS__ build hook is absent the run falls back to full reloads between phases (noted per case) and only the within-playback slope is meaningful',
    costNote,
    'CPU average: main-thread busy fraction - Performance.getMetrics TaskDuration where available, else the Profiler domain (idle-excluded sampling, used on webOS 4). Memory used = average of the last 60 s of each phase (JSHeapUsedSize); peak = max over the phase',
    P95_NOTE,
    `VST p95: over the ${meta.plays} playbacks of a case; with this few playbacks it is close to the slowest one`,
    'Heap slope: least-squares slope of JSHeapUsedSize over the whole phase, in MB/min - a steady positive playback slope is the leak signal (retained heap; n/a where unavailable)',
    'Memory allocated: total bytes allocated during the phase via the HeapProfiler sampling profiler - an allocation / churn signal, not retained heap; on webOS 4 it is the only available memory metric',
    'Video start time (VST): deep-link navigate -> video playing (polled over CDP), wall clock',
    'Dropped frames: HTMLVideoElement.getVideoPlaybackQuality() at the end of each playback; the case value = all its playbacks together (total dropped / total frames)',
  ];
  if (present.some(([k]) => k === 'mux')) {
    n.push(
      'Only Mux: mux-embed (Mux Data) monitoring the player, no Vizbee SDK - the Mux cost column is its overhead against the Without Vizbee & Mux baseline',
    );
  }
  n.push(
    'Home page after each playback: a full idle capture (all metrics - CPU, memory used/peak/allocated, heap slope, DOM nodes), so each video session is checked on return to the home page',
  );
  if (r.sender && r.sender.disconnected) {
    const ref = r.nosender && r.nosender.home ? 'With Vizbee (no sender)' : 'Without Vizbee';
    n.push(
      `Sender disconnect (sender case): after the LAST playback the phone is disconnected and confirmed not connected (phone cast state), a GC is forced, then the home page is measured for ${meta.discIdleSecs ?? '?'}s - the "return to normal" check. "Released" = after-disconnect - with-sender; "Residual vs ref" = after-disconnect - ${ref} home (near 0 = CPU/memory came back to the no-sender level)`,
    );
  }
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
      `Engine limits on this webview (Chromium 53 / webOS 4): ${missing} are not measurable here and are shown as n/a. Measured instead: CPU (Profiler domain), Memory allocated (HeapProfiler sampling) and VST. For retained-heap size and leak slope, run the measurement on Vizio.`,
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
  const tools = toolRows(meta, {
    script: 'perf-long.js',
    vizbee: cases.some(([k]) => k === 'nosender' || k === 'sender'),
    mux: cases.some(([k]) => k === 'mux'),
    phone: !!(r.sender && r.sender.plays.length),
    video: true,
    vitals: false,
    external: !!meta.external,
  });
  const mins = (/** @type {number} */ s) => (s >= 60 ? `${+(s / 60).toFixed(1)} min` : `${s}s`);
  const title = 'Vizbee JS SDK - long playback (smart TV)';
  const dev = meta.device || {};
  const head = [
    `${meta.started}   |   ${dev.Model || meta.platform || '-'}${dev.Firmware ? `, firmware ${dev.Firmware}` : ''}   |   ${dev['SDK variant'] || meta.sdkVariant || '-'}`,
    `Video: ${videos[meta.video] ? videos[meta.video].title : meta.video}   |   home page ${mins(meta.idleSecs)}, ${meta.plays} x playback ${mins(meta.playSecs)}   |   phone: ${meta.phone || '-'}` +
      (meta.inProgress ? '   |   IN PROGRESS' : ''),
  ];

  const costs = costDefs(cases);
  /** @type {import('./pdf.js').Column[]} */
  const cols = [['Metric', 150], ['Unit', 46]];
  for (const [, label] of cases) cols.push([label, 96]);
  for (const c of costs) cols.push([c.label, 78]);
  const cells = (/** @type {any} */ x) => [
    x.label,
    x.unit,
    ...cases.map(([k]) => x[k]),
    ...x.costs,
  ];

  /** @type {import('./pdf.js').Column[]} */
  const pcols = [
    ['Case', 120], ['#', 18], ['Video', 84], ['Played', 44], ['CPU %', 42], ['Used MB', 48],
    ['Peak MB', 48], ['Slope MB/min', 62], ['VST s', 40], ['Dropped % (n/total)', 96],
    ['After CPU %', 58], ['After MB', 50],
  ];

  const disc = disconnectRows(r);
  const discVerdict = disconnectVerdict(r);
  /** @type {import('./pdf.js').Column[]} */
  const dcols = disc
    ? [['Metric', 120], ['Unit', 44], ['With sender', 72], ['After disconnect', 88], ['Released', 60], [disc.refLabel || 'No-sender ref', 104], ['Residual vs ref', 86]]
    : [];

  const doc = pdfDoc();
  doc.title(title);
  head.forEach((s) => doc.line(s));
  doc.gap(6);
  doc.table(cols, table.map((x) => ('group' in x ? { group: /** @type {string} */ (x.group) } : cells(x))));
  doc.gap(10);
  doc.heading('Each playback   (After = the home page right after that playback)');
  doc.table(pcols, rows);
  if (disc) {
    doc.gap(10);
    doc.heading(`Sender disconnect - return to normal   (home idle after the phone disconnected${disc.confirmed ? '' : '; NOT confirmed'})`);
    doc.table(dcols, disc.rows);
    if (discVerdict) doc.para('- ' + discVerdict, 160);
  }
  doc.gap(10);
  doc.heading('Measurement tools');
  doc.table(TOOL_COLS, tools);
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
  if (disc) {
    const dhead = dcols.map((c) => c[0]);
    md += `\n## Sender disconnect - return to normal${disc.confirmed ? '' : ' (NOT confirmed)'}\n\n`;
    md += mdRow(dhead) + mdSep(dhead.length) + disc.rows.map(mdRow).join('');
    if (discVerdict) md += `\n- ${discVerdict}\n`;
  }
  md += '\n## Measurement tools\n\n' + mdRow(TOOL_COLS.map((c) => c[0])) + mdSep(TOOL_COLS.length) + tools.map(mdRow).join('');
  md += `\n## Notes\n\n${notes.map((s) => `- ${s}`).join('\n')}\n`;
  if (runNotes.length) md += `\n## Run notes\n\n${runNotes.join('\n')}\n`;
  fs.writeFileSync(path.join(outDir, 'summary.md'), md);
  fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify({ meta, results: r }, null, 2));
  return md;
}
