// @ts-check
'use strict';

import { VizioDevice } from './lib/device/vizio.js';
import { sampleFor, cpuPercent, lastWindowAvg } from './lib/metrics.js';

/**
 * Smoke test: attach to a running Vizio app, sample CPU + memory for a short
 * window, and print a summary. Validates the CDP capture path before the full
 * harness. Reads the already-deployed build; no build/deploy here.
 *
 * Env: VIZIO_IP (default 10.0.0.141), PERF_SMOKE_MS (default 20000).
 */
const IP = process.env.VIZIO_IP ?? '10.0.0.141';
const DURATION_MS = Number(process.env.PERF_SMOKE_MS ?? 20000);
const INTERVAL_MS = 5000;

async function main() {
  const dev = new VizioDevice(IP);

  if (!(await dev.reachable())) {
    console.error(`Vizio not reachable at ${IP}:9555.`);
    console.error('The debug port is only up while an app page runs — open the app on the TV, then retry.');
    process.exit(2);
  }

  const page = await dev.pageTarget();
  console.log(`attached: ${page?.title ?? '?'} — ${page?.url ?? '?'}`);
  await dev.attach();
  const cdp = dev._cdp();

  console.log(`sampling ${DURATION_MS / 1000}s @ ${INTERVAL_MS / 1000}s ...`);
  const samples = await sampleFor(cdp, DURATION_MS, INTERVAL_MS, (s) => {
    console.log(
      `  heap=${(s.jsHeapUsed / 1e6).toFixed(1)}MB nodes=${s.nodes} listeners=${s.listeners} task=${s.taskDuration.toFixed(2)}s`,
    );
  });

  /** @type {number[]} */
  const cpus = [];
  for (let i = 1; i < samples.length; i++) cpus.push(cpuPercent(samples[i - 1], samples[i]));
  const avgCpu = cpus.length ? cpus.reduce((a, b) => a + b, 0) / cpus.length : 0;
  const memAvg = lastWindowAvg(samples, (s) => s.jsHeapUsed, DURATION_MS);

  console.log('--- smoke summary ---');
  console.log(`samples:       ${samples.length}`);
  console.log(`avg CPU:       ${avgCpu.toFixed(2)}% (main-thread)`);
  console.log(`mem (avg):     ${(memAvg / 1e6).toFixed(1)} MB`);
  dev.close();
}

main().catch((e) => {
  console.error('smoke failed:', e?.message ?? e);
  process.exit(1);
});
