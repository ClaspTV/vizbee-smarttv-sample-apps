// @ts-check
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mmddyyyy } from './lib/constants.js';

/**
 * Full run into one folder: perf-e2e (numbers + report.pdf), then perf-deep
 * (cpu.pdf + memory.pdf under deep/), then perf-findings if a findings.json
 * was produced. Env is passed through (VIZIO_IP, PERF_RUNS, PERF_*_MS); flags
 * (--platform, --es6, --sender, --cases) are passed to perf-e2e and perf-deep.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));

/** perf-results/all_<platform>_<mmddyyyy>, deduped with -2, -3, ... */
function outFolder() {
  const i = FLAGS.indexOf('--platform');
  const platform = i >= 0 ? FLAGS[i + 1] : 'vizio';
  const base = path.join(HERE, 'perf-results', `all_${platform}_${mmddyyyy()}`);
  let dir = base;
  for (let n = 2; fs.existsSync(dir); n++) dir = `${base}-${n}`;
  return dir;
}

/** @param {string} script @param {string[]} args @param {NodeJS.ProcessEnv} [env] */
function run(script, args, env) {
  const r = spawnSync('node', [path.join(HERE, script), ...args], {
    cwd: HERE,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  if (r.status !== 0) throw new Error(`${script} exited ${r.status}`);
}

/** CLI flags forwarded to the child scripts. */
const FLAGS = process.argv.slice(2);

function main() {
  const outDir = outFolder();
  fs.mkdirSync(outDir, { recursive: true });
  console.log(`=== perf-all -> ${outDir} ===`);

  console.log('\n--- [1/3] e2e (numbers + report.pdf) ---');
  run('perf-e2e.js', FLAGS, { PERF_OUT_DIR: outDir });

  console.log('\n--- [2/3] deep dive (cpu.pdf + memory.pdf) ---');
  run('perf-deep.js', [outDir, ...FLAGS]);

  const findings = path.join(outDir, 'findings.json');
  if (fs.existsSync(findings)) {
    console.log('\n--- [3/3] findings (analysis.pdf + issues.pdf) ---');
    run('perf-findings.js', [outDir]);
  } else {
    console.log('\n--- [3/3] findings skipped (no findings.json; add one and run perf-findings.js) ---');
  }

  console.log(`\nall outputs in ${outDir}`);
}

main();
