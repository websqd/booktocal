// Extract + parse every real PDF fixture and print the resulting events.
import { readFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.min.mjs';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const extractSrc = readFileSync(join(dir, '..', '..', 'public/vendor/extract.js'), 'utf8');
const { extractPdfText } = new Function(extractSrc + '; return BTCExtract;')();
const parserSrc = readFileSync(join(dir, '..', '..', 'public/vendor/parser.js'), 'utf8');
const { parseBooking } = new Function(parserSrc + '; return BTCParser;')();

const workerUrl = new URL('../node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).href;

for (const f of readdirSync(dir).filter((n) => n.endsWith('.pdf'))) {
  const bytes = new Uint8Array(readFileSync(join(dir, f)));
  let text = '';
  try {
    text = await extractPdfText(pdfjs, bytes, workerUrl);
  } catch (e) {
    console.log('=== ' + f + ' — EXTRACT ERROR: ' + e.message);
    continue;
  }
  const { events } = parseBooking(text, { now: new Date(2026, 7, 31) });
  console.log('=== ' + f + ' → ' + events.length + ' event(s)');
  console.log(text.split('\n').slice(0, 18).map((l) => '  | ' + l).join('\n'));
  for (const e of events) {
    console.log('  → ' + e.type + ' | ' + e.title + ' | ' + e.start.date + ' ' + (e.start.time || '(all-day)' ) +
      ' → ' + (e.end ? e.end.date + ' ' + (e.end.time || '') : '-') + ' | loc: ' + (e.location || '-'));
  }
  console.log();
}
