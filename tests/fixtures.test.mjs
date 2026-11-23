// Real-world fixture tests — anonymized copies of real bookings.
//   node tests/fixtures.test.mjs
// tests/fixtures/*.txt are pasted emails; tests/fixtures/real/*.txt are PDF
// extractions (tabs mark table columns), noisy OCR of screenshots (ocr-*) and
// copy-pastes (paste-*). Names, references and contact details are replaced.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { loadVendor } from './_load.mjs';

const { parseBooking, parseDocuments } = loadVendor().BTCParser;
const NOW = new Date(2026, 7, 31);
const NOW2 = new Date(2026, 10, 23); // the day the "real" set was collected
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
const real = (name, opts = {}) => parseBooking(fx('real/' + name), { now: NOW2, ...opts }).events;
const brief = (ev) => JSON.stringify(ev.map((e) => e.title + ' ' + e.start.date + ' ' + e.start.time));

// --- pasted emails ---------------------------------------------------------------

check('2flights.txt — VietJet round trip, route + code + both legs', () => {
  const ev = parse('2flights.txt');
  assert.equal(ev.length, 2, brief(ev));
  const [a, b] = ev;
  assert.equal(a.title, 'VJ327: Ho Chi Minh City - Phu Quoc');
  assert.equal(a.start.date, '2026-11-18');
  assert.equal(a.start.time, '12:35');
  assert.equal(a.end.time, '13:35');
  assert.equal(a.meta.ref, 'WMPRMA');
  assert.equal(b.title, 'VJ326: Phu Quoc - Ho Chi Minh City');
  assert.equal(b.start.date, '2026-11-23');
  assert.equal(b.start.time, '14:10');
  assert.equal(b.end.time, '15:10');
});

check('2flights-nodetails.txt — tab table with header row, weekday gives the year', () => {
  const ev = parse('2flights-nodetails.txt');
  assert.equal(ev.length, 2, brief(ev));
  const [a, b] = ev;
  assert.equal(a.title, 'GF44: Istanbul - Manama');
  assert.equal(a.start.date, '2025-07-10'); // "Thu, Jul 10" is a Thursday in 2025
  assert.equal(a.start.time, '16:05');
  assert.equal(a.end.time, '20:15');
  assert.equal(a.meta.ref, 'FJASCG');
  assert.equal(b.title, 'GF165: Manama - Singapore');
  assert.equal(b.start.time, '23:30');
  assert.equal(b.end.date, '2025-07-11'); // overnight arrival
  assert.equal(b.end.time, '12:20');
  assert.equal(b.tzEnd, 'Asia/Singapore');
});

check('2flights2.txt — connection on one line, times on own lines, next-day return', () => {
  const ev = parse('2flights2.txt');
  assert.equal(ev.length, 2, brief(ev));
  const [a, b] = ev;
  assert.equal(a.title, 'TK209: Singapore - Bucharest');
  assert.deepEqual(a.meta.via, ['TK1045']);
  assert.equal(a.start.date, '2026-07-14');
  assert.equal(a.start.time, '10:25');
  assert.equal(a.end.time, '20:15');
  assert.equal(b.title, 'TK1044: Bucharest - Singapore');
  assert.equal(b.start.date, '2026-09-30');
  assert.equal(b.start.time, '09:30');
  assert.equal(b.end.date, '2026-10-01'); // "Next day"
  assert.equal(b.end.time, '08:45');
});

check('flight.txt — AirAsia domestic leg', () => {
  const ev = parse('flight.txt');
  assert.equal(ev.length, 1, brief(ev));
  const a = ev[0];
  assert.equal(a.title, 'FD638: Bangkok - Da Nang');
  assert.equal(a.start.date, '2025-01-28'); // "Tue, Jan 28"
  assert.equal(a.start.time, '16:40');
  assert.equal(a.end.time, '18:20');
  assert.equal(a.meta.ref, 'O8J33M');
});

check('booking-agoda.txt — keyword header, dates+checkout on one line', () => {
  const ev = parse('booking-agoda.txt');
  assert.equal(ev.length, 1, brief(ev));
  const a = ev[0];
  assert.equal(a.type, 'hotel');
  assert.equal(a.title, 'Kin Hotel Thi Sach');
  assert.equal(a.allDay, true);
  assert.equal(a.start.date, '2026-11-23');
  assert.equal(a.end.date, '2026-11-25');
  assert.equal(a.meta.ref, '679845891');
});

check('booking-hotel.txt — stacked check-in/out lines with (after/before) times', () => {
  const ev = parse('booking-hotel.txt');
  assert.equal(ev.length, 1, brief(ev));
  const a = ev[0];
  assert.equal(a.type, 'hotel');
  assert.equal(a.title, 'Oxford Hotel, Singapore');
  assert.equal(a.start.date, '2026-07-10');
  assert.equal(a.end.date, '2026-07-14');
  assert.equal(a.meta.checkIn, '14:00');
  assert.equal(a.meta.checkOut, '12:00');
  assert.match(a.location, /Queen Street/);
  assert.equal(a.tz, 'Asia/Singapore');
});

check('booking-ticket.txt — show ticket with label layout', () => {
  const ev = parse('booking-ticket.txt');
  assert.equal(ev.length, 1, brief(ev));
  const a = ev[0];
  assert.equal(a.start.date, '2026-11-17');
  assert.equal(a.start.time, '18:00');
  assert.equal(a.end.time, '18:30'); // default duration
  assert.equal(a.title, 'A O SHOW');
  assert.equal(a.icon, '🎭');
  assert.match(a.location, /Saigon Opera House/);
});

// --- PDF extractions -----------------------------------------------------------------

check('agoda-voucher — property label, address, all-day stay', () => {
  const ev = real('agoda-voucher.txt');
  assert.equal(ev.length, 1, brief(ev));
  const a = ev[0];
  assert.equal(a.title, 'Koulen Hotel, Siem Reap');
  assert.equal(a.allDay, true);
  assert.equal(a.start.date, '2026-11-25');
  assert.equal(a.end.date, '2026-11-29');
  assert.equal(a.tz, 'Asia/Phnom_Penh');
  assert.match(a.location, /^Oknha Oum Chhay Street, Siem Reap/);
  assert.doesNotMatch(a.location, /Robinson/); // the agency's own address
  assert.equal(a.meta.ref, '2000000001');
});

check('vietjet-itinerary — two table rows, seats from the passenger list, no office-hours noise', () => {
  const ev = real('vietjet-itinerary.txt');
  assert.equal(ev.length, 2, brief(ev));
  const [a, b] = ev;
  assert.equal(a.title, 'VJ953: Hiroshima - Hanoi');
  assert.equal(a.start.date, '2026-11-03');
  assert.equal(a.start.time, '13:30');
  assert.equal(a.end.time, '16:20');
  assert.equal(a.tz, 'Asia/Tokyo');
  assert.equal(a.tzEnd, 'Asia/Ho_Chi_Minh');
  assert.equal(a.meta.seat, '10F');
  assert.equal(a.meta.ref, 'SK6W6P');
  assert.equal(b.title, 'VJ521: Hanoi - Da Nang');
  assert.equal(b.start.time, '20:25');
  assert.equal(b.end.time, '21:45');
  assert.equal(b.meta.seat, '4F');
});

check('kiwi-eticket-sgn-sai — times before airport codes, birth date ignored', () => {
  const ev = real('kiwi-eticket-sgn-sai.txt');
  assert.equal(ev.length, 1, brief(ev));
  const a = ev[0];
  assert.equal(a.title, 'VN815: Ho Chi Minh City - Siem Reap');
  assert.equal(a.start.date, '2026-11-25');
  assert.equal(a.start.time, '19:30');
  assert.equal(a.end.time, '20:30');
  assert.equal(a.tzEnd, 'Asia/Phnom_Penh');
  assert.equal(a.meta.ref, 'ZKJHNT');
  assert.equal(a.meta.airline, 'Vietnam Airlines');
});

check('ba-boarding-pass — header row maps times, names resolve airports, arrival estimated', () => {
  const ev = real('ba-boarding-pass.txt');
  assert.equal(ev.length, 1, brief(ev));
  const a = ev[0];
  assert.equal(a.title, 'BA11: London - Singapore');
  assert.equal(a.start.time, '19:35'); // not 19:00 "clear security by" or 18:35 boarding
  assert.equal(a.meta.boarding, '18:35');
  assert.equal(a.meta.seat, '24C');
  assert.equal(a.meta.ref, 'UQKHZP');
  assert.equal(a.meta.from.terminal, '5');
  assert.equal(a.flags.endEstimated, true);
  assert.equal(a.tzEnd, 'Asia/Singapore');
  assert.equal(a.flags.yearAssumed, true);
});

check('vietjet-boarding-pass — bilingual labels, boarding vs departure vs arrival', () => {
  const ev = real('vietjet-boarding-pass.txt');
  assert.equal(ev.length, 1, brief(ev));
  const a = ev[0];
  assert.equal(a.title, 'VJ326: Phu Quoc - Ho Chi Minh City');
  assert.equal(a.start.date, '2026-11-23');
  assert.equal(a.start.time, '14:20');
  assert.equal(a.end.time, '15:20');
  assert.ok(!a.flags.endEstimated);
  assert.equal(a.meta.boarding, '13:50');
  assert.equal(a.meta.seat, '28D');
  assert.equal(a.meta.ref, 'WMKRNA');
});

check('cfr-oneway — train table, two services, coach and seat', () => {
  const ev = real('cfr-oneway.txt');
  assert.equal(ev.length, 1, brief(ev));
  const a = ev[0];
  assert.equal(a.type, 'train');
  assert.equal(a.icon, '🚆');
  assert.equal(a.title, 'IR 1655 + R 5481: București Nord - Piatra Neamț');
  assert.equal(a.start.date, '2026-07-25');
  assert.equal(a.start.time, '14:12');
  assert.equal(a.end.time, '20:25');
  assert.equal(a.tz, 'Europe/Bucharest');
  assert.equal(a.meta.coach, '5');
  assert.equal(a.meta.seat, '87');
});

check('cfr-return — two legs, buy date ignored', () => {
  const ev = real('cfr-return.txt');
  assert.equal(ev.length, 2, brief(ev));
  assert.equal(ev[0].title, 'IR 1657: București Nord - Piatra Neamț');
  assert.equal(ev[0].start.date, '2026-09-27');
  assert.equal(ev[0].start.time, '15:00');
  assert.equal(ev[0].end.time, '21:11');
  assert.equal(ev[1].title, 'IR 1858: Piatra Neamț - București Nord');
  assert.equal(ev[1].start.time, '09:28');
  assert.equal(ev[1].end.time, '15:25');
});

check('cfr-return pasted without column gaps — stations split via the return leg', () => {
  const ev = parseBooking(fx('real/cfr-return.txt').replace(/\t/g, ' '), { now: NOW2 }).events;
  assert.equal(ev.length, 2, brief(ev));
  assert.equal(ev[0].title, 'IR 1657: București Nord - Piatra Neamț');
  assert.equal(ev[1].title, 'IR 1858: Piatra Neamț - București Nord');
});

check('nokair-boarding-pass — "28JAN", digits-only flight number, am/pm header table', () => {
  const ev = real('nokair-boarding-pass.txt');
  assert.equal(ev.length, 1, brief(ev));
  const a = ev[0];
  assert.equal(a.title, 'DD525: Phuket - Bangkok');
  assert.equal(a.meta.to.code, 'DMK');
  assert.equal(a.start.date, '2027-01-28');
  assert.equal(a.start.time, '11:25');
  assert.equal(a.end.time, '12:55');
  assert.equal(a.meta.boarding, '10:55');
  assert.equal(a.meta.seat, '8A');
  assert.equal(a.meta.ref, '8080K6');
});

check('wizz-boarding-card — "21 / Jun / 2025", many decoy times, arrival label above its value', () => {
  const ev = real('wizz-boarding-card.txt');
  assert.equal(ev.length, 1, brief(ev));
  const a = ev[0];
  assert.equal(a.title, 'W4 3139: Bucharest - Bologna');
  assert.equal(a.start.date, '2025-06-21');
  assert.equal(a.start.time, '12:30');
  assert.equal(a.end.time, '13:45');
  assert.equal(a.tz, 'Europe/Bucharest');
  assert.equal(a.tzEnd, 'Europe/Rome');
  assert.equal(a.meta.seat, '11D');
  assert.equal(a.meta.ref, 'VGKIXP');
});

check('bookingcom-flight — broken PDF glyphs, no "flight" word, weekday year', () => {
  const ev = real('bookingcom-flight.txt');
  assert.equal(ev.length, 1, brief(ev));
  const a = ev[0];
  assert.equal(a.title, 'FD638: Bangkok - Da Nang');
  assert.equal(a.start.date, '2025-01-28');
  assert.equal(a.start.time, '16:40');
  assert.equal(a.end.time, '18:20');
  assert.equal(a.meta.from.code, 'DMK');
});

check('airasia-boarding-pass — boarding time only: starts at boarding, end estimated', () => {
  const ev = real('airasia-boarding-pass.txt');
  assert.equal(ev.length, 1, brief(ev));
  const a = ev[0];
  assert.equal(a.title, 'AK892: Kuala Lumpur - Bangkok');
  assert.equal(a.meta.to.code, 'DMK');
  assert.equal(a.start.date, '2025-01-11');
  assert.equal(a.start.time, '16:25');
  assert.equal(a.flags.startIsBoarding, true);
  assert.equal(a.flags.endEstimated, true);
  assert.equal(a.meta.seat, '37F');
  assert.equal(a.meta.ref, 'RKR54P');
});

check('kiwi-eticket-hkt-dmk — three pages, "last updated" dates ignored', () => {
  const ev = real('kiwi-eticket-hkt-dmk.txt');
  assert.equal(ev.length, 1, brief(ev));
  const a = ev[0];
  assert.equal(a.title, 'DD525: Phuket - Bangkok');
  assert.equal(a.start.date, '2025-01-28');
  assert.equal(a.start.time, '11:25');
  assert.equal(a.end.time, '12:55');
});

check('indonesia-evoa — a single use-before reminder, nothing else', () => {
  const ev = real('indonesia-evoa.txt');
  assert.equal(ev.length, 1, brief(ev));
  const a = ev[0];
  assert.equal(a.type, 'deadline');
  assert.equal(a.icon, '🛂');
  assert.equal(a.title, 'Indonesia e-VOA: use before');
  assert.equal(a.allDay, true);
  assert.equal(a.start.date, '2025-12-15');
  assert.equal(a.meta.ref, 'Z8A0000001');
});

// --- OCR of screenshots (noisy) ------------------------------------------------------------

check('ocr-vietjet-boarding-pass — DD/MM/YYYY, boarding time only', () => {
  const ev = real('ocr-vietjet-boarding-pass.txt');
  assert.equal(ev.length, 1, brief(ev));
  const a = ev[0];
  assert.equal(a.title, 'VJ326: Phu Quoc - Ho Chi Minh City');
  assert.equal(a.start.date, '2026-11-23');
  assert.equal(a.start.time, '13:50');
  assert.equal(a.flags.startIsBoarding, true);
  assert.equal(a.meta.seat, '28D');
  assert.equal(a.meta.ref, 'WMKRNA');
});

check('ocr-trip-flight — "Nov1l" and "VI953" misreads are repaired', () => {
  const ev = real('ocr-trip-flight.txt');
  assert.equal(ev.length, 1, brief(ev));
  const a = ev[0];
  assert.equal(a.title, 'VJ953: Hiroshima - Hanoi');
  assert.equal(a.start.date, '2026-11-11');
  assert.equal(a.start.time, '13:30');
  assert.equal(a.end.time, '16:20');
  assert.equal(a.tz, 'Asia/Tokyo');
  assert.equal(a.meta.to.terminal, '2');
});

check('ocr-trip-pnr — date-only legs become all-day flights with their own PNRs', () => {
  const ev = real('ocr-trip-pnr.txt');
  assert.equal(ev.length, 2, brief(ev));
  assert.equal(ev[0].title, 'VJ952: Hanoi - Hiroshima');
  assert.equal(ev[0].start.date, '2026-10-12');
  assert.equal(ev[0].allDay, true);
  assert.equal(ev[1].title, 'VJ953: Hiroshima - Hanoi');
  assert.equal(ev[1].start.date, '2026-11-11');
  assert.equal(ev[1].meta.ref, 'VEKGP3');
});

// --- copy-pastes -----------------------------------------------------------------------------

check('paste-kiwi — time, date and airport on separate lines', () => {
  const ev = real('paste-kiwi.txt');
  assert.equal(ev.length, 1, brief(ev));
  assert.equal(ev[0].title, 'VN815: Ho Chi Minh City - Siem Reap');
  assert.equal(ev[0].start.time, '19:30');
  assert.equal(ev[0].end.time, '20:30');
});

check('paste-vietravel — "Sun-15Nov2026", "VU- 255", booked-on date and tax codes ignored', () => {
  const ev = real('paste-vietravel.txt');
  assert.equal(ev.length, 1, brief(ev));
  const a = ev[0];
  assert.equal(a.title, 'VU255: Da Nang - Ho Chi Minh City');
  assert.equal(a.start.date, '2026-11-15');
  assert.equal(a.start.time, '15:20');
  assert.equal(a.end.time, '16:55');
  assert.equal(a.meta.ref, 'LK613P');
});

check('paste-bookingcom — two flights, each with its own route and times', () => {
  const ev = real('paste-bookingcom.txt');
  assert.equal(ev.length, 2, brief(ev));
  assert.equal(ev[0].title, 'VJ327: Ho Chi Minh City - Phu Quoc');
  assert.equal(ev[0].start.time, '12:35');
  assert.equal(ev[1].title, 'VJ326: Phu Quoc - Ho Chi Minh City');
  assert.equal(ev[1].start.time, '14:10');
});

// --- several documents at once -------------------------------------------------------------

const docs = (names) => names.map((n) => ({ name: n, text: fx('real/' + n) }));

check('same flight in a ticket and a boarding pass merges; explicit year wins', () => {
  const ev = parseDocuments(docs(['nokair-boarding-pass.txt', 'kiwi-eticket-hkt-dmk.txt']), { now: NOW2 }).events;
  assert.equal(ev.length, 1, brief(ev));
  const a = ev[0];
  assert.equal(a.start.date, '2025-01-28');
  assert.equal(a.end.date, '2025-01-28');
  assert.equal(a.meta.seat, '8A'); // from the boarding pass
  assert.equal(a.meta.to.code, 'DMK');
  assert.ok(!a.flags.yearAssumed);
  assert.deepEqual(a.sources.slice().sort(), ['kiwi-eticket-hkt-dmk.txt', 'nokair-boarding-pass.txt']);
});

check('boarding pass beats itinerary on times; the difference is noted', () => {
  const ev = parseDocuments(docs(['paste-bookingcom.txt', 'ocr-vietjet-boarding-pass.txt', 'vietjet-boarding-pass.txt']), { now: NOW2 }).events;
  assert.equal(ev.length, 2, brief(ev));
  const a = ev[1];
  assert.equal(a.title, 'VJ326: Phu Quoc - Ho Chi Minh City');
  assert.equal(a.start.time, '14:20');
  assert.equal(a.end.time, '15:20');
  assert.equal(a.sources.length, 3);
  assert.ok(a.notes.some((n) => /14:10/.test(n)), a.notes.join('|'));
});

check('date-only leg from one screenshot merges into the timed flight from another', () => {
  const ev = parseDocuments(docs(['ocr-trip-pnr.txt', 'ocr-trip-flight.txt']), { now: NOW2 }).events;
  assert.equal(ev.length, 2, brief(ev));
  assert.equal(ev[0].title, 'VJ952: Hanoi - Hiroshima');
  assert.equal(ev[1].title, 'VJ953: Hiroshima - Hanoi');
  assert.equal(ev[1].start.time, '13:30');
  assert.equal(ev[1].allDay, false);
  assert.equal(ev[1].meta.ref, 'VEKGP3');
});

check('the whole set together: 18 distinct bookings, chronological', () => {
  const names = ['agoda-voucher.txt', 'vietjet-itinerary.txt', 'kiwi-eticket-sgn-sai.txt', 'ba-boarding-pass.txt',
    'vietjet-boarding-pass.txt', 'cfr-oneway.txt', 'cfr-return.txt', 'nokair-boarding-pass.txt', 'wizz-boarding-card.txt',
    'bookingcom-flight.txt', 'airasia-boarding-pass.txt', 'kiwi-eticket-hkt-dmk.txt', 'indonesia-evoa.txt',
    'ocr-vietjet-boarding-pass.txt', 'ocr-trip-pnr.txt', 'ocr-trip-flight.txt', 'paste-kiwi.txt', 'paste-vietravel.txt',
    'paste-bookingcom.txt'];
  const ev = parseDocuments(docs(names), { now: NOW2 }).events;
  assert.equal(ev.length, 18, brief(ev));
  for (let i = 1; i < ev.length; i++) assert.ok(ev[i - 1].start.date <= ev[i].start.date);
  assert.ok(ev.every((e) => e.icon && e.title));
});

console.log(failures ? failures + ' failing' : 'all real-fixture tests pass');
process.exit(failures ? 1 : 0);
