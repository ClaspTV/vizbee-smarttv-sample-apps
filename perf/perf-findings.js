// @ts-check
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { buildAnalysisPdf, buildIssuesPdf } from './lib/findings.js';

/**
 * Turn a findings.json into analysis.pdf (by criticality) + issues.pdf (by metric).
 * Usage: node perf-findings.js <dir>   (reads <dir>/findings.json)
 */

/** @param {string} flag @returns {string | undefined} */
function argVal(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function main() {
  const dir = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (!dir) {
    console.error('usage: node perf-findings.js <dir> [--platform Vizio]');
    process.exit(1);
  }
  const fjson = path.join(dir, 'findings.json');
  if (!fs.existsSync(fjson)) {
    console.error(`no findings.json in ${dir}`);
    process.exit(1);
  }
  const platform = argVal('--platform') ?? 'Vizio';
  /** @type {import('./lib/findings.js').Finding[]} */
  const findings = JSON.parse(fs.readFileSync(fjson, 'utf8'));

  fs.writeFileSync(path.join(dir, 'analysis.pdf'), buildAnalysisPdf(findings, platform));
  fs.writeFileSync(path.join(dir, 'issues.pdf'), buildIssuesPdf(findings, platform));
  console.log(`analysis.pdf + issues.pdf written to ${dir} (${findings.length} findings)`);
}

main();
