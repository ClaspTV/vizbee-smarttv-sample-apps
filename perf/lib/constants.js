// @ts-check
'use strict';

import fs from 'node:fs';
import path from 'node:path';

/** Phase + sampling timing. Overridable via env in perf-e2e for quick runs. */
export const HOME_MS = 180000;
export const PLAYBACK_MS = 180000;
export const INTERVAL_MS = 5000;
/** Memory = average of the last 60s of a phase (playback buffers for ~2 min). */
export const MEM_WINDOW_MS = 60000;
/** How long to wait for a [VZBPERF] marker before failing a run. */
export const MARKER_TIMEOUT_MS = 45000;

/** Case key -> short folder/CSV slug (the customer-facing case name). */
export const CASE_SLUG = /** @type {Record<string, string>} */ ({
  without: 'no-vizbee',
  nosender: 'vizbee',
  sender: 'vizbee-sender',
  mux: 'mux',
});

/**
 * Short slug for each case key, in run order. For the Mux run the without /
 * nosender keys mean no-Mux / with-Mux, so pass `{ mux: true }`.
 * @param {string[]} keys @param {{ mux?: boolean }} [o]
 * @returns {string[]}
 */
export function caseSlugs(keys, o = {}) {
  if (o.mux) return keys.map((k) => (k === 'without' ? 'no-mux' : k === 'nosender' ? 'mux' : CASE_SLUG[k] || k));
  return keys.map((k) => CASE_SLUG[k] || k);
}

/** Today as mmddyyyy (local), the date stamp in result-folder names. @param {Date} [d] */
export function mmddyyyy(d = new Date()) {
  const n = (/** @type {number} */ x) => String(x).padStart(2, '0');
  return `${n(d.getMonth() + 1)}${n(d.getDate())}${d.getFullYear()}`;
}

/**
 * Result folder under perf-results/, named `<cases>_<platform>_<mmddyyyy>`
 * (e.g. `no-vizbee+vizbee+vizbee-sender_vizio_11252026`), matching the Roku
 * harness convention. The SDK measured and run counts live in the report
 * header, not the name. A name already taken gets `-2`, `-3`, ... Flags such
 * as `dry-run` go last. Honors PERF_OUT_DIR if set.
 * @param {{ root: string, cases: string[], platform: string, flags?: string[] }} p
 * @returns {string}
 */
export function resultDir({ root, cases, platform, flags = [] }) {
  if (process.env.PERF_OUT_DIR) return process.env.PERF_OUT_DIR;
  const parts = [cases.join('+'), platform, mmddyyyy(), ...flags].filter(Boolean);
  const base = path.join(root, 'perf-results', parts.join('_'));
  let dir = base;
  for (let i = 2; fs.existsSync(dir); i++) dir = `${base}-${i}`;
  return dir;
}
