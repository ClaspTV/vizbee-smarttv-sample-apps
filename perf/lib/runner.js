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

/** How long a deep-linked playback may take to start (TV boot + SDK init + stream). */
export const PLAYBACK_START_TIMEOUT_MS = 90000;
const sleep = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Resolve once a <video> on the player route is playing and past 1s. Some
 * engines never surface the 'playing' event with the SDK loaded (2019 Tizen /
 * Chromium 63), so the player's console marker cannot be the only signal.
 * @param {import('./cdp.js').Cdp} cdp
 * @param {number} timeoutMs
 * @returns {Promise<void>}
 */
export async function waitForVideoAdvancing(cdp, timeoutMs) {
  const expr =
    "(function(){var v=document.querySelector('video');" +
    "return !!(v&&!v.paused&&v.currentTime>1&&location.hash.indexOf('/player/')>=0)})()";
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const ok = await cdp.evaluate(expr).catch(() => false);
    if (process.env.PERF_DEBUG) console.log(`    [debug] video advancing: ${ok}`);
    if (ok) return;
    await sleep(1000);
  }
  throw new Error(`timeout waiting for video to play (${timeoutMs / 1000}s)`);
}

/**
 * Playback started: the [VZBPERF] marker or the video clock advancing,
 * whichever comes first. Only the clock check can time out. Create it before
 * navigating so the marker is not missed.
 * @param {import('./cdp.js').Cdp} cdp
 * @param {string} marker
 * @param {number} [timeoutMs]
 * @returns {Promise<void>}
 */
export function waitForPlayback(cdp, marker, timeoutMs = PLAYBACK_START_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (/** @type {Error | null} */ err) => {
      if (done) return;
      done = true;
      err ? reject(err) : resolve();
    };
    waitForMarker(cdp, marker, timeoutMs).then(() => finish(null), () => {});
    waitForVideoAdvancing(cdp, timeoutMs).then(() => finish(null), (e) => finish(e));
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
 * @param {import('./phone.js').Phone | null} [opts.phone] sender phone (sender case only)
 * @param {string} [opts.tvName] TV name as the phone's device picker shows it
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
  phone = null,
  tvName = '',
}) {
  /** @type {RunResult[]} */
  const results = [];
  const cdp = await dev.attach();
  await cdp.send('Runtime.enable');
  await cdp.send('Performance.enable');

  const useSender = Boolean(case_.sender && phone && tvName);
  // Each navigate reloads the TV app, which ends the old session; drop the phone
  // first so it reconnects to the fresh one instead of lingering on a dead one.
  const dropSender = async () => {
    if (useSender && phone) await phone.ensureDisconnected().catch(() => {});
  };
  // Started from the first sample of a phase (not before it), so every case's
  // window begins at the same point - app launch / playback start - and the
  // sender case's window includes its connect, which is part of the sender's
  // cost. Not earlier: phone.connect() runs synchronous adb calls before its
  // first await, which would delay the first sample past the startup work.
  const connectSender = async (/** @type {string} */ phase) => {
    if (!useSender || !phone) return;
    const t0 = Date.now();
    try {
      const c = await phone.connect(tvName);
      log(c && c.connectedAt ? `    sender connected (${phase}) in ${Date.now() - t0}ms` : `    sender connect (${phase}) not confirmed`);
    } catch (e) {
      log(`    sender connect (${phase}) failed: ${/** @type {Error} */ (e).message}`);
    }
  };
  /**
   * Sample one phase from its start; in the sender case, kick off the phone
   * connect right after the first sample (see connectSender) and wait for it
   * before returning.
   * @param {'home' | 'play'} phase @param {number} ms @param {number} run @param {string} videoId
   * @returns {Promise<Sample[]>}
   */
  const samplePhase = async (phase, ms, run, videoId) => {
    /** @type {Promise<void> | null} */
    let connecting = null;
    const samples = await sampleFor(cdp, ms, INTERVAL_MS, (s) => {
      writeSample({ case: case_.key, run, video: videoId, phase, ...s });
      if (!connecting) connecting = connectSender(phase);
    });
    await connecting;
    return samples;
  };
  if (case_.sender && !useSender) log('    ! sender case without a phone: runs with no sender connected');

  for (let run = 1; run <= runs; run++) {
    const video = videos[(run - 1) % videos.length];
    log(`  [${case_.key}] run ${run}/${runs} video=${video.id}`);

    // Relaunch fresh at home. Listener attached before navigate to avoid a race.
    await dropSender();
    const launched = waitForMarker(cdp, '[VZBPERF] app launched', MARKER_TIMEOUT_MS);
    await dev.navigate(url);
    await launched;
    const home = await samplePhase('home', homeMs, run, video.id);

    // Web vitals of the launched page (null where the browser emits no entry).
    const vitals = await captureWebVitals(cdp);
    writeSample({ case: case_.key, run, video: video.id, phase: 'vitals', ...vitals });

    // Start playback as a fresh deep-link load: the Router reads the launch hash
    // on boot, so each run starts from a clean boot (identical heap) — what the
    // paired cost comparison needs. (BACK from the player goes straight to Home;
    // the exit-confirm modal is only a hardware BACK on Home, which this never
    // sends. The long run keeps one session instead — see perf/lib/long.js.)
    await dropSender();
    const playing = waitForPlayback(cdp, '[VZBPERF] video playing');
    await dev.navigate(`${url}#/player/${video.id}`);
    await playing;
    const play = await samplePhase('play', playMs, run, video.id);

    results.push({ run, video: video.id, home, play, vitals });
  }
  return results;
}
