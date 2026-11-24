// ICS generation + timezone conversion tests — plain node, no framework.
//   node tests/ics.test.mjs
import assert from 'node:assert/strict';

import { loadVendor } from './_load.mjs';
const V = loadVendor();
const { icsFor, googleUrl, outlookUrl, yahooUrl, titleOf, describe } = V.BTCCal;
const { parseBooking } = V.BTCParser;

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

const SET = { defaultTime: '12:00' };

check('venue timezone converts to UTC (Singapore +8)', () => {
  const ev = { type: 'event', title: 'Test', allDay: false, tz: 'Asia/Singapore',
    start: { date: '2026-07-14', time: '10:25' }, end: { date: '2026-07-14', time: '12:55' } };
  const ics = icsFor([ev], SET);
  assert.match(ics, /DTSTART:20260714T022500Z/);   // 10:25 SGT = 02:25 UTC
  assert.match(ics, /DTEND:20260714T045500Z/);
});

check('flight with two zones converts each end', () => {
  const ev = { type: 'flight', title: 'Flight TK209: SIN → OTP', allDay: false,
    tz: 'Asia/Singapore', tzEnd: 'Europe/Bucharest',
    start: { date: '2026-07-14', time: '10:25' }, end: { date: '2026-07-14', time: '20:15' } };
  const ics = icsFor([ev], SET);
  assert.match(ics, /DTSTART:20260714T022500Z/);   // 10:25 +08 = 02:25Z
  assert.match(ics, /DTEND:20260714T171500Z/);     // 20:15 +03 (EEST) = 17:15Z
});

check('overnight flight rolls UTC date (Bahrain -> Singapore)', () => {
  const ev = { type: 'flight', title: 'Flight GF165: BAH → SIN', allDay: false,
    tz: 'Asia/Bahrain', tzEnd: 'Asia/Singapore',
    start: { date: '2026-07-10', time: '23:30' }, end: { date: '2026-07-11', time: '12:20' } };
  const ics = icsFor([ev], SET);
  assert.match(ics, /DTSTART:20260710T203000Z/);   // 23:30 +03 = 20:30Z
  assert.match(ics, /DTEND:20260711T042000Z/);     // 12:20 +08 = 04:20Z
});

check('all-day events ignore timezone', () => {
  const ev = { type: 'hotel', title: 'Hotel', allDay: true, tz: 'Asia/Shanghai',
    start: { date: '2026-09-04', time: null }, end: { date: '2026-09-06', time: null } };
  const ics = icsFor([ev], SET);
  assert.match(ics, /DTSTART;VALUE=DATE:20260904/);
  assert.match(ics, /DTEND;VALUE=DATE:20260907/); // exclusive
  assert.doesNotMatch(ics, /DTSTART:\d{8}T/);
});

check('no timezone -> floating times (no Z)', () => {
  const ev = { type: 'event', title: 'Test', allDay: false, tz: null,
    start: { date: '2026-07-30', time: '18:20' }, end: { date: '2026-07-30', time: '21:05' } };
  const ics = icsFor([ev], SET);
  assert.match(ics, /DTSTART:20260730T182000\r\n/);
  assert.match(ics, /DTEND:20260730T210500\r\n/);
  assert.ok(!/DTSTART:\d{8}T\d{6}Z/.test(ics), 'no UTC suffix on DTSTART expected');
});

check('Google link carries UTC when zone known', () => {
  const ev = { type: 'event', title: 'T', allDay: false, tz: 'Asia/Singapore',
    start: { date: '2026-07-14', time: '10:25' }, end: { date: '2026-07-14', time: '12:55' } };
  const url = googleUrl(ev, SET);
  assert.match(url, /dates=20260714T022500Z\/20260714T045500Z/);
});

check('Outlook link carries UTC when zone known', () => {
  const ev = { type: 'event', title: 'T', allDay: false, tz: 'Europe/Bucharest',
    start: { date: '2026-07-14', time: '20:15' }, end: { date: '2026-07-14', time: '21:15' } };
  const url = outlookUrl(ev, SET);
  assert.match(url, /startdt=2026-07-14T17%3A15%3A00Z/);
});

check('Yahoo link carries UTC when zone known', () => {
  const ev = { type: 'event', title: 'T', allDay: false, tz: 'Asia/Singapore',
    start: { date: '2026-07-14', time: '10:25' }, end: { date: '2026-07-14', time: '12:55' } };
  const url = yahooUrl(ev, SET);
  assert.match(url, /st=20260714T022500Z/);
  assert.match(url, /dur=0230/);
});

check('unknown zone string falls back to floating', () => {
  const ev = { type: 'event', title: 'T', allDay: false, tz: 'Not/AZone',
    start: { date: '2026-07-30', time: '18:20' }, end: { date: '2026-07-30', time: '19:20' } };
  const ics = icsFor([ev], SET);
  assert.match(ics, /DTSTART:20260730T182000\r\n/);
});

// --- titles, emoji, descriptions ------------------------------------------------------

const FLIGHT = parseBooking(
  'E-ticket\nHo Chi Minh City SGN → Siem Reap SAI\n19:30 SGN Ho Chi Minh City, Vietnam\nWed, 25 Nov 2026\nFlight no: VN815\n20:30 SAI Siem Reap, Cambodia\nSeat 28D\nBooking reference: ABC123',
  { now: new Date(2026, 7, 31) }
).events[0];

check('emoji prefix is on by default and can be switched off', () => {
  assert.equal(titleOf(FLIGHT, {}), '✈️ VN815: Ho Chi Minh City - Siem Reap');
  assert.equal(titleOf(FLIGHT, { emoji: false }), 'VN815: Ho Chi Minh City - Siem Reap');
  assert.match(icsFor([FLIGHT], { emoji: true }), /SUMMARY:✈️ VN815: Ho Chi Minh City - Siem Reap/);
  assert.match(icsFor([FLIGHT], { emoji: false }), /SUMMARY:VN815: Ho Chi Minh City - Siem Reap/);
  assert.match(googleUrl(FLIGHT, { emoji: true }), /text=%E2%9C%88%EF%B8%8F%20VN815/);
});

check('flight description: local times with offsets, duration, seat, booking ref', () => {
  const d = describe(FLIGHT, SET);
  assert.match(d, /^Vietnam Airlines VN815$/m);
  assert.match(d, /^Departs: Wed 25 Nov 2026, 19:30 \(UTC\+7\) · Ho Chi Minh City \(SGN\), Tan Son Nhat Airport$/m);
  assert.match(d, /^Arrives: Wed 25 Nov 2026, 20:30 \(UTC\+7\) · Siem Reap \(SAI\)/m);
  assert.match(d, /^Duration: 1h$/m);
  assert.match(d, /^Seat: 28D$/m);
  assert.match(d, /^Booking ref: ABC123$/m);
  assert.doesNotMatch(d, /Guest|Passenger/i);
  assert.match(d, /BookToCal/);
});

check('description follows edits made after parsing', () => {
  const ev = JSON.parse(JSON.stringify(FLIGHT));
  ev.start.time = '21:00';
  ev.end.time = '22:15';
  const d = describe(ev, SET);
  assert.match(d, /Departs: Wed 25 Nov 2026, 21:00/);
  assert.match(d, /Duration: 1h 15m/);
});

check('duration across timezones uses real elapsed time', () => {
  const ev = parseBooking('Flight TK209\nSIN - OTP\n14 July 2026 10:25 - 20:15', { now: new Date(2026, 7, 31) }).events[0];
  assert.match(describe(ev, SET), /Duration: 14h 50m/); // +08 -> +03
});

check('hotel description: check-in/out, nights, booking id', () => {
  const ev = parseBooking(
    'Hotel Europa Rome\nCheck-in: Fri, Sep 4, 2026 (from 14:00)\nCheck-out: Sun, Sep 6, 2026 (until 11:00)\nConfirmation number: 1234567890',
    { now: new Date(2026, 7, 31) }
  ).events[0];
  const d = describe(ev, SET);
  assert.match(d, /^Check-in: Fri 4 Sep 2026, from 14:00$/m);
  assert.match(d, /^Check-out: Sun 6 Sep 2026, until 11:00$/m);
  assert.match(d, /^Nights: 2$/m);
  assert.match(d, /^Booking ID: 1234567890$/m);
  const ics = icsFor([ev], SET);
  assert.match(ics, /DTSTART;VALUE=DATE:20260904/);
  assert.match(ics, /DTEND;VALUE=DATE:20260907/);
});

check('Google link names the departure timezone', () => {
  assert.match(googleUrl(FLIGHT, SET), /&ctz=Asia%2FHo_Chi_Minh/);
});

check('folded ICS lines stay within 75 bytes and never split a character', () => {
  const ev = { type: 'event', icon: '🎭', title: 'Ünïcödé '.repeat(12) + '🎪🎪🎪', allDay: false, tz: null,
    start: { date: '2026-07-30', time: '18:20' }, end: { date: '2026-07-30', time: '19:20' } };
  const ics = icsFor([ev], { emoji: true });
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line, 'utf8') <= 75, line);
  const unfolded = ics.replace(/\r\n /g, '');
  assert.ok(unfolded.includes('SUMMARY:🎭 ' + 'Ünïcödé '.repeat(12) + '🎪🎪🎪'));
});

check('Outlook 365 link uses the work host and the same fields', () => {
  const personal = outlookUrl(FLIGHT, SET), work = outlookUrl(FLIGHT, SET, true);
  assert.ok(personal.startsWith('https://outlook.live.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent&subject='));
  assert.ok(work.startsWith('https://outlook.office.com/calendar/action/compose?rru=addevent&subject='));
  assert.equal(work.split('&subject=')[1], personal.split('&subject=')[1]);
});

check('UID is stable per booking and unique within a file', () => {
  const uids = (ics) => ics.split('\r\n').filter((l) => l.startsWith('UID:'));
  assert.deepEqual(uids(icsFor([FLIGHT], SET)), uids(icsFor([FLIGHT], SET)));
  const later = JSON.parse(JSON.stringify(FLIGHT));
  later.start.time = '21:00';
  assert.deepEqual(uids(icsFor([later], SET)), uids(icsFor([FLIGHT], SET)), 'a time edit keeps the UID');
  const nextDay = JSON.parse(JSON.stringify(FLIGHT));
  nextDay.start.date = '2026-11-26';
  assert.notDeepEqual(uids(icsFor([nextDay], SET)), uids(icsFor([FLIGHT], SET)));
  const twice = uids(icsFor([FLIGHT, FLIGHT], SET));
  assert.equal(new Set(twice).size, 2);
  for (const u of twice) assert.match(u, /^UID:[0-9a-f]{16}(?:-\d+)?@booktocal\.com$/);
});

console.log(failures ? failures + ' failing' : 'all ics tests pass');
process.exit(failures ? 1 : 0);
