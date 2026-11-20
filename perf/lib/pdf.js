// @ts-check
'use strict';

/**
 * Minimal landscape-letter PDF writer: titles, lines, wrapped bullets and
 * tables in Helvetica. No dependencies, so the perf scripts need only Node.
 *
 * @typedef {[string, number]} Column               header, width in points
 * @typedef {string[] | { group: string } | { cells: string[] }} TableRow
 *
 * @typedef {object} PdfDoc
 * @property {() => void} newPage
 * @property {(x: number, s: string, size?: number, bold?: boolean) => void} text
 * @property {(s: string) => void} title            starts a new page
 * @property {(s: string, size?: number) => void} line
 * @property {(s: string, width?: number) => void} para   wraps at `width` characters
 * @property {(n?: number) => void} gap
 * @property {(s: string) => void} heading
 * @property {(cols: Column[], rows: TableRow[]) => void} table
 * @property {() => Buffer} build
 */

/** @returns {PdfDoc} */
export function pdfDoc() {
  const W = 792,
    H = 612,
    M = 32;
  /** @type {string[][]} */
  const pages = [];
  /** @type {string[]} */
  let ops = [];
  let y = 0;
  const esc = (/** @type {unknown} */ s) =>
    String(s)
      .replace(/[^\x20-\x7e]/g, '?')
      .replace(/([\\()])/g, '\\$1');
  /** @type {PdfDoc} */
  const api = {
    newPage() {
      ops = [];
      pages.push(ops);
      y = H - M;
    },
    text(x, s, size = 8.5, bold = false) {
      ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${y} Td (${esc(s)}) Tj ET`);
    },
    title(s) {
      api.newPage();
      y -= 14;
      api.text(M, s, 15, true);
      y -= 20;
    },
    line(s, size = 8.5) {
      if (y < M + 12) api.newPage();
      api.text(M, s, size);
      y -= size + 4;
    },
    para(s, width = 165) {
      const words = s.split(' ');
      let cur = '';
      for (const w of words) {
        if ((cur + ' ' + w).length > width) {
          api.line(cur.trim(), 8);
          cur = '   ';
        }
        cur += ' ' + w;
      }
      api.line(cur.trim(), 8);
      y -= 2;
    },
    gap(n = 8) {
      y -= n;
    },
    heading(s) {
      if (y < M + 90) api.newPage();
      y -= 4;
      api.text(M, s, 10, true);
      y -= 14;
    },
    table(cols, rows) {
      const rowH = 15;
      const wrapCell = (/** @type {string} */ c, /** @type {number} */ w) => {
        const max = Math.max(4, Math.floor((w - 6) / 4.1));
        const out = [''];
        for (const word of String(c).split(' ')) {
          const cur = out[out.length - 1];
          if (cur && (cur + ' ' + word).length > max) out.push(word);
          else out[out.length - 1] = cur ? cur + ' ' + word : word;
        }
        return out;
      };
      /** @param {string[]} cells @param {{ bold?: boolean, fill?: number, group?: boolean }} [opt] */
      const row = (cells, opt = {}) => {
        const wrapped = opt.group ? cells.map((c) => [c]) : cells.map((c, i) => wrapCell(c, cols[i][1]));
        const h = rowH + 10 * (Math.max(...wrapped.map((l) => l.length)) - 1);
        if (y - h < M) {
          api.newPage();
          row(
            cols.map((c) => c[0]),
            { bold: true, fill: 0.88 },
          );
        }
        if (opt.fill) ops.push(`${opt.fill} g ${M} ${y - h} ${W - 2 * M} ${h} re f 0 g`);
        let x = M + 4;
        const y0 = y;
        wrapped.forEach((ls, i) => {
          ls.forEach((l, j) => {
            y = y0 - 10.5 - 10 * j;
            api.text(x, l, 8, opt.bold);
          });
          x += cols[i][1];
        });
        y = y0 - h;
        ops.push(`0.75 G 0.5 w ${M} ${y} m ${W - M} ${y} l S 0 G`);
      };
      const header = () =>
        row(
          cols.map((c) => c[0]),
          { bold: true, fill: 0.88 },
        );
      header();
      for (const r of rows) {
        if ('group' in r) {
          if (y - 2 * rowH < M) {
            api.newPage();
            header();
          }
          const cells = cols.map(() => '');
          cells[0] = r.group;
          row(cells, { bold: true, fill: 0.95, group: true });
        } else row('cells' in r ? r.cells : r);
      }
      y -= 8;
    },
    build() {
      /** @type {(string | null)[]} */
      const objs = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        null,
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
      ];
      /** @type {string[]} */
      const kids = [];
      pages.forEach((p, i) => {
        p.push(`BT /F1 8 Tf ${W - M - 30} ${M / 2} Td (${i + 1} / ${pages.length}) Tj ET`);
        const content = p.join('\n');
        const no = objs.length + 1;
        kids.push(`${no} 0 R`);
        objs.push(
          `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${no + 1} 0 R >>`,
        );
        objs.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
      });
      objs[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`;
      let out = '%PDF-1.4\n';
      /** @type {number[]} */
      const offs = [];
      objs.forEach((o, i) => {
        offs.push(Buffer.byteLength(out));
        out += `${i + 1} 0 obj\n${o}\nendobj\n`;
      });
      const xref = Buffer.byteLength(out);
      out +=
        `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` +
        offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
      out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
      return Buffer.from(out, 'latin1');
    },
  };
  return api;
}
