// @ts-check
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeDevice } from './lib/device/index.js';
import { buildVariant, serve } from './lib/build.js';
import { preflight } from './lib/preflight.js';
import { CASES } from './lib/cases.js';
import { getPlatform } from './lib/platforms.js';
import { runCase } from './lib/runner.js';
import { summarize, textTable } from './lib/report.js';
import { buildReportPdf } from './lib/pdf-report.js';
import { captureDeviceInfo } from './lib/deviceinfo.js';
import { findAdb, Phone, phoneSerial } from './lib/phone.js';

/**
 * End-to-end perf run. Vizio is validated; webOS/Tizen share the code path but
 * need on-device validation of their device adapter.
 *
 * Env: VIZIO_IP, PERF_RUNS (3), PERF_HOME_MS / PERF_PLAY_MS (180000), PERF_OUT_DIR,
 *      PHONE_SERIAL (adb serial; default the first device), PERF_TV_NAME (sender case).
 * Flags: --platform vizio|webos|tizen (default vizio), --es6, --sender, --cases k,k, --check.
 */
const IP = process.env.VIZIO_IP ?? '10.0.0.141';
const RUNS = Number(process.env.PERF_RUNS ?? 3);
const HOME_MS = Number(process.env.PERF_HOME_MS ?? 180000);
const PLAY_MS = Number(process.env.PERF_PLAY_MS ?? 180000);
const PORT = Number(process.env.PERF_PORT ?? 4190);

/** @param {string} flag @returns {string | undefined} */
function argVal(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (/** @type {string} */ f) => process.argv.includes(f);

/** @returns {string} */
function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

async function main() {
  const platform = getPlatform(argVal('--platform') ?? 'vizio');
  const pkg = has('--es6') ? platform.elPackage.es6 : platform.elPackage.es5;
  const withSender = has('--sender');
  if (!platform.validated) {
    console.warn(`! ${platform.label} device adapter is UNVALIDATED — mechanics only.`);
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
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      'perf-results',
      `vizbee-sdk-perf-${runDate}`,
      platform.key,
    );
  fs.mkdirSync(outRoot, { recursive: true });
  const raw = fs.createWriteStream(path.join(outRoot, 'samples.jsonl'), { flags: 'a' });
  /** @param {Record<string, unknown>} rec */
  const writeSample = (rec) => raw.write(JSON.stringify(rec) + '\n');

  const pkgFor = (/** @type {import('./lib/cases.js').Case} */ c) => (c.withVizbee ? pkg : '');
  const caseArg = argVal('--cases');
  /** @type {import('./lib/cases.js').Case[]} */
  let cases;
  if (caseArg) {
    cases = caseArg
      .split(',')
      .map((k) => k.trim())
      .map((k) => {
        const c = CASES[/** @type {'without'} */ (k)];
        if (!c) throw new Error(`unknown case "${k}"`);
        return { ...c, npmPackage: pkgFor(c) };
      });
  } else {
    cases = [CASES.without, { ...CASES.nosender, npmPackage: pkg }];
    if (withSender) cases.push({ ...CASES.sender, npmPackage: pkg });
  }

  // Sender phone (adb). The demo app is stopped for the other cases so it cannot
  // auto-reconnect to the TV and contaminate them.
  /** @type {Phone | null} */
  let phone = null;
  const tvName = process.env.PERF_TV_NAME ?? '';
  if (cases.some((c) => c.sender)) {
    try {
      const adb = findAdb();
      if (!adb) throw new Error('adb not found');
      const serial = phoneSerial(adb);
      if (!tvName) throw new Error('PERF_TV_NAME is not set (the TV name in the phone picker)');
      phone = new Phone(adb, serial);
      phone.keepAwake();
      await phone.restartApp();
      await phone.ensureDisconnected();
      console.log(`sender phone ${serial} ready (TV "${tvName}")`);
    } catch (e) {
      console.warn(`! sender phone unavailable (${/** @type {Error} */ (e).message}); sender case runs without a connect`);
      phone = null;
    }
  }

  /** @type {Record<string, import('./lib/runner.js').RunResult[]>} */
  const byCase = {};
  for (const c of cases) {
    console.log(`\n=== ${c.key} (${c.label}) ===`);
    const outDir = `dist/_perf-${platform.key}-${c.key}`;
    console.log('building ...');
    buildVariant({ withVizbee: c.withVizbee, npmPackage: c.npmPackage, mode: platform.mode, outDir });
    const served = await serve(outDir, PORT);
    console.log(`serving ${served.url}`);
    if (phone) {
      if (c.sender) {
        await phone.restartApp();
        await phone.ensureDisconnected();
      } else {
        await phone.ensureDisconnected().catch(() => {});
        phone.forceStop();
      }
    }
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
        phone: c.sender ? phone : null,
        tvName,
      });
    } finally {
      dev.close();
      served.stop();
    }
  }
  raw.end();
  if (phone) {
    await phone.ensureDisconnected().catch(() => {});
    try {
      phone.forceStop();
      phone.restoreAwake();
    } catch {
      /* ignore */
    }
  }

  const s = summarize(byCase);
  const table = textTable(s, CASES);
  console.log('\n' + table);

  // best-effort device details for the report's "Device & run" table (all platforms)
  const capDev = makeDevice(platform, devOpts);
  const device = await captureDeviceInfo(platform, {
    dev: capDev,
    device: devOpts.device,
    serial: process.env.TIZEN_SERIAL,
    npmPackage: pkg,
    withVizbee: true,
  }).catch(() => null);
  try {
    capDev.close?.();
  } catch {
    /* ignore */
  }
  if (device) fs.writeFileSync(path.join(outRoot, 'device.json'), JSON.stringify(device, null, 2));

  fs.writeFileSync(path.join(outRoot, 'results.json'), JSON.stringify({ cases: s.cases, costs: s.costs }, null, 2));
  fs.writeFileSync(path.join(outRoot, 'summary.md'), `# Vizbee SDK perf (${platform.label})\n\n\`\`\`\n${table}\n\`\`\`\n`);
  fs.writeFileSync(
    path.join(outRoot, 'report.pdf'),
    buildReportPdf({
      summary: s,
      byCase,
      caseDefs: CASES,
      meta: { platform: platform.label, date: runDate, device, homeMs: HOME_MS, playMs: PLAY_MS },
    }),
  );
  console.log(`\nresults: ${outRoot}`);
}

main().catch((e) => {
  console.error('perf-e2e failed:', e?.message ?? e);
  process.exit(1);
});
