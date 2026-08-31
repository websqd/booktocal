// bookingtocal — client-side PDF text extraction. Classic script exposing
// BTCExtract.extractPdfText(pdfjs, data) -> string of reconstructed lines.
// The pdfjs module is passed in (dynamically imported by the page); nothing
// here touches the network — extraction is fully local.

var BTCExtract = (function () {
  'use strict';

  // Reconstruct reading-order lines from pdf.js text items. Group items into
  // rows by baseline y (2pt tolerance), order within a row by x, and insert a
  // space when the gap between items is wider than the previous item's width.
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
        row.parts.push({ x: it.transform[4], s: it.str, w: it.width || 0 });
      }
      rows.sort(function (a, b) { return b.y - a.y; });
      for (var j = 0; j < rows.length; j++) {
        var parts = rows[j].parts.slice().sort(function (a, b) { return a.x - b.x; });
        var line = '';
        for (var k = 0; k < parts.length; k++) {
          if (k > 0) {
            var prevEnd = parts[k - 1].x + parts[k - 1].w;
            if (parts[k].x - prevEnd > 1.5 && !/\s$/.test(line) && !/^\s/.test(parts[k].s)) line += ' ';
          }
          line += parts[k].s;
        }
        line = line.replace(/\s+/g, ' ').trim();
        if (line) lines.push(line);
      }
    }
    try { await doc.destroy(); } catch (e) {}
    return lines.join('\n');
  }

  return { extractPdfText: extractPdfText };
})();
