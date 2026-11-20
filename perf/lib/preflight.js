// @ts-check
'use strict';

import { VIDEOS } from './cases.js';

/**
 * @param {string} url
 * @returns {Promise<boolean>}
 */
async function streamOk(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Check the TV is reachable and which streams respond. Dead streams are dropped
 * from the returned list rather than failing the whole run.
 * @param {import('./device/index.js').Device} dev
 * @param {string} [label]
 * @returns {Promise<{ ok: boolean, lines: string[], videos: import('./cases.js').Video[] }>}
 */
export async function preflight(dev, label = 'TV') {
  /** @type {string[]} */
  const lines = [];
  let ok = true;

  const reachable = await dev.reachable();
  lines.push(`${label} ... ${reachable ? 'OK' : 'UNREACHABLE (open the app on the TV)'}`);
  dev.close();
  if (!reachable) ok = false;

  /** @type {import('./cases.js').Video[]} */
  const good = [];
  for (const v of VIDEOS) {
    const up = await streamOk(v.url);
    lines.push(`stream ${v.id} ... ${up ? 'OK' : 'DOWN (dropped)'}`);
    if (up) good.push(v);
  }
  if (good.length === 0) {
    ok = false;
    lines.push('no working streams');
  }

  return { ok, lines, videos: good };
}
