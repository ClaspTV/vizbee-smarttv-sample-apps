// @ts-check
'use strict';

import { pdfDoc } from './pdf.js';

/**
 * Deep-dive PDF: top frames by self cost (CPU ms or allocated bytes).
 * @param {string} title
 * @param {import('./profile.js').ProfRow[]} rows
 * @param {(v: number) => string} fmt
 * @param {string} platform
 * @param {number} [topN]
 * @returns {Buffer}
 */
export function buildDeepPdf(title, rows, fmt, platform, topN = 40) {
  const doc = pdfDoc();
  doc.title(`${title} - ${platform}`);
  doc.line(`top ${Math.min(topN, rows.length)} of ${rows.length} frames by self cost`, 9);
  doc.gap(4);
  /** @type {import('./pdf.js').Column[]} */
  const cols = [
    ['#', 30],
    ['Function', 260],
    ['Source', 230],
    ['Self', 90],
  ];
  /** @type {import('./pdf.js').TableRow[]} */
  const trows = rows
    .slice(0, topN)
    .map((r, i) => [String(i + 1), r.fn, `${r.url}:${r.line}`, fmt(r.value)]);
  doc.table(cols, trows);
  return doc.build();
}
