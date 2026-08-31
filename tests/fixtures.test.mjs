// Real-world fixture tests — booking copies from ~/Downloads/booking-ex
// (names anonymized).   node tests/fixtures.test.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const parserSrc = readFileSync(new URL('../public/vendor/parser.js', import.meta.url), 'utf8');
const { parseBooking } = new Function(parserSrc + '; return BTCParser;')();
const NOW = new Date(2026, 7, 31);
const fx = (name) => readFileSync(new URL('../tests/fixtures/' + name, import.meta.url), 'utf8');

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log('  ok  ' + name);
  } catch (e) {
    failures++;
    console.error('FAIL  ' + name + '\n      ' + e.message);
  }
}

const parse = (name, opts = {}) => parseBooking(fx(name), { now: NOW, ...opts }).events;

check('2flights.txt — VietJet round trip, route + code + both legs', () => {
  const ev = parse('2flights.txt');
  assert.equal(ev.length, 2, JSON.stringify(ev, null, 1));
  const [a, b] = ev;
  assert.match(a.title, /VJ327/);
  assert.match(a.title, /SGN → PQC/);
  assert.equal(a.start.date, '2026-11-18');
  assert.equal(a.start.time, '12:35');
  assert.equal(a.end.time, '13:35');
  assert.match(b.title, /VJ326/);
  assert.match(b.title, /PQC → SGN/);
  assert.equal(b.start.date, '2026-11-23');
  assert.equal(b.start.time, '14:10');
  assert.equal(b.end.time, '15:10');
});

check('2flights-nodetails.txt — tabular, no year, two same-day flights', () => {
  const ev = parse('2flights-nodetails.txt');
  assert.equal(ev.length, 2, JSON.stringify(ev, null, 1));
  const [a, b] = ev;
  assert.match(a.title, /GF44|GF ?44/);
  assert.match(a.title, /IST → BAH/);
  assert.equal(a.start.date, '2027-07-10'); // Jul 10 already passed -> next year
  assert.equal(a.start.time, '16:05');
  assert.equal(a.end.time, '20:15');
  assert.match(b.title, /GF165|GF ?165/);
  assert.equal(b.start.time, '23:30');
  assert.equal(b.end.date, '2027-07-11'); // overnight arrival
  assert.equal(b.end.time, '12:20');
});

check('2flights2.txt — itinerary table, times on own lines, next-day return', () => {
  const ev = parse('2flights2.txt');
  assert.equal(ev.length, 2, JSON.stringify(ev, null, 1));
  const [a, b] = ev;
  assert.match(a.title, /TK209/);
  assert.match(a.title, /SIN → OTP/);
  assert.equal(a.start.date, '2026-07-14');
  assert.equal(a.start.time, '10:25');
  assert.equal(a.end.time, '20:15');
  assert.match(b.title, /TK1044/);
  assert.match(b.title, /OTP → SIN/);
  assert.equal(b.start.date, '2026-09-30');
  assert.equal(b.start.time, '09:30');
  assert.equal(b.end.date, '2026-10-01'); // "Next day"
  assert.equal(b.end.time, '08:45');
});

check('flight.txt — AirAsia domestic leg', () => {
  const ev = parse('flight.txt');
  assert.equal(ev.length, 1, JSON.stringify(ev, null, 1));
  const a = ev[0];
  assert.match(a.title, /FD638/);
  assert.match(a.title, /DMK → DAD/);
  assert.equal(a.start.date, '2027-01-28');
  assert.equal(a.start.time, '16:40');
  assert.equal(a.end.time, '18:20');
});

check('booking-agoda.txt — keyword header, dates+checkout on one line', () => {
  const ev = parse('booking-agoda.txt');
  assert.equal(ev.length, 1, JSON.stringify(ev, null, 1));
  const a = ev[0];
  assert.equal(a.type, 'hotel');
  assert.match(a.title, /Kin Hotel Thi Sach/i);
  assert.equal(a.start.date, '2026-11-23');
  assert.equal(a.end.date, '2026-11-25');
});

check('booking-hotel.txt — stacked check-in/out lines with (after/before) times', () => {
  const ev = parse('booking-hotel.txt');
  assert.equal(ev.length, 1, JSON.stringify(ev, null, 1));
  const a = ev[0];
  assert.equal(a.type, 'hotel');
  assert.match(a.title, /Oxford Hotel/i);
  assert.equal(a.start.date, '2026-07-10');
  assert.equal(a.start.time, '14:00');
  assert.equal(a.end.date, '2026-07-14');
  assert.equal(a.end.time, '12:00');
  assert.match(a.location, /Queen Street/);
});

check('booking-ticket.txt — show ticket with label layout', () => {
  const ev = parse('booking-ticket.txt');
  assert.equal(ev.length, 1, JSON.stringify(ev, null, 1));
  const a = ev[0];
  assert.equal(a.start.date, '2026-11-17');
  assert.equal(a.start.time, '18:00');
  assert.equal(a.end.time, '18:30'); // default duration
  assert.match(a.title, /A O SHOW/);
  assert.match(a.location, /Saigon Opera House/);
});

console.log(failures ? failures + ' failing' : 'all real-fixture tests pass');
process.exit(failures ? 1 : 0);
