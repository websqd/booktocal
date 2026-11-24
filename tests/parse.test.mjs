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

// 22. "+1" next to an arrival whose printed date is already the next day
check('"+1" does not shift an arrival date that is already later', () => {
  const { events } = parseBooking('Flight BA11\nLondon (LHR) to Singapore (SIN)\nDeparture: 25 Nov 2026 21:25\nArrival: 26 Nov 2026 18:20 +1', DEF);
  assert.equal(events[0].end.date, '2026-11-26');
});
check('"+1" still shifts an arrival printed without its own date', () => {
  const { events } = parseBooking('Flight QR 836\nDoha (DOH) to Bangkok (BKK)\n25 Nov 2026\nDeparture: 20:05\nArrival: 06:40 +1', DEF);
  assert.equal(events[0].end.date, '2026-11-26');
});

// 23. "Visa" the payment card, and travel advice, are not visa documents
check('hotel paid with a Visa card stays a hotel', () => {
  const { events } = parseBooking(
    'Grand Hotel Plaza\nBooking confirmation number: 9876543210\nCheck-in: Fri, Dec 4, 2026 (from 15:00)\nCheck-out: Sun, Dec 6, 2026\n' +
    'Payment method: Visa ending 4242\nThis rate is valid until 1 Dec 2026', DEF);
  assert.deepEqual(events.map((e) => e.type), ['hotel']);
});
check('hotel that mentions visa support stays a hotel', () => {
  const { events } = parseBooking(
    'Hotel Europa Rome\nCheck-in: 4 Dec 2026\nCheck-out: 6 Dec 2026\nNeed a visa support letter? Ask the front desk.\nOffer valid until 1 Dec 2026', DEF);
  assert.deepEqual(events.map((e) => e.type), ['hotel']);
});
check('travel-document expiry on a flight booking is not a visa deadline', () => {
  const { events } = parseBooking(
    'Wizz Air booking confirmation\nFlight W6 3001  Bucharest (OTP) to London (LTN)\nDeparture: 12 Dec 2026 06:10   Arrival: 12 Dec 2026 07:40\n' +
    'Travel document\nExpiry date: 14 Mar 2031\nPlease check visa requirements for your destination.', DEF);
  assert.deepEqual(events.map((e) => e.type), ['flight']);
});
check('a plain visa still yields its deadline', () => {
  const { events } = parseBooking('VISA\nType of visa: Tourist\nValid until: 14 Mar 2027\nNumber of entries: 1', DEF);
  assert.deepEqual(events.map((e) => e.type + ' ' + e.start.date), ['deadline 2027-03-14']);
});

// 24. Dashed numeric dates are day-first; a 2-digit year is not accepted
check('dashed numeric date', () => {
  const { events } = parseBooking('Concert ticket\nColdplay live\nDate: 25-12-2026 at 20:00\nVenue: Arena Nationala, Bucharest', DEF);
  assert.equal(events.length, 1);
  assert.equal(events[0].start.date, '2026-12-25');
  assert.equal(events[0].title, 'Coldplay live');
  assert.equal(parseBooking('Dinner 05-12-2026 19:30', DEF).events[0].start.date, '2026-12-05');
  assert.equal(parseBooking('Dinner 12-25-2026 19:30', DEF).events[0].start.date, '2026-12-25');
  assert.equal(parseBooking('Locker 12-11-26 opens 19:30', DEF).events.length, 0);
});

// 25. Ambiguous slash dates follow the caller's region and are flagged
check('ambiguous slash date: region hint and flag', () => {
  const text = 'Dinner reservation 05/12/2026 19:30';
  const us = parseBooking(text, DEF).events[0];
  assert.equal(us.start.date, '2026-05-12');
  assert.equal(us.flags.dateOrderAssumed, true);
  const eu = parseBooking(text, { now: NOW, dayFirst: true }).events[0];
  assert.equal(eu.start.date, '2026-12-05');
  assert.equal(eu.flags.dateOrderAssumed, true);
  assert.ok(eu.notes.some((n) => /day\/month/.test(n)), eu.notes.join('|'));
  // The document itself settles it: no flag, hint ignored.
  const settled = parseBooking('Booked 25/11/2026\nDinner reservation 05/12/2026 19:30', { now: NOW, dayFirst: false }).events[0];
  assert.equal(settled.start.date, '2026-12-05');
  assert.equal(settled.flags.dateOrderAssumed, undefined);
  assert.equal(parseBooking('Dinner 13/12/2026 19:30', DEF).events[0].flags.dateOrderAssumed, undefined);
});

// 26. Titles do not keep label words or orphaned punctuation
check('train route drops the words in front of the station', () => {
  const a = parseBooking('Train ticket Bucuresti Nord → Brasov\nDate: 05.12.2026 Departure 08:00 Arrival 10:30', DEF).events[0];
  assert.equal(a.title, 'Train: Bucuresti Nord - Brasov');
  const b = parseBooking('Train IR 1765 Bucuresti Nord → Timisoara Nord\nDate 10 Dec 2026 Departs 21:45 Arrives 06:30', DEF).events[0];
  assert.equal(b.title, 'IR 1765: Bucuresti Nord - Timisoara Nord');
});
check('generic title drops punctuation left by the date and time', () => {
  assert.equal(parseBooking('Workshop: 10 Dec 2026, 2pm - 5pm, Berlin', DEF).events[0].title, 'Workshop: Berlin');
});

// 27. A ground keyword near a flight row does not turn the flight into a bus
check('flight stays a flight next to an airport-bus line', () => {
  const a = parseBooking('Your itinerary\nBA 11 London (LHR) to Singapore (SIN)\nWed 25 Nov 2026 21:25 - 18:20\nSeat 24C\nAirport bus transfer to the terminal is included', DEF).events;
  assert.deepEqual(a.map((e) => e.type + ' ' + e.title), ['flight BA11: London - Singapore']);
  const b = parseBooking('Your itinerary\nFlight BA 11 London (LHR) to Singapore (SIN)\nWed 25 Nov 2026 21:25 - 18:20\nShuttle bus to the terminal is included', DEF).events;
  assert.deepEqual(b.map((e) => e.type), ['flight']);
});
check('a train under its own heading stays a train after a flight', () => {
  const { events } = parseBooking('Flight W6 3001 OTP - LTN 12 Dec 2026 06:10 07:40\nTrain to the city\n13 Dec 2026 08:00 London → Oxford', DEF);
  assert.deepEqual(events.map((e) => e.type), ['flight', 'train']);
  assert.equal(events[1].title, 'Train: London - Oxford');
});

// 28. Day ranges
check('"10 - 12 Dec 2026" is a three-day all-day event', () => {
  for (const text of ['Web Summit conference\n10 - 12 Dec 2026\nLisbon', 'Web Summit conference\n10–12 December 2026\nLisbon', 'Web Summit conference\n10 Dec 2026 - 12 Dec 2026\nLisbon']) {
    const ev = parseBooking(text, DEF).events[0];
    assert.equal(ev.start.date + ' ' + ev.end.date + ' ' + ev.allDay, '2026-12-10 2026-12-12 true', text);
    assert.equal(ev.title, 'Web Summit conference');
  }
  assert.equal(parseBooking('Web Summit 10–12 December 2026, Lisbon', DEF).events[0].title, 'Web Summit, Lisbon');
  const timed = parseBooking('Workshop 10 - 12 Dec 2026, 09:00 - 17:00, Berlin', DEF).events[0];
  assert.equal(timed.start.date + ' ' + timed.start.time + ' ' + timed.end.date + ' ' + timed.end.time, '2026-12-10 09:00 2026-12-12 17:00');
});
check('a time or a flight number before a date is not a range', () => {
  const doors = parseBooking('Concert\nDoors 19:10 - 12 Dec 2026', DEF).events[0];
  assert.equal(doors.start.date + ' ' + doors.start.time, '2026-12-12 19:10');
  const fl = parseBooking('Itinerary\nFlight BA 11 - 12 Dec 2026 21:25 LHR - SIN', DEF).events[0];
  assert.equal(fl.type + ' ' + fl.start.date, 'flight 2026-12-12');
});

// 29. Dot times need a time word next to them
check('dot times: "19.30 Uhr", "ore 20.30", "at 19.30"', () => {
  const de = parseBooking('Abendessen im Restaurant Tim Raue\n4. Dezember 2026 um 19.30 Uhr', DEF).events[0];
  assert.equal(de.start.time + ' ' + de.title, '19:30 Abendessen im Restaurant Tim Raue');
  const it = parseBooking('Cena al ristorante Da Mario\n4 dicembre 2026 ore 20.30', DEF).events[0];
  assert.equal(it.start.time + ' ' + it.title, '20:30 Cena al ristorante Da Mario');
  assert.equal(parseBooking('Dinner 04.12.2026 at 19.30', DEF).events[0].start.time, '19:30');
  assert.equal(parseBooking('Stadtführung Berlin\n4. Dezember 2026, 10:00 Uhr', DEF).events[0].title, 'Stadtführung Berlin');
  assert.equal(parseBooking('Museum ticket 4 Dec 2026, total 19.30 EUR', DEF).events[0].flags.timeAssumed, true);
});

console.log(failures ? failures + ' failing' : 'all parser fixtures pass');
process.exit(failures ? 1 : 0);
