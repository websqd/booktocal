// Fixture tests for public/vendor/parser.js — plain node, no framework.
//   node tests/parse.test.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

// parser.js is a classic script (loaded by the browser via script-src 'self');
// eval it here the same way and grab the global it defines.
import { loadVendor } from './_load.mjs';
const { parseBooking } = loadVendor().BTCParser;

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

// 1. Hotel: an all-day banner across the stay; check-in/out times live in meta
check('hotel stay is an all-day banner with check-in time in meta', () => {
  const { events } = parseBooking(
    'Booking confirmation\nHotel Europa Rome\nCheck-in: Fri, Sep 4, 2026 (from 14:00)\nCheck-out: Sun, Sep 6, 2026\nConfirmation number: 1234567890',
    DEF
  );
  assert.equal(events.length, 1);
  const ev = events[0];
  assert.equal(ev.type, 'hotel');
  assert.equal(ev.allDay, true);
  assert.equal(ev.start.date, '2026-09-04');
  assert.equal(ev.end.date, '2026-09-06');
  assert.equal(ev.meta.checkIn, '14:00');
  assert.equal(ev.meta.checkOut, null);
  assert.equal(ev.title, 'Hotel Europa Rome');
  assert.equal(ev.icon, '🏨');
  assert.equal(ev.meta.ref, '1234567890');
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
  assert.equal(ev.title, 'BA112: London - New York');
  assert.equal(ev.icon, '✈️');
  assert.equal(ev.meta.from.code, 'LHR');
  assert.equal(ev.meta.to.code, 'JFK');
  assert.match(ev.location, /Heathrow.*\(LHR\)/);
});

// 2b. Timed hotel stays remain available as a setting
check('hotelAllDay:false keeps check-in/out as a timed block', () => {
  const { events } = parseBooking(
    'Hotel Europa Rome\nCheck-in: Fri, Sep 4, 2026 (from 14:00)\nCheck-out: Sun, Sep 6, 2026 (until 11:00)',
    { ...DEF, hotelAllDay: false }
  );
  assert.equal(events[0].allDay, false);
  assert.equal(events[0].start.time, '14:00');
  assert.equal(events[0].end.time, '11:00');
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
  assert.equal(ev.title, 'Eurostar 9208: London St Pancras - Paris Gare du Nord');
  assert.equal(ev.icon, '🚆');
  assert.equal(ev.tz, 'Europe/London');
  assert.equal(ev.tzEnd, 'Europe/Paris');
});

// 8b. Trains in Japan get the Shinkansen icon; buses get a bus
check('japan train -> shinkansen icon, bus -> bus icon', () => {
  const jp = parseBooking('Shinkansen Nozomi 12 | 4 Sep 2026 | Tokyo → Hiroshima | Departs 08:30 — Arrives 12:25 | Car 7 Seat 12A', DEF).events[0];
  assert.equal(jp.type, 'train');
  assert.equal(jp.icon, '🚅');
  assert.equal(jp.title, 'Nozomi 12: Tokyo - Hiroshima');
  assert.equal(jp.tz, 'Asia/Tokyo');
  assert.equal(jp.meta.coach, '7');
  const bus = parseBooking('FlixBus 1234 | 5 Sep 2026 | Berlin → Prague | Departs 09:00 — Arrives 13:30', DEF).events[0];
  assert.equal(bus.type, 'bus');
  assert.equal(bus.icon, '🚌');
});

// 8c. Generic events get a category icon
check('category icons for shows, circus, water parks', () => {
  const icon = (t) => parseBooking(t, DEF).events[0].icon;
  assert.equal(icon('Royal Opera House: Swan Lake ballet on 12 Sep 2026 at 19:30'), '🎭');
  assert.equal(icon('Cirque du Soleil - 14 Sep 2026 20:00'), '🎪');
  assert.equal(icon('Aquaventure Water Park entry 15 Sep 2026 10:00'), '🌊');
  assert.equal(icon('Team sync 16 Sep 2026 10:00'), '📅');
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
  assert.equal(events[0].title, 'Hotel Belvedere');
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

// 18. Year inference: a weekday pins the year; a recent past date stays this year
check('weekday pins the year', () => {
  const { events } = parseBooking('Flight BA 112\nLHR - JFK\nTue 28 Jan 16:40 - 19:30', DEF);
  assert.equal(events[0].start.date, '2025-01-28'); // the Tuesday nearest to Aug 2026
  assert.ok(!events[0].flags.yearAssumed);
});
check('recently passed date without a year stays in the current year', () => {
  const { events } = parseBooking('Dinner reservation Aug 10 at 7:30 pm', DEF);
  assert.equal(events[0].start.date, '2026-08-10');
  assert.equal(events[0].flags.yearAssumed, true);
});

// 19. Bookkeeping dates never become events
check('booked-on / birth / issue dates are ignored', () => {
  const { events } = parseBooking(
    'Flight BA 112\nLHR - JFK\nBooked on: 01 Aug 2026\nPassenger: Mr Guest, born 1 Jan 1990\nDeparture: Jul 30, 2027 6:20 PM\nArrival: Jul 30, 2027 9:05 PM',
    DEF
  );
  assert.equal(events.length, 1, JSON.stringify(events.map((e) => e.title + ' ' + e.start.date)));
  assert.equal(events[0].start.date, '2027-07-30');
});

// 20. A missing arrival is estimated from the route and lands in the arrival zone
check('missing arrival estimated across timezones', () => {
  const { events } = parseBooking('Boarding pass\nFlight BA 11\nLHR - SIN\nDeparture: 2 Oct 2026 19:35', DEF);
  const ev = events[0];
  assert.equal(ev.start.time, '19:35');
  assert.equal(ev.flags.endEstimated, true);
  assert.equal(ev.end.date, '2026-10-03');
  assert.ok(ev.end.time >= '15:30' && ev.end.time <= '17:30', ev.end.time);
  assert.equal(ev.tzEnd, 'Asia/Singapore');
});

// 21. Separator lines keep unrelated pastes apart
check('--- separates bookings pasted together', () => {
  const { events } = parseBooking(
    'Flight VN815\nSGN - SAI\n25 Nov 2026 19:30 - 20:30\n\n---\n\nHotel Europa Rome\nCheck-in: 4 Sep 2026\nCheck-out: 6 Sep 2026',
    DEF
  );
  assert.deepEqual(events.map((e) => e.type), ['hotel', 'flight']);
});

console.log(failures ? failures + ' failing' : 'all parser fixtures pass');
process.exit(failures ? 1 : 0);
