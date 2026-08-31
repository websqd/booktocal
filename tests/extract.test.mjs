// PDF extraction test: generates a fixture PDF, extracts text with the vendored
// pdf.js (node-compatible legacy build), parses it, asserts the booking event.
//   node tests/extract.test.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = (p) => join(dirname(fileURLToPath(import.meta.url)), p);

// Regenerate the fixture so the test is self-contained.
execFileSync(process.execPath, [here('make-sample-pdf.mjs')]);

const pdfjs = await import('pdfjs-dist/legacy/build/pdf.min.mjs');
const extractSrc = readFileSync(here('../public/vendor/extract.js'), 'utf8');
const { extractPdfText } = new Function(extractSrc + '; return BTCExtract;')();
const parserSrc = readFileSync(here('../public/vendor/parser.js'), 'utf8');
const { parseBooking } = new Function(parserSrc + '; return BTCParser;')();

const bytes = new Uint8Array(readFileSync(here('fixtures/booking.pdf')));
const workerUrl = new URL('../node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).href;
const text = await extractPdfText(pdfjs, bytes, workerUrl);

console.log('--- extracted text ---\n' + text + '\n----------------------');

assert.match(text, /Grand Hotel Plaza/);
assert.match(text, /Check-in: Fri, Sep 4, 2026 \(from 15:00\)/);
assert.match(text, /Check-out: Sun, Sep 6, 2026/);

const { events } = parseBooking(text, { now: new Date(2026, 7, 31) });
assert.equal(events.length, 1, 'one hotel event expected, got ' + JSON.stringify(events));
const ev = events[0];
assert.equal(ev.type, 'hotel');
assert.equal(ev.start.date, '2026-09-04');
assert.equal(ev.start.time, '15:00');
assert.equal(ev.end.date, '2026-09-06');
assert.match(ev.title, /Grand Hotel Plaza|Hotel/i);

console.log('PDF extraction test passes — event:', ev.type, ev.start.date, ev.start.time, '→', ev.end.date, '|', ev.title);
