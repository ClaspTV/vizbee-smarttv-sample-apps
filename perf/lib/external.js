// @ts-check
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { loadRuns, summarize, textTable } from './report.js';
import { buildReportPdf } from './pdf-report.js';
import { writeLongReport, longTable, presentCases, costDefs } from './long-report.js';
import { backfillLongP95 } from './long.js';
import { CASES, LONG_VIDEOS } from './cases.js';
import { CASE_SLUG } from './constants.js';

/*
 * <run dir>/external/: the files that can be shared with a customer.
 *
 *   comparison.csv           the report's main table (phase, metric, unit, each case, costs)
 *   report.pdf, summary.md   the report, without internal details: no local
 *                            paths, device IPs/serials or runner internals;
 *                            the SDK is shown by --sdk-label
 *   data/samples-<case>.csv  every 5s sample: phase, JS heap, DOM nodes
 *   data/results.json        every number in the report
 *   data/README.txt          what each file and column means
 *
 * Left out on purpose: raw samples.jsonl, device.json, run.log, builds,
 * findings / analysis / issues (internal review).
 */

/** Anything that must not leave the company, checked on every written text file. */
export const INTERNAL =
  /(\b(?:10|127|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b|\/Users\/|\/home\/[\w.-]+|\b(?:feature|fix|enhancement|integration)\/[\w.-]+|VZB_APP_ID|ngrok)/i;

/** Case key -> file name a customer reads, per run kind. @param {string} kind @param {string} key */
function caseFileName(kind, key) {
  if (kind === 'mux') return key === 'without' ? 'no-mux' : key === 'nosender' ? 'mux' : CASE_SLUG[key] || key;
  return (
    { without: 'no-sdk', nosender: 'vizbee-sdk-no-sender', sender: 'vizbee-sdk-sender', mux: 'mux-sdk' }[key] ||
    CASE_SLUG[key] ||
    key
  );
}

/** Which report a run folder holds. @param {string} dir @param {any} saved results.json */
function kindOf(dir, saved) {
  if (saved && saved.meta && saved.results) return 'long';
  if (saved && saved.kind) return saved.kind;
  // Old results.json have no kind: infer mux from device.json / the folder name.
  const devFile = path.join(dir, 'device.json');
  const tested = fs.existsSync(devFile) ? JSON.stringify(JSON.parse(fs.readFileSync(devFile, 'utf8'))) : '';
  if (/mux/i.test(tested) || /mux/i.test(path.basename(dir)) || /mux/i.test(path.basename(path.dirname(dir)))) return 'mux';
  return 'e2e';
}

/** Device with internal fields removed. @param {any} dev */
function scrubDevice(dev) {
  if (!dev || typeof dev !== 'object') return dev;
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [k, v] of Object.entries(dev)) {
    if (/\b(ip|serial|host|app ?id|address|udid|mac)\b/i.test(k)) continue;
    if (INTERNAL.test(String(v))) continue;
    out[k] = v;
  }
  return out;
}

/** The SDK as the customer sees it. @param {any} meta @param {any} device @param {string | undefined} label */
function sdkLabel(meta, device, label) {
  if (label) return label;
  return (meta && meta.sdkVariant) || (device && device['SDK variant']) || '-';
}

/** fixed-digit, or n/a. @param {number | null | undefined} v @param {number} d */
const fmt = (v, d) => (v === null || v === undefined || !isFinite(/** @type {number} */ (v)) ? 'n/a' : (+v).toFixed(d));

/** CSV field quoting. @param {string} s */
const q = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** home/play phase span in ms from the first case's samples. @param {Record<string, any[]>} byCase @param {'home'|'play'} phase */
function phaseSpanMs(byCase, phase) {
  const first = Object.values(byCase)[0];
  const s = first && first[0] && first[0][phase];
  return s && s.length >= 2 ? s[s.length - 1].t - s[0].t : 0;
}

/**
 * comparison.csv for an e2e / mux run, from the summarize() output.
 * @param {ReturnType<typeof summarize>} summary
 * @param {Record<string, { label: string }>} caseDefs
 * @param {Array<{ label: string, key: 'sdk' | 'sender' }>} costs
 * @param {string} dst
 */
function e2eComparisonCsv(summary, caseDefs, costs, dst) {
  const keys = Object.keys(summary.cases);
  const lines = [
    ['Phase', 'Metric', 'Unit', ...keys.map((k) => caseDefs[k]?.label ?? k), ...costs.map((c) => c.label)].map(q).join(','),
  ];
  /** @param {string} phase @param {string} metric @param {string} unit @param {string} field @param {string | null} costField @param {number} d */
  const push = (phase, metric, unit, field, costField, d) => {
    const cc = keys.map((k) => fmt(/** @type {any} */ (summary.cases[k])[field], d));
    const cost = costs.map((c) =>
      costField && /** @type {any} */ (summary.costs)[c.key] ? fmt(/** @type {any} */ (summary.costs)[c.key][costField], d) : '',
    );
    lines.push([phase, metric, unit, ...cc, ...cost].map((v) => q(String(v))).join(','));
  };
  push('Home page (idle)', 'CPU average', '%', 'homeCpu', 'homeCpu', 2);
  push('Home page (idle)', 'CPU p95', '%', 'homeCpuP95', null, 2);
  push('Home page (idle)', 'Memory used', 'MB', 'homeMem', 'homeMem', 1);
  push('Home page (idle)', 'Memory p95', 'MB', 'homeMemP95', null, 1);
  push('Home page (idle)', 'Memory peak', 'MB', 'homeMemPeak', null, 1);
  push('Video playback', 'CPU average', '%', 'playCpu', 'playCpu', 2);
  push('Video playback', 'CPU p95', '%', 'playCpuP95', null, 2);
  push('Video playback', 'Memory used', 'MB', 'playMem', 'playMem', 1);
  push('Video playback', 'Memory p95', 'MB', 'playMemP95', null, 1);
  push('Video playback', 'Memory peak', 'MB', 'playMemPeak', null, 1);
  push('Page load', 'FCP', 'ms', 'fcp', null, 0);
  push('Page load', 'LCP', 'ms', 'lcp', null, 0);
  push('Page load', 'TTFB', 'ms', 'ttfb', null, 0);
  fs.writeFileSync(dst, lines.join('\n') + '\n');
}

/** comparison.csv for a long run, from longTable(). @param {any} r @param {string} dst */
function longComparisonCsv(r, dst) {
  const cases = presentCases(r);
  const costs = costDefs(cases);
  const table = longTable(r);
  const lines = [
    ['Phase', 'Metric', 'Unit', ...cases.map(([, l]) => l), ...costs.map((c) => c.label)].map(q).join(','),
  ];
  let phase = '';
  for (const row of /** @type {any[]} */ (table)) {
    if ('group' in row) {
      phase = row.group;
      continue;
    }
    lines.push(
      [phase, row.label, row.unit, ...cases.map(([k]) => row[k]), ...row.costs].map((v) => q(String(v))).join(','),
    );
  }
  fs.writeFileSync(dst, lines.join('\n') + '\n');
}

/** samples.jsonl -> one CSV per case in data/. @param {string} dir @param {string} dataDir @param {string} kind */
function samplesCsvs(dir, dataDir, kind) {
  const file = path.join(dir, 'samples.jsonl');
  if (!fs.existsSync(file)) return;
  /** @type {Record<string, string[]>} */
  const byCase = {};
  const header = 'time_utc,run,video,phase,js_heap_used_mb,js_heap_total_mb,dom_nodes,listeners,task_duration_s';
  for (const ln of fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
    /** @type {any} */ let r;
    try {
      r = JSON.parse(ln);
    } catch {
      continue;
    }
    if (r.phase === 'vitals' || typeof r.jsHeapUsed !== 'number') continue;
    const key = r.case ?? 'case';
    (byCase[key] ??= [header]).push(
      [
        new Date(r.t).toISOString(),
        r.run ?? r.n ?? '',
        r.video ?? '',
        r.phase ?? '',
        (r.jsHeapUsed / 1e6).toFixed(3),
        ((r.jsHeapTotal || 0) / 1e6).toFixed(3),
        r.nodes ?? '',
        r.listeners ?? '',
        typeof r.taskDuration === 'number' ? r.taskDuration.toFixed(3) : '',
      ].join(','),
    );
  }
  for (const [key, rows] of Object.entries(byCase)) {
    fs.writeFileSync(path.join(dataDir, `samples-${caseFileName(kind, key)}.csv`), rows.join('\n') + '\n');
  }
}

/** @param {string} kind */
function readme(kind) {
  const phases = {
    e2e: 'home = home page (idle); play = video playback (fresh app launch per run)',
    mux: 'home = home page (idle); play = video playback (fresh app launch per run)',
    long: 'home / play = home page / playback; the home page after each playback is also captured (one app session per case)',
  }[kind];
  return [
    'Raw data behind report.pdf.',
    '',
    `samples-<case>.csv   One row per 5s sample, read over the Chrome DevTools Protocol from the TV browser.`,
    `                     phase: ${phases}`,
    '                     js_heap_used_mb = JSHeapUsedSize (retained heap); dom_nodes = live DOM node count',
    '                     task_duration_s = cumulative main-thread task seconds (CPU % = its delta / wall between samples)',
    'comparison.csv       The report table (phase, metric, unit, each case, cost columns)',
    'results.json         Every number in report.pdf',
    '',
    'Cases: no-sdk = the sample app without any SDK; vizbee-sdk-no-sender = with the Vizbee JS SDK, no phone connected;',
    '       vizbee-sdk-sender = with the Vizbee JS SDK and a phone connected; mux-sdk / mux = with Mux Data only;',
    '       no-mux = the app without Mux. CPU is main-thread; memory is the retained JS heap.',
    '',
  ].join('\n');
}

/** Throw if any written text file still carries internal details. @param {string[]} dirs @param {string} ext */
function leakCheck(dirs, ext) {
  const leaks = dirs.flatMap((d) =>
    fs
      .readdirSync(d)
      .filter((f) => /\.(md|json|csv|txt)$/.test(f))
      .filter((f) => INTERNAL.test(fs.readFileSync(path.join(d, f), 'utf8')))
      .map((f) => path.relative(ext, path.join(d, f))),
  );
  if (leaks.length) throw new Error(`external/ still has internal details in: ${leaks.join(', ')}`);
}

/**
 * Write <dir>/external/ for a finished run folder. Returns the external path.
 * @param {string} dir run folder (holds results.json + samples.jsonl)
 * @param {{ sdkLabel?: string, platform?: string }} [o]
 * @returns {string}
 */
export function writeExternal(dir, o = {}) {
  const resultsFile = path.join(dir, 'results.json');
  if (!fs.existsSync(resultsFile)) throw new Error(`no results.json in ${dir}`);
  const saved = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
  const kind = kindOf(dir, saved);
  const ext = path.join(dir, 'external');
  const data = path.join(ext, 'data');
  fs.rmSync(ext, { recursive: true, force: true });
  fs.mkdirSync(data, { recursive: true });

  const devFile = path.join(dir, 'device.json');
  const device = fs.existsSync(devFile) ? JSON.parse(fs.readFileSync(devFile, 'utf8')) : saved.device ?? null;
  const cleanDevice = scrubDevice(device);
  const platform = o.platform || saved.platform || (device && device.Platform) || 'TV';

  if (kind === 'long') {
    const meta = {
      ...saved.meta,
      external: true,
      device: cleanDevice,
      sdkVariant: sdkLabel(saved.meta, device, o.sdkLabel),
    };
    backfillLongP95(dir, saved.results);
    writeLongReport(ext, meta, saved.results, LONG_VIDEOS);
    longComparisonCsv(saved.results, path.join(ext, 'comparison.csv'));
    fs.renameSync(path.join(ext, 'results.json'), path.join(data, 'results.json'));
  } else {
    const jsonl = path.join(dir, 'samples.jsonl');
    if (!fs.existsSync(jsonl)) throw new Error(`no samples.jsonl in ${dir}`);
    const byCase = loadRuns(jsonl);
    const summary = summarize(byCase);
    const caseDefs = kind === 'mux' ? { without: { label: 'Without Mux' }, nosender: { label: 'With Mux' } } : CASES;
    /** @type {Array<{ label: string, key: 'sdk' | 'sender' }>} */
    const costs = [];
    if (summary.costs.sdk) costs.push({ label: kind === 'mux' ? 'Mux cost' : 'SDK cost', key: 'sdk' });
    if (summary.costs.sender) costs.push({ label: 'Sender cost', key: 'sender' });
    const label = sdkLabel(saved, device, o.sdkLabel);
    const meta = {
      platform,
      date: saved.date || new Date().toISOString().slice(0, 10),
      device: cleanDevice,
      homeMs: phaseSpanMs(byCase, 'home'),
      playMs: phaseSpanMs(byCase, 'play'),
      sdkVariant: label,
      phone: byCase.sender ? 'Android (adb)' : null,
      intro:
        kind === 'mux'
          ? [
              'What this measures: the CPU and memory Mux Data (mux-embed) monitoring adds to the TV app.',
              'Cases: without Mux (baseline) | with Mux. No Vizbee SDK in either.',
              'Phases: home page idle, then video playback started by a deep link.',
            ]
          : undefined,
      sdkCostLabel: kind === 'mux' ? 'Mux cost  (with Mux - without Mux, paired per video)' : undefined,
      tools: {
        script: kind === 'mux' ? 'perf-mux.js' : 'perf-e2e.js',
        vizbee: kind !== 'mux',
        mux: kind === 'mux',
        phone: Boolean(byCase.sender),
        vitals: true,
        video: false,
        external: true,
      },
    };
    fs.writeFileSync(path.join(ext, 'report.pdf'), buildReportPdf({ summary, byCase, caseDefs, meta }));
    fs.writeFileSync(path.join(ext, 'summary.md'), `# ${kind === 'mux' ? 'Mux' : 'Vizbee SDK'} perf (${platform})\n\n\`\`\`\n${textTable(summary, caseDefs)}\n\`\`\`\n`);
    e2eComparisonCsv(summary, caseDefs, costs, path.join(ext, 'comparison.csv'));
    fs.writeFileSync(path.join(data, 'results.json'), JSON.stringify({ cases: summary.cases, costs: summary.costs, vitalsProxy: summary.vitalsProxy }, null, 2));
  }

  samplesCsvs(dir, data, kind);
  fs.writeFileSync(path.join(data, 'README.txt'), readme(kind));
  leakCheck([ext, data], ext);
  return ext;
}

/**
 * Called by every runner after its final report (and by --report): writes
 * external/ and says where; never fails the run. The SDK label comes from
 * --sdk-label on the runner's command line, if given.
 * @param {string} dir
 * @param {{ platform?: string }} [o]
 */
export function writeExternalAfterRun(dir, o = {}) {
  const i = process.argv.findIndex((a) => a === '--sdk-label' || a.startsWith('--sdk-label='));
  const label = i < 0 ? undefined : process.argv[i].includes('=') ? process.argv[i].split('=').slice(1).join('=') : process.argv[i + 1];
  try {
    console.log(`external (shareable): ${writeExternal(dir, { sdkLabel: label, platform: o.platform })}`);
  } catch (e) {
    console.log(`external/ not written: ${/** @type {Error} */ (e).message}`);
  }
}
