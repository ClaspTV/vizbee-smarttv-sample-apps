// @ts-check
'use strict';

import { sampleFor, captureWebVitals } from './metrics.js';
import { INTERVAL_MS, HOME_MS, PLAYBACK_MS, MARKER_TIMEOUT_MS } from './constants.js';

/**
 * @typedef {import('./metrics.js').Sample} Sample
 * @typedef {import('./metrics.js').WebVitals} WebVitals
 * @typedef {{ run: number, video: string, home: Sample[], play: Sample[], vitals?: WebVitals }} RunResult
 */

/**
 * Resolve when a console.log containing `needle` arrives (one-shot).
 * @param {import('./cdp.js').Cdp} cdp
 * @param {string} needle
 * @param {number} timeoutMs
 * @returns {Promise<void>}
 */
export function waitForMarker(cdp, needle, timeoutMs) {
  return new Promise((resolve, reject) => {
    const off = cdp.on('Runtime.consoleAPICalled', (p) => {
      const text = (p?.args ?? []).map((/** @type {any} */ a) => String(a?.value ?? '')).join(' ');
      if (text.includes(needle)) {
        off();
        clearTimeout(timer);
        resolve();
      }
    });
    const timer = setTimeout(() => {
      off();
      reject(new Error(`timeout waiting for "${needle}"`));
    }, timeoutMs);
  });
}

/**
 * Run every run of one case against one served URL.
 * Each run: relaunch at home → sample home → hash-nav to player → sample playback.
 * @param {object} opts
 * @param {import('./cases.js').Case} opts.case_
 * @param {string} opts.url
 * @param {import('./device/index.js').Device} opts.dev
 * @param {import('./cases.js').Video[]} opts.videos
 * @param {number} opts.runs
 * @param {(line: string) => void} opts.log
 * @param {(rec: Record<string, unknown>) => void} opts.writeSample
 * @param {number} [opts.homeMs]
 * @param {number} [opts.playMs]
 * @returns {Promise<RunResult[]>}
 */
export async function runCase({
  case_,
  url,
  dev,
  videos,
  runs,
  log,
  writeSample,
  homeMs = HOME_MS,
  playMs = PLAYBACK_MS,
}) {
  /** @type {RunResult[]} */
  const results = [];
  const cdp = await dev.attach();
  await cdp.send('Runtime.enable');
  await cdp.send('Performance.enable');

  for (let run = 1; run <= runs; run++) {
    const video = videos[(run - 1) % videos.length];
    log(`  [${case_.key}] run ${run}/${runs} video=${video.id}`);

    // Relaunch fresh at home. Listener attached before navigate to avoid a race.
    const launched = waitForMarker(cdp, '[VZBPERF] app launched', MARKER_TIMEOUT_MS);
    await dev.navigate(url);
    await launched;
    const home = await sampleFor(cdp, homeMs, INTERVAL_MS, (s) =>
      writeSample({ case: case_.key, run, video: video.id, phase: 'home', ...s }),
    );

    // Web vitals of the launched page (null where the browser emits no entry).
    const vitals = await captureWebVitals(cdp);
    writeSample({ case: case_.key, run, video: video.id, phase: 'vitals', ...vitals });

    // Start playback as a fresh deep-link load: the Router reads the launch hash
    // on boot, so each run starts from a clean boot (identical heap) — what the
    // paired cost comparison needs. (BACK from the player goes straight to Home;
    // the exit-confirm modal is only a hardware BACK on Home, which this never
    // sends. The long run keeps one session instead — see perf/lib/long.js.)
    const playing = waitForMarker(cdp, '[VZBPERF] video playing', MARKER_TIMEOUT_MS);
    await dev.navigate(`${url}#/player/${video.id}`);
    await playing;
    const play = await sampleFor(cdp, playMs, INTERVAL_MS, (s) =>
      writeSample({ case: case_.key, run, video: video.id, phase: 'play', ...s }),
    );

    results.push({ run, video: video.id, home, play, vitals });
  }
  return results;
}
