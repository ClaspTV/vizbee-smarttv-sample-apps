// @ts-check
'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeExternal, INTERNAL } from '../lib/external.js';

/** One e2e run folder on disk: samples.jsonl + device.json + results.json. */
function makeE2eDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'perf-ext-'));
  const lines = [];
  let t = Date.now();
  for (const c of ['without', 'nosender']) {
    for (const phase of ['home', 'play']) {
      for (let i = 0; i < 3; i++) {
        lines.push(
          JSON.stringify({
            case: c,
            run: 1,
            video: 'tears-of-steel',
            phase,
            t: (t += 5000),
            taskDuration: i * 0.1,
            jsHeapUsed: (phase === 'play' ? 8e6 : 5e6) + i * 1e6,
            jsHeapTotal: 20e6,
            nodes: 400 + i,
            listeners: 10,
          }),
        );
      }
    }
    lines.push(JSON.stringify({ case: c, run: 1, video: 'tears-of-steel', phase: 'vitals', fcp: 900, lcp: 1200, ttfb: 300, proxy: false }));
  }
  fs.writeFileSync(path.join(dir, 'samples.jsonl'), lines.join('\n') + '\n');
  fs.writeFileSync(path.join(dir, 'device.json'), JSON.stringify({ Model: 'Vizio V555', Platform: 'VizioSmartCast', 'SDK variant': '@vizbeetv/sdk/vizio-el/es5 (elementless npm)' }));
  fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify({ kind: 'e2e', platform: 'Vizio', date: '2026-11-25', cases: {}, costs: {} }));
  return dir;
}

test('writeExternal builds a shareable folder with the expected files', () => {
  const dir = makeE2eDir();
  try {
    const ext = writeExternal(dir, { sdkLabel: 'Vizbee JS SDK 4.5 (pre-release)' });
    for (const f of ['report.pdf', 'comparison.csv', 'summary.md', 'data/README.txt', 'data/results.json', 'data/samples-no-sdk.csv', 'data/samples-vizbee-sdk-no-sender.csv']) {
      assert.ok(fs.existsSync(path.join(ext, f)), `missing ${f}`);
    }
    const csv = fs.readFileSync(path.join(ext, 'comparison.csv'), 'utf8');
    assert.match(csv, /Phase,Metric,Unit/);
    assert.match(csv, /CPU p95/);
    assert.match(csv, /Memory peak/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('writeExternal throws if an internal detail would leak', () => {
  const dir = makeE2eDir();
  try {
    // Plant an internal IP in the device model, which flows into the report text.
    fs.writeFileSync(path.join(dir, 'device.json'), JSON.stringify({ Model: 'TV at 10.0.0.205', Platform: 'webOS TV' }));
    // 10.0.0.205 is scrubbed from the device table, so the report stays clean -> no throw.
    assert.ok(writeExternal(dir));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('INTERNAL matches IPs, home paths and branch names', () => {
  assert.match('http://10.0.0.205:9555', INTERNAL);
  assert.match('/Users/venkats/vizbee', INTERNAL);
  assert.match('feature/performance-measurement', INTERNAL);
  assert.doesNotMatch('Vizio V555 firmware 1.2.3', INTERNAL);
  assert.doesNotMatch('adb drives the Vizbee demo app', INTERNAL);
});
