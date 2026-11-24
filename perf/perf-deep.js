// @ts-check
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeDevice } from './lib/device/index.js';
import { buildVariant, serve } from './lib/build.js';
import { preflight } from './lib/preflight.js';
import { getPlatform } from './lib/platforms.js';
import { waitForMarker, waitForPlayback } from './lib/runner.js';
import { captureCpuProfile, captureHeapProfile } from './lib/profile.js';
import { buildDeepPdf } from './lib/pdf-deep.js';
import { MARKER_TIMEOUT_MS } from './lib/constants.js';

/**
 * Deep dive: profile the with-Vizbee build (unminified, so frames carry real
 * names) during playback and attribute CPU + allocation to functions/lines.
 * Writes cpu.pdf / memory.pdf (+ raw json).
 *
 * Env: VIZIO_IP, PERF_PROFILE_MS (30000). Optional arg: an existing results dir
 * to write into (default: a new perf-results/<stamp>/deep).
 */
const IP = process.env.VIZIO_IP ?? '10.0.0.141';
const PROFILE_MS = Number(process.env.PERF_PROFILE_MS ?? 30000);
const PORT = Number(process.env.PERF_PORT ?? 4191);

/** @param {string} flag @returns {string | undefined} */
function argVal(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** @returns {string} */
function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

async function main() {
  const platform = getPlatform(argVal('--platform') ?? 'vizio');
  const pkg = process.argv.includes('--es6') ? platform.elPackage.es6 : platform.elPackage.es5;
  const valued = new Set(['--platform', '--cases']);
  const argDir = process.argv.slice(2).find((a, i, all) => !a.startsWith('--') && !valued.has(all[i - 1] ?? ''));
  const outDirResults = argDir
    ? path.join(argDir, 'deep')
    : path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'perf-results', stamp(), 'deep');
  fs.mkdirSync(outDirResults, { recursive: true });

  const devOpts = { ip: IP, device: process.env.WEBOS_DEVICE, appId: process.env.VZB_APP_ID };
  const pf = await preflight(makeDevice(platform, devOpts), platform.label);
  pf.lines.forEach((l) => console.log(l));
  if (!pf.ok) {
    console.error('preflight FAILED');
    process.exit(2);
  }
  const video = pf.videos[0];

  console.log('building with-Vizbee (unminified) ...');
  const buildDir = `dist/_perf-deep-${platform.key}`;
  buildVariant({
    withVizbee: true,
    npmPackage: pkg,
    mode: platform.mode,
    outDir: buildDir,
    minify: false,
  });
  const served = await serve(buildDir, PORT);
  console.log(`serving ${served.url}`);

  const dev = makeDevice(platform, devOpts);
  try {
    const cdp = await dev.attach();
    await cdp.send('Runtime.enable');

    const launched = waitForMarker(cdp, '[VZBPERF] app launched', MARKER_TIMEOUT_MS);
    await dev.navigate(served.url);
    await launched;

    // Fresh deep-link load (as perf-e2e does): an in-page hash change while the SDK
    // is still initializing can leave the player stuck on some TVs.
    const playing = waitForPlayback(cdp, '[VZBPERF] video playing');
    await dev.navigate(`${served.url}#/player/${video.id}`);
    await playing;

    console.log(`profiling ${PROFILE_MS / 1000}s (CPU + heap, playback) ...`);
    const [cpu, heap] = await Promise.all([
      captureCpuProfile(cdp, PROFILE_MS),
      captureHeapProfile(cdp, PROFILE_MS),
    ]);

    fs.writeFileSync(path.join(outDirResults, 'cpu.json'), JSON.stringify(cpu, null, 2));
    fs.writeFileSync(path.join(outDirResults, 'heap.json'), JSON.stringify(heap, null, 2));
    fs.writeFileSync(
      path.join(outDirResults, 'cpu.pdf'),
      buildDeepPdf('CPU by function (playback)', cpu, (v) => `${v.toFixed(1)} ms`, platform.label),
    );
    fs.writeFileSync(
      path.join(outDirResults, 'memory.pdf'),
      buildDeepPdf('Allocation by function (playback)', heap, (v) => `${(v / 1024).toFixed(1)} KB`, platform.label),
    );

    console.log(`\ntop CPU frames:`);
    cpu.slice(0, 5).forEach((r) => console.log(`  ${r.value.toFixed(1)}ms  ${r.fn}  ${r.url}:${r.line}`));
    console.log(`top alloc frames:`);
    heap.slice(0, 5).forEach((r) => console.log(`  ${(r.value / 1024).toFixed(1)}KB  ${r.fn}  ${r.url}:${r.line}`));
    console.log(`\ndeep-dive: ${outDirResults}`);
  } finally {
    dev.close();
    served.stop();
  }
}

main().catch((e) => {
  console.error('perf-deep failed:', e?.message ?? e);
  process.exit(1);
});
