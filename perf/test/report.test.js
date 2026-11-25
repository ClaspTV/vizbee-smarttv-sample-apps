// @ts-check
'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import { cpuPercent, lastWindowAvg } from '../lib/metrics.js';
import { median, p95, pairedCost, phaseMetrics } from '../lib/report.js';

/** @param {Partial<import('../lib/metrics.js').Sample>} p @returns {import('../lib/metrics.js').Sample} */
const S = (p) => ({ t: 0, taskDuration: 0, jsHeapUsed: 0, jsHeapTotal: 0, nodes: 0, listeners: 0, ...p });

test('cpuPercent = Δtask / Δwall', () => {
  assert.equal(cpuPercent(S({ t: 0, taskDuration: 0 }), S({ t: 1000, taskDuration: 0.5 })), 50);
  assert.equal(cpuPercent(S({ t: 0 }), S({ t: 0 })), 0); // guard div-by-zero
});

test('median handles odd, even, empty', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([]), 0);
});

test('lastWindowAvg averages only the trailing window', () => {
  const samples = [
    S({ t: 0, jsHeapUsed: 100 }),
    S({ t: 1000, jsHeapUsed: 200 }),
    S({ t: 9000, jsHeapUsed: 300 }),
    S({ t: 10000, jsHeapUsed: 400 }),
  ];
  // window 2000ms before end (t=10000) -> only t=9000 and t=10000 -> (300+400)/2
  assert.equal(lastWindowAvg(samples, (s) => s.jsHeapUsed, 2000), 350);
});

test('pairedCost subtracts per-run same-video, then medians', () => {
  // two runs, memory climbs by a known amount with Vizbee
  const base = (/** @type {number} */ mem) => [S({ t: 0, jsHeapUsed: mem }), S({ t: 1000, jsHeapUsed: mem })];
  /** @type {import('../lib/runner.js').RunResult[]} */
  const without = [
    { run: 1, video: 'a', home: base(5e6), play: base(8e6) },
    { run: 2, video: 'b', home: base(5e6), play: base(8e6) },
  ];
  /** @type {import('../lib/runner.js').RunResult[]} */
  const withv = [
    { run: 1, video: 'a', home: base(7e6), play: base(10e6) },
    { run: 2, video: 'b', home: base(6e6), play: base(9e6) },
  ];
  const cost = pairedCost(without, withv);
  assert.equal(cost.n, 2);
  // home mem diffs: +2MB, +1MB -> median 1.5
  assert.equal(cost.homeMem, 1.5);
  // play mem diffs: +2MB, +1MB -> median 1.5
  assert.equal(cost.playMem, 1.5);
});

test('phaseMetrics reports mem in MB from last window', () => {
  const m = phaseMetrics([S({ t: 0, jsHeapUsed: 8e6 }), S({ t: 1000, jsHeapUsed: 8e6 })]);
  assert.equal(m.memMB, 8);
});

test('p95 is nearest-rank, null on empty', () => {
  assert.equal(p95([]), null);
  assert.equal(p95([5]), 5);
  // 1..100 sorted: ceil(0.95*100)-1 = 94 -> the 95th value
  assert.equal(p95(Array.from({ length: 100 }, (_, i) => i + 1)), 95);
  // ignores non-finite
  assert.equal(p95([1, 2, null, undefined, NaN, 3]), 3);
});

test('phaseMetrics reports cpu/mem p95 and peak over the phase', () => {
  const m = phaseMetrics([
    S({ t: 0, jsHeapUsed: 5e6 }),
    S({ t: 1000, jsHeapUsed: 9e6, taskDuration: 0.1 }),
    S({ t: 2000, jsHeapUsed: 7e6, taskDuration: 0.2 }),
  ]);
  assert.equal(m.memPeakMB, 9); // max sample
  assert.ok(m.memP95MB >= 7 && m.memP95MB <= 9);
  assert.ok(typeof m.cpuP95 === 'number');
});
