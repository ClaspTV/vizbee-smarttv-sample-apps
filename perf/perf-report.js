// @ts-check
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { loadRuns, summarize, textTable } from './lib/report.js';
import { buildReportPdf } from './lib/pdf-report.js';
import { CASES } from './lib/cases.js';
import { writeExternalAfterRun } from './lib/external.js';

const MUX_CASES = { without: { label: 'Without Mux' }, nosender: { label: 'With Mux' } };

/**
 * Rebuild report.pdf / results.json / summary.md from a saved results dir, so
 * reports can be regenerated when the method changes without re-running.
 * Usage: node perf-report.js <results-dir> [--platform Vizio]
 */

/** @param {string} flag @returns {string | undefined} */
function argVal(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** @param {import('./lib/runner.js').RunResult[] | undefined} runs @param {'home'|'play'} phase */
function phaseSpanMs(runs, phase) {
  const s = runs?.[0]?.[phase];
  if (!s || s.length < 2) return 0;
  return s[s.length - 1].t - s[0].t;
}

function main() {
  const dir = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (!dir) {
    console.error('usage: node perf-report.js <results-dir> [--platform Vizio]');
    process.exit(1);
  }
  const jsonl = path.join(dir, 'samples.jsonl');
  if (!fs.existsSync(jsonl)) {
    console.error(`no samples.jsonl in ${dir}`);
    process.exit(1);
  }
  const platform = argVal('--platform') ?? 'Vizio';

  const byCase = loadRuns(jsonl);
  const summary = summarize(byCase);
  const firstCase = Object.values(byCase)[0];
  const deviceFile = path.join(dir, 'device.json');
  const device = fs.existsSync(deviceFile) ? JSON.parse(fs.readFileSync(deviceFile, 'utf8')) : null;
  // Old results.json have no kind; infer a Mux run from the folder name or device note.
  const existing = fs.existsSync(path.join(dir, 'results.json'))
    ? JSON.parse(fs.readFileSync(path.join(dir, 'results.json'), 'utf8'))
    : {};
  const isMux =
    existing.kind === 'mux' ||
    /mux/i.test(path.basename(dir)) ||
    /mux/i.test(path.basename(path.dirname(dir))) ||
    (device && /mux/i.test(JSON.stringify(device)));
  const caseDefs = isMux ? MUX_CASES : CASES;
  const hasSender = Boolean(byCase.sender);
  const ts = fs
    .readFileSync(jsonl, 'utf8')
    .trim()
    .split('\n')
    .map((l) => {
      try {
        return JSON.parse(l).t;
      } catch {
        return null;
      }
    })
    .filter((t) => typeof t === 'number');
  const runDate = ts.length
    ? new Date(Math.min(...ts)).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const sdkVariant = (device && device['SDK variant']) || existing.sdkVariant || undefined;
  const meta = {
    platform,
    date: runDate,
    device,
    homeMs: phaseSpanMs(firstCase, 'home'),
    playMs: phaseSpanMs(firstCase, 'play'),
    sdkVariant,
    phone: hasSender ? 'Android (adb)' : null,
    intro: isMux
      ? [
          'What this measures: the CPU and memory Mux Data (mux-embed) monitoring adds to the TV app.',
          'Cases: without Mux (baseline) | with Mux. No Vizbee SDK in either.',
          'Phases: home page idle, then video playback started by a deep link.',
        ]
      : undefined,
    sdkCostLabel: isMux ? 'Mux cost  (with Mux - without Mux, paired per video)' : undefined,
    tools: { script: isMux ? 'perf-mux.js' : 'perf-e2e.js', vizbee: !isMux, mux: isMux, vitals: true, video: false, phone: hasSender },
  };

  const pdf = buildReportPdf({ summary, byCase, caseDefs, meta });
  fs.writeFileSync(path.join(dir, 'report.pdf'), pdf);
  fs.writeFileSync(
    path.join(dir, 'results.json'),
    JSON.stringify(
      { kind: isMux ? 'mux' : 'e2e', platform, date: runDate, sdkVariant, device, cases: summary.cases, costs: summary.costs, vitalsProxy: summary.vitalsProxy },
      null,
      2,
    ),
  );
  const table = textTable(summary, caseDefs);
  fs.writeFileSync(path.join(dir, 'summary.md'), `# ${isMux ? 'Mux' : 'Vizbee SDK'} perf (${platform})\n\n\`\`\`\n${table}\n\`\`\`\n`);
  writeExternalAfterRun(dir, { platform });

  console.log(table);
  console.log(`\nreport.pdf + results.json + summary.md + external/ written to ${dir}`);
}

main();
