// Extract + parse every PDF in tests/fixtures and tests/fixtures/private (or
// the paths given) and print the resulting events.
//   node tests/debug-pdfs.mjs [file.pdf ...]
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.min.mjs';
import { loadVendor } from './_load.mjs';

const V = loadVendor();
const dir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const workerUrl = new URL('../node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).href;
// private/ is gitignored: real, unanonymized documents stay on this machine.
const pdfsIn = (d) => (existsSync(d) ? readdirSync(d).filter((n) => n.endsWith('.pdf')).map((n) => join(d, n)) : []);
const files = process.argv.length > 2 ? process.argv.slice(2) : pdfsIn(dir).concat(pdfsIn(join(dir, 'private')));

for (const f of files) {
  let text = '';
  try {
    text = await V.BTCExtract.extractPdfText(pdfjs, new Uint8Array(readFileSync(f)), workerUrl);
  } catch (e) {
    console.log('=== ' + basename(f) + ' — EXTRACT ERROR: ' + e.message);
    continue;
  }
  const { events } = V.BTCParser.parseBooking(text, { now: new Date(2026, 7, 31) });
  console.log('=== ' + basename(f) + ' → ' + events.length + ' event(s)');
  console.log(text.split('\n').slice(0, 18).map((l) => '  | ' + l.replace(/\t/g, ' ⇥ ')).join('\n'));
  for (const e of events) {
    console.log('  → ' + e.icon + ' ' + e.type + ' | ' + e.title + ' | ' + e.start.date + ' ' + (e.start.time || '(all-day)') +
      ' → ' + (e.end ? e.end.date + ' ' + (e.end.time || '') : '-') + ' | ' + (e.tz || 'floating') + ' | loc: ' + (e.location || '-'));
    console.log(V.BTCCal.describe(e, {}).split('\n').map((l) => '      ' + l).join('\n'));
  }
  console.log();
}
