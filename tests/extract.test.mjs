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
const { loadVendor } = await import('./_load.mjs');
const V = loadVendor();
const { extractPdfText } = V.BTCExtract;
const { parseBooking } = V.BTCParser;

const bytes = new Uint8Array(readFileSync(here('fixtures/booking.pdf')));
const workerUrl = new URL('../node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).href;
const text = await extractPdfText(pdfjs, bytes, workerUrl);

console.log('--- extracted text ---\n' + text + '\n----------------------');

assert.match(text, /Grand Hotel Plaza/);
assert.match(text, /Check-in: Fri, Sep 4, 2026 \(from 15:00\)/);
assert.match(text, /Check-out: Sun, Sep 6, 2026/);
assert.match(text, /^Bucuresti Nord\tPiatra Neamt$/m, 'wide gaps between cells become tabs');

const { events } = parseBooking(text, { now: new Date(2026, 7, 31) });
assert.equal(events.length, 1, 'one hotel event expected, got ' + JSON.stringify(events));
const ev = events[0];
assert.equal(ev.type, 'hotel');
assert.equal(ev.start.date, '2026-09-04');
assert.equal(ev.allDay, true);
assert.equal(ev.meta.checkIn, '15:00');
assert.equal(ev.end.date, '2026-09-06');
assert.match(ev.title, /Grand Hotel Plaza|Hotel/i);

// Safari cannot iterate a ReadableStream with "for await"; extract.js must fill
// the gap or every PDF fails there.
const key = Symbol.asyncIterator;
const native = Object.getOwnPropertyDescriptor(ReadableStream.prototype, key);
delete ReadableStream.prototype[key];
try {
  assert.equal(ReadableStream.prototype[key], undefined, 'the native iterator is gone for this check');
  const safari = loadVendor();
  assert.equal(typeof ReadableStream.prototype[key], 'function', 'extract.js installs the iterator');
  const again = await safari.BTCExtract.extractPdfText(pdfjs, new Uint8Array(readFileSync(here('fixtures/booking.pdf'))), workerUrl);
  assert.equal(again, text, 'same text without the native stream iterator');
  // An early exit from the loop releases the stream.
  const stream = new ReadableStream({ start(c) { c.enqueue(1); c.enqueue(2); c.close(); } });
  for await (const v of stream) { assert.equal(v, 1); break; }
  assert.equal(stream.locked, false);
} finally {
  Object.defineProperty(ReadableStream.prototype, key, native);
}

console.log('PDF extraction test passes — event:', ev.type, ev.start.date, '→', ev.end.date, '|', ev.title);
