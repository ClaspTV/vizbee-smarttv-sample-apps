// @ts-check
'use strict';

import { pdfDoc } from './pdf.js';

/**
 * @typedef {{
 *   id: string,
 *   title: string,
 *   metric: string,
 *   criticality: 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO',
 *   owner?: string,
 *   status?: string,
 *   perRun?: string[],
 *   cause?: string,
 *   risk?: string,
 *   fix?: string
 * }} Finding
 */

const ORDER = /** @type {const} */ (['HIGH', 'MEDIUM', 'LOW', 'INFO']);

/**
 * @param {import('./pdf.js').PdfDoc} doc
 * @param {Finding} f
 */
function renderFinding(doc, f) {
  doc.heading(`[${f.criticality}] ${f.title}`);
  doc.line(`id: ${f.id}    metric: ${f.metric}    owner: ${f.owner ?? '-'}    status: ${f.status ?? 'open'}`, 8);
  if (f.perRun && f.perRun.length) doc.para('per-run: ' + f.perRun.join('   |   '), 160);
  if (f.cause) doc.para('cause: ' + f.cause, 160);
  if (f.risk) doc.para('risk: ' + f.risk, 160);
  if (f.fix) doc.para('fix: ' + f.fix, 160);
  doc.gap(6);
}

/**
 * Findings grouped by criticality.
 * @param {Finding[]} findings
 * @param {string} platform
 * @returns {Buffer}
 */
export function buildAnalysisPdf(findings, platform) {
  const doc = pdfDoc();
  doc.title(`Vizbee SDK perf - findings by criticality (${platform})`);
  if (!findings.length) doc.line('No findings.');
  for (const crit of ORDER) {
    const group = findings.filter((f) => f.criticality === crit);
    if (!group.length) continue;
    doc.heading(`${crit} (${group.length})`);
    for (const f of group) renderFinding(doc, f);
  }
  return doc.build();
}

/**
 * Findings grouped by metric.
 * @param {Finding[]} findings
 * @param {string} platform
 * @returns {Buffer}
 */
export function buildIssuesPdf(findings, platform) {
  const doc = pdfDoc();
  doc.title(`Vizbee SDK perf - findings by metric (${platform})`);
  if (!findings.length) doc.line('No findings.');
  const metrics = [...new Set(findings.map((f) => f.metric))].sort();
  for (const m of metrics) {
    doc.heading(m);
    for (const f of findings.filter((x) => x.metric === m)) renderFinding(doc, f);
  }
  return doc.build();
}
