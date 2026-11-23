// Print what the parser makes of a text file (default: a flight fixture).
//   node tests/debug-flight.mjs [path/to/text.txt]
import { readFileSync } from 'node:fs';
import { loadVendor } from './_load.mjs';

const V = loadVendor();
const path = process.argv[2] || new URL('../tests/fixtures/2flights-nodetails.txt', import.meta.url);
const ev = V.BTCParser.parseBooking(readFileSync(path, 'utf8'), { now: new Date(2026, 7, 31) }).events;
for (const e of ev) {
  console.log(V.BTCCal.titleOf(e, {}) + '\n  ' + JSON.stringify({ start: e.start, end: e.end, tz: e.tz, tzEnd: e.tzEnd, flags: e.flags }));
  console.log(V.BTCCal.describe(e, {}).split('\n').map((l) => '  ' + l).join('\n'));
}
