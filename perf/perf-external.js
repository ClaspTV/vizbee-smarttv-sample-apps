// @ts-check
'use strict';

/**
 * Write <run dir>/external/: the report and data that can be shared with a
 * customer (no local paths, device IPs/serials or runner internals). Every
 * perf runner already does this at the end of a run; use this to redo it for
 * an old run or with another SDK label.
 *
 *   node perf-external.js <run dir> [--sdk-label "4.5.24 (pre-release)"] [--platform Vizio]
 */

import { writeExternal } from './lib/external.js';

/** @param {string} flag */
function argVal(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const valued = new Set(['--sdk-label', '--platform']);
const runDir = process.argv.slice(2).find((a, i, all) => !a.startsWith('--') && !valued.has(all[i - 1] ?? ''));
if (!runDir) {
  console.error('usage: node perf-external.js <run dir> [--sdk-label "<label>"] [--platform Vizio]');
  process.exit(2);
}
console.log(writeExternal(runDir, { sdkLabel: argVal('--sdk-label'), platform: argVal('--platform') }));
