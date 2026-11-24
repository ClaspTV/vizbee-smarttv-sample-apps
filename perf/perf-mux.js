// @ts-check
'use strict';

/**
 * Mux perf run: without Mux (baseline) vs with Mux (mux-embed monitoring the
 * player). NO Vizbee SDK in either case, so the only difference is Mux Data.
 * Mux cost = with-Mux - without-Mux (paired per video). Same CPU/memory/vitals
 * capture + report as the Vizbee harness.
 *
 * Env: VIZIO_IP, PERF_RUNS (3), PERF_HOME_MS / PERF_PLAY_MS (180000),
 *      MUX_ENV_KEY (your Mux Data env key), PERF_OUT_DIR, PERF_PORT.
 * Flags: --platform vizio|webos|tizen (default vizio), --check.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeDevice } from './lib/device/index.js';
import { buildVariant, serve } from './lib/build.js';
import { preflight } from './lib/preflight.js';
import { getPlatform } from './lib/platforms.js';
import { runCase } from './lib/runner.js';
import { summarize, textTable } from './lib/report.js';
import { buildReportPdf } from './lib/pdf-report.js';
import { captureDeviceInfo } from './lib/deviceinfo.js';

const IP = process.env.VIZIO_IP ?? '10.0.0.141';
const RUNS = Number(process.env.PERF_RUNS ?? 3);
const HOME_MS = Number(process.env.PERF_HOME_MS ?? 180000);
const PLAY_MS = Number(process.env.PERF_PLAY_MS ?? 180000);
const PORT = Number(process.env.PERF_PORT ?? 4190);
const MUX_ENV_KEY = process.env.MUX_ENV_KEY ?? '';

/** @param {string} flag */
function argVal(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (/** @type {string} */ f) => process.argv.includes(f);

// Reuse the without/nosender keys so summarize() reports costs.sdk = Mux cost.
const MUX_CASES = {
  without: { key: 'without', label: 'Without Mux' },
  nosender: { key: 'nosender', label: 'With Mux' },
};

async function main() {
  const platform = getPlatform(argVal('--platform') ?? 'vizio');
  if (!platform.validated) {
    console.warn(`! ${platform.label} device adapter is UNVALIDATED — mechanics only.`);
  }
  if (!MUX_ENV_KEY) {
    console.warn(
      '! MUX_ENV_KEY is empty — mux-embed loads and monitors (cost is measured) but sends no data. Set MUX_ENV_KEY=<your Mux Data env key> for a real run.',
    );
  }

  const devOpts = { ip: IP, device: process.env.WEBOS_DEVICE, appId: process.env.VZB_APP_ID };
  const pf = await preflight(makeDevice(platform, devOpts), platform.label);
  pf.lines.forEach((l) => console.log(l));
  if (!pf.ok) {
    console.error('preflight FAILED');
    process.exit(2);
  }
  console.log('preflight OK');
  if (has('--check')) return;

  const runDate = new Date().toISOString().slice(0, 10);
  const outRoot =
    process.env.PERF_OUT_DIR ??
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'perf-results', `mux-perf-${runDate}`, platform.key);
  fs.mkdirSync(outRoot, { recursive: true });
  const raw = fs.createWriteStream(path.join(outRoot, 'samples.jsonl'), { flags: 'a' });
  /** @param {Record<string, unknown>} rec */
  const writeSample = (rec) => raw.write(JSON.stringify(rec) + '\n');

  const cases = [
    { ...MUX_CASES.without, mux: false },
    { ...MUX_CASES.nosender, mux: true },
  ];
  /** @type {Record<string, import('./lib/runner.js').RunResult[]>} */
  const byCase = {};
  for (const c of cases) {
    console.log(`\n=== ${c.key} (${c.label}) ===`);
    const outDir = `dist/_perf-mux-${platform.key}-${c.key}`;
    console.log('building ...');
    buildVariant({ withVizbee: false, mux: c.mux, muxEnvKey: MUX_ENV_KEY, mode: platform.mode, outDir });
    const served = await serve(outDir, PORT);
    console.log(`serving ${served.url}`);
    const dev = makeDevice(platform, devOpts);
    try {
      byCase[c.key] = await runCase({
        case_: c,
        url: served.url,
        dev,
        videos: pf.videos,
        runs: RUNS,
        log: (l) => console.log(l),
        writeSample,
        homeMs: HOME_MS,
        playMs: PLAY_MS,
      });
    } finally {
      dev.close();
      served.stop();
    }
  }
  raw.end();

  const s = summarize(byCase);
  const table = textTable(s, MUX_CASES);
  console.log('\n' + table);

  const capDev = makeDevice(platform, devOpts);
  const base = await captureDeviceInfo(platform, {
    dev: capDev,
    device: devOpts.device,
    serial: process.env.TIZEN_SERIAL,
    withVizbee: false,
  }).catch(() => null);
  try {
    capDev.close?.();
  } catch {
    /* ignore */
  }
  const device = base
    ? { ...base, Tested: `mux-embed monitoring${MUX_ENV_KEY ? '' : ' (no env key)'} · no Vizbee SDK` }
    : null;
  if (device) fs.writeFileSync(path.join(outRoot, 'device.json'), JSON.stringify(device, null, 2));

  fs.writeFileSync(path.join(outRoot, 'results.json'), JSON.stringify({ cases: s.cases, costs: s.costs }, null, 2));
  fs.writeFileSync(path.join(outRoot, 'summary.md'), `# Mux perf (${platform.label})\n\n\`\`\`\n${table}\n\`\`\`\n`);
  fs.writeFileSync(
    path.join(outRoot, 'report.pdf'),
    buildReportPdf({
      summary: s,
      byCase,
      caseDefs: MUX_CASES,
      meta: {
        platform: platform.label,
        date: runDate,
        device,
        homeMs: HOME_MS,
        playMs: PLAY_MS,
        intro: [
          'What this measures: the CPU and memory Mux Data (mux-embed) monitoring adds to the TV app.',
          'Cases: without Mux (baseline) | with Mux (mux-embed monitoring the player). No Vizbee SDK in either.',
          'Phases: home page idle, then video playback started by a deep link.',
        ],
        sdkCostLabel: 'Mux cost  (with Mux - without Mux, paired per video)',
      },
    }),
  );
  console.log(`\nresults: ${outRoot}`);
}

main().catch((e) => {
  console.error('perf-mux failed:', e?.message ?? e);
  process.exit(1);
});
