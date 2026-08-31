import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../public/vendor/parser.js', import.meta.url), 'utf8');
const { parseBooking } = new Function(src + '; return BTCParser;')();
const text = readFileSync(new URL('../tests/fixtures/2flights-nodetails.txt', import.meta.url), 'utf8');
const ev = parseBooking(text, { now: new Date(2026, 7, 31) }).events;
console.log(JSON.stringify(ev.map(e => ({ title: e.title, start: e.start, end: e.end })), null, 1));

const RE = /\b(?!(?:AM|PM)\b)([A-Z][A-Z0-9]|[0-9][A-Z])\s?(\d{2,4}[A-Z]?)\b/;
for (const [i, l] of text.split('\n').entries()) {
  const m = l.match(RE);
  console.log(i, JSON.stringify(l.slice(0, 50)), '→', m && (m[1] + '|' + m[2]));
}
