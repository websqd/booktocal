// bookingtocal — client-side PDF text extraction. Classic script exposing
// BTCExtract.extractPdfText(pdfjs, data) -> string of reconstructed lines.
// The pdfjs module is passed in (dynamically imported by the page); nothing
// here touches the network — extraction is fully local.

var BTCExtract = (function () {
  'use strict';

  // Reconstruct reading-order lines from pdf.js text items. Items are grouped
  // into rows by baseline y (2pt tolerance) and ordered by x. A normal word gap
  // becomes a space; a gap wider than COLUMN_GAP_EM font sizes is a table
  // column boundary and becomes a TAB, so the parser can tell
  // "București Nord<TAB>Piatra Neamț" (two cells) from one four-word name and
  // can line header cells up with the values under them.
  var COLUMN_GAP_EM = 1.1;

  // workerSrc can be overridden (node tests pass a file:// URL); in the browser
  // the default points at the vendored worker served from /vendor/.
  async function extractPdfText(pdfjs, data, workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = workerSrc || '/vendor/pdf.worker.min.mjs';
    var doc = await pdfjs.getDocument({ data: data }).promise;
    var lines = [];
    for (var p = 1; p <= doc.numPages; p++) {
      var page = await doc.getPage(p);
      var tc = await page.getTextContent();
      var rows = [];
      for (var i = 0; i < tc.items.length; i++) {
        var it = tc.items[i];
        if (!it.str || !it.transform) continue;
        var y = Math.round(it.transform[5] / 2) * 2;
        var row = null;
        for (var r = 0; r < rows.length; r++) {
          if (Math.abs(rows[r].y - y) <= 1) { row = rows[r]; break; }
        }
        if (!row) { row = { y: y, parts: [] }; rows.push(row); }
        var em = it.height || Math.hypot(it.transform[0], it.transform[1]) || 10;
        row.parts.push({ x: it.transform[4], s: it.str, w: it.width || 0, em: em });
      }
      rows.sort(function (a, b) { return b.y - a.y; });
      for (var j = 0; j < rows.length; j++) {
        // pdf.js reports some gaps as whitespace-only items (a " " that is 170pt
        // wide); drop them so every gap is measured between real text.
        var parts = rows[j].parts.filter(function (q) { return q.s.trim(); }).sort(function (a, b) { return a.x - b.x; });
        var line = '';
        for (var k = 0; k < parts.length; k++) {
          if (k > 0) {
            var prev = parts[k - 1];
            var gap = parts[k].x - (prev.x + prev.w);
            var em = Math.min(prev.em, parts[k].em);
            if (gap > COLUMN_GAP_EM * em) {
              line = line.replace(/ +$/, '') + '\t';
            } else if (gap > 1.5 && !/\s$/.test(line) && !/^\s/.test(parts[k].s)) {
              line += ' ';
            }
          }
          line += parts[k].s;
        }
        line = line.replace(/ *\t[ \t]*/g, '\t').replace(/ {2,}/g, ' ').trim();
        if (line) lines.push(line);
      }
    }
    try { await doc.destroy(); } catch (e) {}
    return lines.join('\n');
  }

  return { extractPdfText: extractPdfText };
})();
