// Fixture tests for public/vendor/parser.js — plain node, no framework.
//   node tests/parse.test.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

// parser.js is a classic script (loaded by the browser via script-src 'self');
// eval it here the same way and grab the global it defines.
const parserSrc = readFileSync(new URL('../public/vendor/parser.js', import.meta.url), 'utf8');
const { parseBooking } = new Function(parserSrc + '; return BTCParser;')();

const NOW = new Date(2026, 7, 31); // Sun Aug 31 2026, fixed for determinism
const DEF = { now: NOW };
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

// 1. Hotel: check-in with time, check-out without -> end falls back to default time
check('hotel stay parses with default end time', () => {
  const { events } = parseBooking(
    'Booking confirmation\nHotel Europa Rome\nCheck-in: Fri, Sep 4, 2026 (from 14:00)\nCheck-out: Sun, Sep 6, 2026\nConfirmation number: 1234567890',
    DEF
  );
  assert.equal(events.length, 1);
  const ev = events[0];
  assert.equal(ev.type, 'hotel');
  assert.equal(ev.start.date, '2026-09-04');
  assert.equal(ev.start.time, '14:00');
  assert.equal(ev.end.date, '2026-09-06');
  assert.equal(ev.end.time, null); // ics/export applies default time
  assert.match(ev.title, /Hotel/i);
  assert.equal(ev.confidence, 'high');
});

// 2. Flight with departure + arrival times and route
check('flight parses times, number and route', () => {
  const { events } = parseBooking(
    'Your flight is confirmed\nFlight BA 112\nLondon Heathrow (LHR) → New York JFK\nDeparture: Jul 30, 2026 6:20 PM\nArrival: Jul 30, 2026 9:05 PM (local)',
    DEF
  );
  assert.equal(events.length, 1);
  const ev = events[0];
  assert.equal(ev.type, 'flight');
  assert.equal(ev.start.date, '2026-07-30');
  assert.equal(ev.start.time, '18:20');
  assert.equal(ev.end.time, '21:05');
  assert.match(ev.title, /BA ?112/);
  assert.match(ev.title, /LHR → JFK/);
});

// 3. Generic with explicit time -> default duration 30 min
check('single date+time gets 30 minute duration', () => {
  const { events } = parseBooking('Walking tour of Rome on September 4, 2026 at 10:00 AM', DEF);
  assert.equal(events.length, 1);
  assert.equal(events[0].start.time, '10:00');
  assert.equal(events[0].end.time, '10:30');
});

// 4. Date with no time -> default noon + 30 min
check('date without time defaults to noon', () => {
  const { events } = parseBooking('Car pickup on 04.09.2026', DEF);
  assert.equal(events.length, 1);
  assert.equal(events[0].start.date, '2026-09-04'); // dot = EU day-first
  assert.equal(events[0].start.time, '12:00');
  assert.equal(events[0].end.time, '12:30');
});

// 5. noTimeAllDay setting -> all-day event
check('noTimeAllDay makes all-day events', () => {
  const { events } = parseBooking('Car pickup on 04.09.2026', { ...DEF, noTimeAllDay: true });
  assert.equal(events[0].allDay, true);
  assert.equal(events[0].start.time, null);
});

// 6. US slash format + 12h clock
check('US numeric date and PM time', () => {
  const { events } = parseBooking('Check-in 9/4/2026 3:30 PM', DEF);
  assert.equal(events[0].start.date, '2026-09-04');
  assert.equal(events[0].start.time, '15:30');
});

// 7. Year inference for past-in-current-year dates without a year
check('missing year rolls forward', () => {
  const { events } = parseBooking('Dinner reservation Jan 5 at 7:30 pm', DEF);
  assert.equal(events[0].start.date, '2027-01-05');
});

// 8. Train with two times on one line
check('train same-line dep/arr times', () => {
  const { events } = parseBooking('Eurostar 9208 | Fri, Sep 4, 2026 | London St Pancras → Paris Gare du Nord | Departs 08:13 — Arrives 11:47', DEF);
  assert.equal(events.length, 1);
  const ev = events[0];
  assert.equal(ev.type, 'train');
  assert.equal(ev.start.time, '08:13');
  assert.equal(ev.end.time, '11:47');
});

// 9. Custom default time/duration
check('custom defaults apply', () => {
  const { events } = parseBooking('Museum visit Sep 20, 2026', { ...DEF, defaultTime: '09:00', defaultDurationMin: 90 });
  assert.equal(events[0].start.time, '09:00');
  assert.equal(events[0].end.time, '10:30');
});

// 10. Hotel multi-day all-day when no times at all + noTimeAllDay
check('hotel without times becomes all-day range', () => {
  const { events } = parseBooking(
    'Hotel Belvedere\nCheck-in: 12.09.2026\nCheck-out: 15.09.2026',
    { ...DEF, noTimeAllDay: true }
  );
  assert.equal(events.length, 1);
  assert.equal(events[0].allDay, true);
  assert.equal(events[0].start.date, '2026-09-12');
  assert.equal(events[0].end.date, '2026-09-15');
});

// 11. Past date without year stays this year if only slightly in the past is not tested;
// instead: event sorting chronological
check('events sorted chronologically', () => {
  const { events } = parseBooking(
    'Return train Sep 6, 2026 departs 09:00\nOutbound flight Sep 4, 2026 departs 07:00',
    DEF
  );
  assert.ok(events.length >= 2);
  assert.ok(events[0].start.date <= events[1].start.date);
});

// 12. Arrival on next day ("Arrival Sep 5, 00:40") keeps its own date
check('overnight flight arrival date', () => {
  const { events } = parseBooking(
    'Flight EK 412\nDeparture: Sep 4, 2026 22:30\nArrival: Sep 5, 2026 06:55',
    DEF
  );
  const ev = events[0];
  assert.equal(ev.start.date, '2026-09-04');
  assert.equal(ev.end.date, '2026-09-05');
  assert.equal(ev.end.time, '06:55');
});

// 13. 24h time and 'h' style
check('18h05 french time style', () => {
  const { events } = parseBooking('Boarding 4 septembre 2026 18h05', DEF);
  assert.equal(events[0].start.date, '2026-09-04');
  assert.equal(events[0].start.time, '18:05');
});

// 14. No events for text without dates
check('no dates -> no events', () => {
  const { events } = parseBooking('Hello, thanks for your order!', DEF);
  assert.equal(events.length, 0);
});

// 15. Flight timezone from route IATA codes
check('flight tz from route codes', () => {
  const { events } = parseBooking(
    'Flight BA 112\nLondon Heathrow (LHR) → New York JFK\nDeparture: Jul 30, 2026 6:20 PM\nArrival: Jul 30, 2026 9:05 PM',
    DEF
  );
  assert.equal(events[0].tz, 'Europe/London');
  assert.equal(events[0].tzEnd, 'America/New_York');
});

// 16. Hotel timezone from country/city in address
check('hotel tz from address', () => {
  const { events } = parseBooking(
    'Booking confirmed\nHotel Europa Rome\nCheck-in: Fri, Sep 4, 2026 (from 14:00)\nCheck-out: Sun, Sep 6, 2026\nVia Nazionale 14, Rome, Italy',
    DEF
  );
  assert.equal(events[0].tz, 'Europe/Rome');
});

// 17. No place info -> floating (null tz)
check('unknown place keeps floating time', () => {
  const { events } = parseBooking('Check-in: Sep 4, 2026 14:00\nCheck-out: Sep 6, 2026', DEF);
  assert.equal(events[0].tz, null);
});

console.log(failures ? failures + ' failing' : 'all parser fixtures pass');
process.exit(failures ? 1 : 0);
