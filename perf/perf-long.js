// @ts-check
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeDevice } from './lib/device/index.js';
import { buildVariant, serve } from './lib/build.js';
import { getPlatform } from './lib/platforms.js';
import { CASES, LONG_VIDEOS, LONG_VIDEO, LONG_FALLBACK } from './lib/cases.js';
import { runLongCase, longEnough } from './lib/long.js';
import { writeLongReport } from './lib/long-report.js';
import { captureDeviceInfo } from './lib/deviceinfo.js';
import { findAdb, Phone } from './lib/phone.js';

/**
 * Long playback run: one served build per case, a long home page, then several
 * long (> 20 min) playbacks, in the same build. Mirrors the Roku long run
 * (scripts/perf-long.js): the defaults ARE the measurement.
 *
 *   home page --idle (10 min), then --plays (2) playbacks of --play (20 min),
 *   each followed by --after (30 s) on the home page; one warm-up playback first.
 *
 * Env: VIZIO_IP, WEBOS_DEVICE, VZB_APP_ID, TIZEN_SERIAL, PERF_OUT_DIR, PERF_PORT.
 * Flags: --platform vizio|webos|tizen (default webos), --es6, --sender,
 *        --idle S, --play S, --plays N, --after S, --warmup S, --video <id>,
 *        --fallback a,b, --cases k,k, --dry-run, --report <dir>.
 *
 * --dry-run: home 30 s, 2 playbacks of 60 s, 10 s after each (about 5 min).
 * --report <dir>: rebuild report.pdf / summary.md from that run's results.json.
 */
const PORT = Number(process.env.PERF_PORT ?? 4190);

/** @param {string} flag @returns {string | undefined} */
function argVal(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (/** @type {string} */ f) => process.argv.includes(f);
const csv = (/** @type {string} */ s) => s.split(',').map((x) => x.trim()).filter(Boolean);

async function streamOk(/** @type {string} */ url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function main() {
  const reportDir = argVal('--report');
  if (reportDir) {
    const dir = path.resolve(reportDir);
    const { meta, results } = JSON.parse(fs.readFileSync(path.join(dir, 'results.json'), 'utf8'));
    console.log(writeLongReport(dir, meta, results, LONG_VIDEOS));
    return;
  }

  const platform = getPlatform(argVal('--platform') ?? 'webos');
  const pkg = has('--es6') ? platform.elPackage.es6 : platform.elPackage.es5;
  const dry = has('--dry-run');

  const o = {
    idle: Number(argVal('--idle') ?? (dry ? 30 : 600)),
    play: Number(argVal('--play') ?? (dry ? 60 : 1200)),
    plays: Number(argVal('--plays') ?? 2),
    after: Number(argVal('--after') ?? (dry ? 10 : 30)),
    warmup: Number(argVal('--warmup') ?? (dry ? 10 : 20)),
    video: argVal('--video') ?? LONG_VIDEO,
    fallbacks: argVal('--fallback') ? csv(/** @type {string} */ (argVal('--fallback'))) : LONG_FALLBACK,
    videos: LONG_VIDEOS,
    allowReload: has('--allow-reload'),
  };
  if (!LONG_VIDEOS[o.video]) throw new Error(`unknown --video "${o.video}" (${Object.keys(LONG_VIDEOS).join(', ')})`);
  if (!longEnough(LONG_VIDEOS[o.video], o.play)) {
    throw new Error(`--video ${o.video} (${LONG_VIDEOS[o.video].durationSec}s) is too short for --play ${o.play}s`);
  }

  const partsArg = argVal('--cases');
  const parts = partsArg
    ? csv(partsArg)
    : has('--sender')
      ? ['sender', 'nosender', 'without']
      : ['nosender', 'without'];
  /** @type {import('./lib/cases.js').Case[]} */
  const cases = parts.map((k) => {
    const c = CASES[/** @type {'without'} */ (k)];
    if (!c) throw new Error(`unknown case "${k}" (without | nosender | sender)`);
    return { ...c, npmPackage: c.withVizbee ? pkg : '' };
  });

  const devOpts = {
    ip: process.env.VIZIO_IP,
    device: process.env.WEBOS_DEVICE,
    appId: process.env.VZB_APP_ID,
  };

  const dev0 = makeDevice(platform, devOpts);
  const reachable = await dev0.reachable();
  dev0.close();
  console.log(`${platform.label} ... ${reachable ? 'OK' : 'UNREACHABLE (open the app on the TV)'}`);
  const videoUp = await streamOk(LONG_VIDEOS[o.video].url);
  console.log(`stream ${o.video} ... ${videoUp ? 'OK' : 'DOWN'}`);
  for (const fb of o.fallbacks) {
    console.log(`stream ${fb} (fallback) ... ${(await streamOk(LONG_VIDEOS[fb].url)) ? 'OK' : 'DOWN'}`);
  }
  if (!reachable || !videoUp) {
    console.error('preflight FAILED');
    process.exit(2);
  }
  console.log('preflight OK');
  if (has('--check')) return;

  /** @type {Phone | null} */
  let phone = null;
  if (cases.some((c) => c.sender)) {
    try {
      phone = new Phone(findAdb(), process.env.PHONE_SERIAL);
    } catch (e) {
      console.warn(`! phone unavailable (${/** @type {Error} */ (e).message}); sender case runs without a connect`);
    }
  }

  const runDate = new Date().toISOString().slice(0, 10);
  const outRoot =
    process.env.PERF_OUT_DIR ??
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      'perf-results',
      `vizbee-sdk-long-${runDate}`,
      platform.key,
    );
  fs.mkdirSync(outRoot, { recursive: true });
  const raw = fs.createWriteStream(path.join(outRoot, 'samples.jsonl'), { flags: 'a' });
  const writeSample = (/** @type {Record<string, unknown>} */ rec) => raw.write(JSON.stringify(rec) + '\n');

  const device = await captureDeviceInfo(platform, {
    dev: makeDevice(platform, devOpts),
    device: devOpts.device,
    serial: process.env.TIZEN_SERIAL,
    npmPackage: pkg,
    withVizbee: true,
  }).catch(() => null);

  const meta = {
    started: new Date().toString().replace(/ \(.*\)$/, ''),
    platform: platform.label,
    device,
    sdkVariant: `${pkg} (elementless npm)`,
    idleSecs: o.idle,
    playSecs: o.play,
    plays: o.plays,
    afterSecs: o.after,
    warmupSecs: o.warmup,
    video: o.video,
    parts,
    phone: phone ? 'Android (adb)' : null,
    dryRun: dry,
    inProgress: true,
  };

  const eachMin = Math.round((o.warmup + o.idle + o.plays * (o.play + o.after) + 120) / 60);
  console.log(`output ${outRoot}`);
  console.log(
    `plan: ${parts.join(' > ')}, one build each; home ${o.idle}s, ${o.plays} x playback ${o.play}s (+${o.after}s home after each); video ${LONG_VIDEOS[o.video].title}; about ${eachMin * parts.length} min`,
  );

  /** @type {Record<string, import('./lib/long.js').CaseResult>} */
  const results = {};
  const save = () => {
    fs.writeFileSync(path.join(outRoot, 'results.partial.json'), JSON.stringify({ meta, results }, null, 2));
    try {
      writeLongReport(outRoot, meta, results, LONG_VIDEOS);
    } catch (e) {
      console.log(`  (report update failed: ${/** @type {Error} */ (e).message})`);
    }
  };

  const tvName = process.env.PERF_TV_NAME ?? (device && device.Model) ?? platform.label;

  for (const c of cases) {
    console.log(`\n=== ${c.key} (${c.label}) ===`);
    const outDir = `dist/_perf-long-${platform.key}-${c.key}`;
    console.log('building ...');
    buildVariant({ withVizbee: c.withVizbee, npmPackage: c.npmPackage, mode: platform.mode, outDir, perfHooks: true });
    const served = await serve(outDir, PORT);
    console.log(`serving ${served.url}`);
    const dev = makeDevice(platform, devOpts);
    try {
      results[c.key] = await runLongCase({
        dev,
        url: served.url,
        case_: c,
        o: { ...o, phone: c.sender ? phone : null, tvName },
        log: (l) => console.log(l),
        writeSample,
        onProgress: (cr) => {
          results[c.key] = cr;
          save();
        },
      });
    } catch (e) {
      const msg = /** @type {Error} */ (e).message;
      console.log(`  ${c.label} failed: ${msg}`);
      results[c.key] = results[c.key] || {
        key: c.key,
        label: c.label,
        withVizbee: c.withVizbee,
        video: o.video,
        notes: [],
        home: null,
        plays: [],
      };
      results[c.key].failed = msg;
    } finally {
      dev.close();
      served.stop();
      save();
    }
  }
  raw.end();

  meta.inProgress = false;
  fs.rmSync(path.join(outRoot, 'results.partial.json'), { force: true });
  console.log('\n' + writeLongReport(outRoot, meta, results, LONG_VIDEOS));
  console.log(`\nresults: ${outRoot}`);
}

main().catch((e) => {
  console.error('perf-long failed:', e?.message ?? e);
  process.exit(1);
});
