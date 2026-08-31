// ICS generation + timezone conversion tests — plain node, no framework.
//   node tests/ics.test.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const icsSrc = readFileSync(new URL('../public/vendor/ics.js', import.meta.url), 'utf8');
const { icsFor, googleUrl, outlookUrl, yahooUrl } = new Function(icsSrc + '; return BTCCal;')();

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

console.log(failures ? failures + ' failing' : 'all ics tests pass');
process.exit(failures ? 1 : 0);
