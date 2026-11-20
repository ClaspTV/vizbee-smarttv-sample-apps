// @ts-check
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { loadRuns, summarize, textTable } from './lib/report.js';
import { buildReportPdf } from './lib/pdf-report.js';
import { CASES } from './lib/cases.js';

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
  const meta = {
    platform,
    date: runDate,
    device,
    homeMs: phaseSpanMs(firstCase, 'home'),
    playMs: phaseSpanMs(firstCase, 'play'),
  };

  const pdf = buildReportPdf({ summary, byCase, caseDefs: CASES, meta });
  fs.writeFileSync(path.join(dir, 'report.pdf'), pdf);
  fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify(summary, null, 2));
  const table = textTable(summary, CASES);
  fs.writeFileSync(path.join(dir, 'summary.md'), `# Vizbee SDK perf (${platform})\n\n\`\`\`\n${table}\n\`\`\`\n`);

  console.log(table);
  console.log(`\nreport.pdf + results.json + summary.md written to ${dir}`);
}

main();
