// @ts-check
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { buildAnalysisPdf, buildIssuesPdf } from './findings.js';
import { presentCases, costDefs, capability, disconnectView } from './long-report.js';

/**
 * Derive a data-grounded findings draft from a long run's measured costs, so the
 * long run can emit analysis.pdf (by criticality) + issues.pdf (by metric)
 * without a hand-written findings.json. Each finding is one add-on cost (Vizbee
 * cost, Mux cost, ... whatever costDefs yields) for one metric, graded against
 * per-metric thresholds. The text is observational: it states the measured
 * difference and points at the deep dive to localise it - it never invents a
 * source line. A hand-written findings.json (if present) overrides the draft.
 *
 * @typedef {import('./findings.js').Finding} Finding
 * @typedef {import('./long.js').CaseResult} CaseResult
 * @typedef {Record<string, CaseResult>} LongResults
 */

/** @param {(number | null | undefined)[]} xs @returns {number | null} */
function med(xs) {
  const v = /** @type {number[]} */ (xs.filter((x) => typeof x === 'number' && isFinite(x))).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** @param {import('./long.js').PlayResult[]} plays @returns {number | null} */
function droppedPctFor(plays) {
  const ok = plays.filter((p) => typeof p.totalFrames === 'number' && p.totalFrames > 0);
  if (!ok.length) return null;
  return (
    (100 * ok.reduce((a, p) => a + (p.droppedFrames || 0), 0)) /
    ok.reduce((a, p) => a + /** @type {number} */ (p.totalFrames), 0)
  );
}

/**
 * @typedef {{
 *   key: string, name: string, unit: string, phase: string,
 *   get: (c: CaseResult) => number | null, avail: 'cpu' | 'mem' | 'frames' | 'any',
 *   hi: number, mid: number, lo: number, dec: number
 * }} MetricDef
 */

/** @type {MetricDef[]} */
const METRICS = [
  { key: 'cpu-play', name: 'CPU', unit: '%', phase: 'playback', get: (c) => med(c.plays.map((p) => p.play.cpu)), avail: 'cpu', hi: 5, mid: 2, lo: 0.5, dec: 2 },
  { key: 'mem-play', name: 'Memory', unit: 'MB', phase: 'playback', get: (c) => med(c.plays.map((p) => p.play.usedEndMB)), avail: 'mem', hi: 20, mid: 8, lo: 2, dec: 1 },
  { key: 'slope-play', name: 'Heap slope', unit: 'MB/min', phase: 'playback', get: (c) => med(c.plays.map((p) => p.play.slopeMBMin)), avail: 'mem', hi: 0.5, mid: 0.2, lo: 0.05, dec: 2 },
  { key: 'vst', name: 'VST', unit: 's', phase: 'playback', get: (c) => med(c.plays.map((p) => p.vstSecs)), avail: 'any', hi: 1, mid: 0.3, lo: 0.1, dec: 2 },
  { key: 'frames', name: 'Dropped frames', unit: '%', phase: 'playback', get: (c) => droppedPctFor(c.plays), avail: 'frames', hi: 1, mid: 0.3, lo: 0.1, dec: 2 },
  { key: 'cpu-home', name: 'CPU', unit: '%', phase: 'home idle', get: (c) => (c.home ? c.home.cpu : null), avail: 'cpu', hi: 3, mid: 1, lo: 0.3, dec: 2 },
  { key: 'mem-home', name: 'Memory', unit: 'MB', phase: 'home idle', get: (c) => (c.home ? c.home.usedEndMB : null), avail: 'mem', hi: 15, mid: 6, lo: 2, dec: 1 },
];

/** @type {Record<string, string>} */
const RISK = {
  CPU: 'steady main-thread CPU paid through the phase; costlier on low-end panels',
  Memory: 'higher retained heap held for the whole session',
  'Heap slope': 'retained heap keeps growing during playback; it accumulates over a long session (possible leak)',
  VST: 'slower perceived start - a user-visible delay before the first frame',
  'Dropped frames': 'visible playback stutter',
};

/** Grade a cost = add-on - baseline. Only a positive cost (the add-on is worse:
 * more CPU/memory/heap-growth, slower start, more dropped frames) is a concern; a
 * negative or zero cost means the add-on is as good or better, so it is not graded.
 * @param {MetricDef} m @param {number} cost @returns {Finding['criticality']} */
function grade(m, cost) {
  if (cost >= m.hi) return 'HIGH';
  if (cost >= m.mid) return 'MEDIUM';
  if (cost >= m.lo) return 'LOW';
  return 'INFO';
}

/** @param {string} label @returns {string} */
function ownerOf(label) {
  if (label.startsWith('Mux')) return 'mux';
  if (label.startsWith('Sender')) return 'sender';
  return 'sdk';
}

/** @param {CaseResult} c @returns {string} */
function memoryProgression(c) {
  const list = c.plays.map((p) => (typeof p.play.usedEndMB === 'number' ? p.play.usedEndMB.toFixed(1) : '-')).join(' -> ');
  return `memory by playback (MB): ${list}`;
}

/**
 * @param {any} meta
 * @param {LongResults} r
 * @returns {Finding[]}
 */
export function deriveLongFindings(meta, r) {
  const cases = presentCases(r);
  const costs = costDefs(cases);
  const labelOf = (/** @type {string} */ k) => cases.find(([x]) => x === k)?.[1] ?? k;
  const cap = capability(r);
  const playMin = Math.round((meta.playSecs || 0) / 60);
  /** @type {Finding[]} */
  const findings = [];

  for (const def of costs) {
    const owner = ownerOf(def.label);
    let any = false;
    for (const m of METRICS) {
      if (m.avail === 'cpu' && !cap.cpuAvailable) continue;
      if (m.avail === 'mem' && !cap.memReliable) continue;
      if (m.avail === 'frames' && !cap.framesAvailable) continue;
      const a = m.get(r[def.a]);
      const b = m.get(r[def.b]);
      if (a === null || b === null) continue;
      const cost = a - b;
      const crit = grade(m, cost);
      if (crit === 'INFO') continue;
      any = true;
      const sign = cost >= 0 ? '+' : '';
      const deep = m.name === 'Memory' || m.name === 'Heap slope' ? 'memory' : 'cpu';
      findings.push({
        id: `VZB-LONG-${owner}-${m.key}`.toUpperCase(),
        title: `${def.label}: ${sign}${cost.toFixed(m.dec)} ${m.unit} ${m.name} (${m.phase})`,
        metric: m.name,
        criticality: crit,
        owner,
        status: 'auto-derived - confirm',
        perRun: [
          `${labelOf(def.a)} ${a.toFixed(m.dec)}${m.unit}`,
          `${labelOf(def.b)} ${b.toFixed(m.dec)}${m.unit}`,
          `cost ${sign}${cost.toFixed(m.dec)}${m.unit}`,
          ...(m.name === 'Memory' ? [memoryProgression(r[def.a])] : []),
        ],
        cause: `Measured ${m.name} difference between "${labelOf(def.a)}" and "${labelOf(def.b)}" over ${meta.plays} x ${playMin}-min playbacks (${m.phase}); see report.pdf. Not yet localised to a code path.`,
        risk: RISK[m.name] || '-',
        fix: `Confirm against the per-playback table in report.pdf; if consistent, run perf-deep.js for a ${deep} profile (deep/${deep}.pdf) to localise, then file against ${owner}.`,
      });
    }
    if (!any) {
      findings.push({
        id: `VZB-LONG-${owner}-OK`.toUpperCase(),
        title: `${def.label}: no metric exceeded the review thresholds`,
        metric: 'Summary',
        criticality: 'INFO',
        owner,
        status: 'auto-derived',
        cause: `Over ${meta.plays} x ${playMin}-min playbacks, ${def.label} stayed under the review thresholds for CPU, memory, heap slope, VST and dropped frames.`,
        risk: 'None observed at these thresholds.',
        fix: '-',
      });
    }
  }

  const dv = disconnectView(r);
  if (dv && !dv.confirmed) {
    findings.push({
      id: 'VZB-LONG-SDK-DISCONNECT-UNCONFIRMED',
      title: 'Sender disconnect not confirmed - return-to-normal unverified',
      metric: 'Summary',
      criticality: 'LOW',
      owner: 'sdk',
      status: 'auto-derived - confirm',
      cause: 'The phone still showed connected after the disconnect attempt, so the return-to-normal read may be invalid.',
      risk: 'cannot conclude whether the sender cost is released',
      fix: 'Re-run the sender case and confirm the phone disconnects (phone cast state).',
    });
  } else if (dv && dv.confirmed) {
    const cap = capability(r);
    const cleanRef = dv.ref && dv.refKey === 'nosender';
    /** @type {Array<{ name: string, metric: string, unit: string, get: (p: any) => number | null, avail: boolean, hi: number, mid: number, lo: number, dec: number }>} */
    const checks = [
      { name: 'CPU', metric: 'CPU', unit: '%', get: (p) => p.cpu, avail: cap.cpuAvailable, hi: 2, mid: 1, lo: 0.5, dec: 2 },
      { name: 'Memory', metric: 'Memory', unit: 'MB', get: (p) => p.usedEndMB, avail: cap.memReliable, hi: 15, mid: 6, lo: 2, dec: 1 },
    ];
    let elevated = false;
    if (cleanRef && dv.ref) {
      for (const ck of checks) {
        if (!ck.avail) continue;
        const di = ck.get(dv.disc);
        const rf = ck.get(dv.ref);
        if (di === null || rf === null) continue;
        const resid = di - rf;
        const crit = resid >= ck.hi ? 'HIGH' : resid >= ck.mid ? 'MEDIUM' : resid >= ck.lo ? 'LOW' : 'INFO';
        if (crit === 'INFO') continue;
        elevated = true;
        findings.push({
          id: `VZB-LONG-SDK-DISCONNECT-${ck.name}`.toUpperCase(),
          title: `${ck.name} did not return to the no-sender level after sender disconnect (+${resid.toFixed(ck.dec)} ${ck.unit})`,
          metric: ck.metric,
          criticality: crit,
          owner: 'sdk',
          status: 'auto-derived - confirm',
          perRun: [
            `with sender ${ck.get(dv.withSender)?.toFixed(ck.dec)}${ck.unit}`,
            `after disconnect ${di.toFixed(ck.dec)}${ck.unit}`,
            `${dv.refLabel} ${rf.toFixed(ck.dec)}${ck.unit}`,
            `residual +${resid.toFixed(ck.dec)}${ck.unit}`,
          ],
          cause: `After the sender disconnected (confirmed) and a forced GC, home-idle ${ck.name} stayed +${resid.toFixed(ck.dec)}${ck.unit} above the ${dv.refLabel} level - resources acquired for the sender look not fully released.`,
          risk: ck.name === 'Memory'
            ? 'retained memory after a sender session; accumulates across connect/disconnect cycles'
            : 'residual idle CPU after a sender session; paid even once the phone is gone',
          fix: `Confirm the disconnect was clean (see the disconnect section in report.pdf); if consistent, check the sender path releases its listeners / clients on disconnect, then profile with perf-deep.js.`,
        });
      }
    }
    if (cleanRef && !elevated) {
      findings.push({
        id: 'VZB-LONG-SDK-DISCONNECT-OK',
        title: 'CPU and memory returned to the no-sender level after sender disconnect',
        metric: 'Summary',
        criticality: 'INFO',
        owner: 'sdk',
        status: 'auto-derived',
        cause: `After disconnect (confirmed) + forced GC, home-idle CPU/memory were within tolerance of the ${dv.refLabel} level.`,
        risk: 'None observed - the sender cost is released on disconnect.',
        fix: '-',
      });
    } else if (!cleanRef) {
      const released = [];
      if (cap.cpuAvailable) released.push(`CPU ${(dv.disc.cpu - dv.withSender.cpu).toFixed(2)}%`);
      if (cap.memReliable) released.push(`Memory ${(dv.disc.usedEndMB - dv.withSender.usedEndMB).toFixed(1)} MB`);
      findings.push({
        id: 'VZB-LONG-SDK-DISCONNECT-NOREF',
        title: 'Sender disconnect measured, but no clean no-sender reference to verify return-to-normal',
        metric: 'Summary',
        criticality: 'INFO',
        owner: 'sdk',
        status: 'auto-derived - confirm',
        perRun: released.length ? [`released vs with-sender: ${released.join('; ')}`] : [],
        cause: `The sender disconnected (confirmed), but this run has no "With Vizbee (no sender)" case; the residual vs ${dv.refLabel || 'baseline'} would include the SDK's own idle cost, not just a sender leak.`,
        risk: 'cannot cleanly attribute any residual to the sender without the no-sender case',
        fix: 'Re-run including the nosender case (plain --sender run, or add nosender to --cases) for a clean return-to-normal check.',
      });
    }
  }
  return findings;
}

/**
 * Write findings.auto.json (the data-grounded draft) and render analysis.pdf +
 * issues.pdf. A hand-written findings.json in the dir overrides the draft.
 * @param {string} outDir
 * @param {any} meta
 * @param {LongResults} r
 * @returns {{ count: number, source: string }}
 */
export function writeLongFindings(outDir, meta, r) {
  const platform = (meta.device && meta.device.Model) || meta.platform || 'smart TV';
  const auto = deriveLongFindings(meta, r);
  fs.writeFileSync(path.join(outDir, 'findings.auto.json'), JSON.stringify(auto, null, 2));
  const handPath = path.join(outDir, 'findings.json');
  const hand = fs.existsSync(handPath);
  /** @type {Finding[]} */
  const findings = hand ? JSON.parse(fs.readFileSync(handPath, 'utf8')) : auto;
  fs.writeFileSync(path.join(outDir, 'analysis.pdf'), buildAnalysisPdf(findings, platform));
  fs.writeFileSync(path.join(outDir, 'issues.pdf'), buildIssuesPdf(findings, platform));
  return { count: findings.length, source: hand ? 'findings.json' : 'findings.auto.json' };
}
