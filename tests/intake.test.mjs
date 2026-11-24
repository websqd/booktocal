// File intake tests: HTML/email/wallet-pass conversion — plain node, no framework.
//   node tests/intake.test.mjs
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { loadVendor } from './_load.mjs';

const V = loadVendor();
const { kindOf, htmlToText, parseEml, unzip, passToText, read } = V.BTCIntake;
const { parseBooking } = V.BTCParser;
const NOW = new Date(2026, 7, 31);

let failures = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log('  ok  ' + name);
  } catch (e) {
    failures++;
    console.error('FAIL  ' + name + '\n      ' + e.message);
  }
}

const enc = (s) => new TextEncoder().encode(s);

// Minimal zip writer (one entry per file; stored or deflated) for the tests.
function zip(entries) {
  const chunks = [], central = [];
  let offset = 0;
  const u16 = (n) => [n & 255, (n >> 8) & 255];
  const u32 = (n) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
  for (const [name, data, deflate, claimed] of entries) {
    const full = claimed == null ? data.length : claimed; // a header can lie about the inflated size
    const nameBytes = enc(name);
    const body = deflate ? new Uint8Array(deflateRawSync(data)) : data;
    const head = [...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(deflate ? 8 : 0), ...u16(0), ...u16(0), ...u32(0),
      ...u32(body.length), ...u32(full), ...u16(nameBytes.length), ...u16(0)];
    central.push([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(deflate ? 8 : 0), ...u16(0), ...u16(0), ...u32(0),
      ...u32(body.length), ...u32(full), ...u16(nameBytes.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0),
      ...u32(offset), ...nameBytes]);
    chunks.push(Uint8Array.from(head), nameBytes, body);
    offset += head.length + nameBytes.length + body.length;
  }
  const dir = Uint8Array.from(central.flat());
  const end = Uint8Array.from([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(entries.length), ...u16(entries.length),
    ...u32(dir.length), ...u32(offset), ...u16(0)]);
  return Buffer.concat([...chunks, dir, end]);
}

await check('file kinds by name and MIME type', () => {
  assert.equal(kindOf({ name: 'Ticket.PDF', type: '' }), 'pdf');
  assert.equal(kindOf({ name: 'screenshot.png', type: 'image/png' }), 'image');
  assert.equal(kindOf({ name: 'IMG_1.JPEG', type: '' }), 'image');
  assert.equal(kindOf({ name: 'booking.eml', type: '' }), 'eml');
  assert.equal(kindOf({ name: 'mail.html', type: 'text/html' }), 'html');
  assert.equal(kindOf({ name: 'BoardingPass.pkpass', type: '' }), 'pkpass');
  assert.equal(kindOf({ name: 'notes.txt', type: 'text/plain' }), 'text');
  assert.equal(kindOf({ name: 'archive.rar', type: '' }), null);
});

await check('htmlToText keeps rows as lines and cells as tabs', () => {
  const html = '<html><head><style>p{color:red}</style></head><body><h1>Hotel&nbsp;Europa Rome</h1>' +
    '<table><tr><th>Check-in</th><th>Check-out</th></tr><tr><td>4 Sep 2026</td><td>6 Sep 2026</td></tr></table>' +
    '<p>Caf&eacute; &amp; bar &#8226; 24h &rarr; <b>free</b></p><script>alert(1)</script></body></html>';
  const text = htmlToText(html);
  assert.deepEqual(text.split('\n'), ['Hotel Europa Rome', 'Check-in\tCheck-out', '4 Sep 2026\t6 Sep 2026', 'Café & bar • 24h → free']);
  assert.doesNotMatch(text, /alert|color/);
});

await check('html booking email parses end to end', () => {
  const html = '<div>Hotel Europa Rome</div><table><tr><td>Check-in</td><td>Fri, Sep 4, 2026 (from 14:00)</td></tr>' +
    '<tr><td>Check-out</td><td>Sun, Sep 6, 2026</td></tr></table>';
  const ev = parseBooking(htmlToText(html), { now: NOW }).events;
  assert.equal(ev.length, 1);
  assert.equal(ev[0].title, 'Hotel Europa Rome');
  assert.equal(ev[0].end.date, '2026-09-06');
});

const EML = [
  'From: bookings@example.com',
  'Subject: =?UTF-8?B?WW91ciB0cmlwIHRvIFNpZW0gUmVhcCDinIg=?=',
  'MIME-Version: 1.0',
  'Content-Type: multipart/mixed; boundary="outer"',
  '',
  '--outer',
  'Content-Type: multipart/alternative; boundary="alt"',
  '',
  '--alt',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'View this email in your browser.',
  '--alt',
  'Content-Type: text/html; charset=utf-8',
  'Content-Transfer-Encoding: quoted-printable',
  '',
  '<p>E-ticket</p><p>Ho Chi Minh City SGN =E2=86=92 Siem Reap SAI</p><p>19:30 SGN Ho Chi Minh City</p>=',
  '<p>Wed, 25 Nov 2026</p><p>Flight no: VN815</p><p>20:30 SAI Siem Reap</p>',
  '--alt--',
  '--outer',
  'Content-Type: text/plain; name="voucher.txt"',
  'Content-Disposition: attachment; filename="voucher.txt"',
  'Content-Transfer-Encoding: base64',
  '',
  Buffer.from('Hotel Europa Rome\nCheck-in: 4 Sep 2026\nCheck-out: 6 Sep 2026\n').toString('base64'),
  '--outer--',
  '',
].join('\r\n');

await check('parseEml: encoded subject, html body preferred over a token text part, attachment decoded', () => {
  const mail = parseEml(enc(EML));
  assert.equal(mail.subject, 'Your trip to Siem Reap ✈');
  assert.match(mail.text, /Ho Chi Minh City SGN → Siem Reap SAI/);
  assert.doesNotMatch(mail.text, /View this email/);
  assert.equal(mail.attachments.length, 1);
  assert.equal(mail.attachments[0].name, 'voucher.txt');
  assert.match(new TextDecoder().decode(mail.attachments[0].bytes), /Hotel Europa Rome/);
});

await check('read(.eml) yields the body and each readable attachment as documents', async () => {
  const file = { name: 'trip.eml', type: 'message/rfc822', size: EML.length, arrayBuffer: async () => enc(EML).buffer };
  const docs = await read(file, {});
  assert.equal(docs.length, 2);
  assert.equal(docs[1].name, 'trip.eml › voucher.txt');
  const ev = V.BTCParser.parseDocuments(docs, { now: NOW }).events;
  assert.deepEqual(ev.map((e) => e.title), ['Hotel Europa Rome', 'VN815: Ho Chi Minh City - Siem Reap']);
});

await check('unzip reads stored and deflated entries', async () => {
  const z = zip([['a.txt', enc('stored'), false], ['dir/b.json', enc('{"x":' + '1'.repeat(500) + '}'), true]]);
  const files = await unzip(new Uint8Array(z));
  assert.equal(new TextDecoder().decode(files['a.txt']), 'stored');
  assert.equal(JSON.parse(new TextDecoder().decode(files['dir/b.json'])).x, Number('1'.repeat(500)));
  await assert.rejects(() => unzip(enc('not a zip, definitely not one')));
});

await check('unzip refuses entries that inflate past the cap', async () => {
  const big = new Uint8Array(6 * 1024 * 1024); // deflates to a few KB
  const honest = await unzip(new Uint8Array(zip([['big.json', big, true], ['a.txt', enc('ok'), false]])));
  assert.deepEqual(Object.keys(honest), ['a.txt']);
  await assert.rejects(() => unzip(new Uint8Array(zip([['big.json', big, true, 10]]))), /too large/);
});

await check('OCR canvas stays inside the iOS pixel limit', () => {
  const f = V.BTCIntake.upscaleFactor;
  assert.ok(Math.abs(f(1179, 2556) - 2400 / 1179) < 1e-9, 'a phone screenshot is still doubled');
  for (const [w, h] of [[1170, 12000], [6000, 4000], [400, 30000], [9000, 9000]]) {
    const k = f(w, h);
    assert.ok(w * k * h * k <= 16000000 + 1, w + 'x' + h + ' -> ' + Math.round(w * k * h * k));
    assert.ok(w * k <= 4096 + 1e-6);
  }
});

const PASS = {
  formatVersion: 1, organizationName: 'British Airways', description: 'Boarding pass',
  relevantDate: '2026-10-02T19:35:00+01:00',
  boardingPass: {
    transitType: 'PKTransitTypeAir',
    headerFields: [{ key: 'gate', label: 'GATE', value: 'B32' }],
    primaryFields: [{ key: 'origin', label: 'LONDON', value: 'LHR' }, { key: 'destination', label: 'SINGAPORE', value: 'SIN' }],
    secondaryFields: [{ key: 'passenger', label: 'PASSENGER', value: 'MR GUEST' }, { key: 'flight', label: 'FLIGHT', value: 'BA0011' }],
    auxiliaryFields: [{ key: 'seat', label: 'SEAT', value: '24C' }, { key: 'board', label: 'BOARDING', value: '18:35' },
      { key: 'ref', label: 'BOOKING REFERENCE', value: 'UQKHZP' }],
  },
};

await check('wallet boarding pass (.pkpass) parses to a flight', async () => {
  const z = zip([['pass.json', enc(JSON.stringify(PASS)), true], ['icon.png', new Uint8Array([1, 2, 3]), false]]);
  const file = { name: 'ba.pkpass', type: '', size: z.length, arrayBuffer: async () => new Uint8Array(z).buffer };
  const docs = await read(file, {});
  const ev = parseBooking(docs[0].text, { now: NOW }).events;
  assert.equal(ev.length, 1, docs[0].text);
  const a = ev[0];
  assert.equal(a.title, 'BA11: London - Singapore');
  assert.equal(a.start.date, '2026-10-02');
  assert.equal(a.start.time, '19:35');
  assert.equal(a.meta.seat, '24C');
  assert.equal(a.meta.gate, 'B32');
  assert.equal(a.meta.boarding, '18:35');
  assert.equal(a.meta.ref, 'UQKHZP');
});

await check('wallet event ticket parses to an event', () => {
  const text = passToText({
    organizationName: 'Saigon Opera House', description: 'A O Show', relevantDate: '2026-11-17T18:00:00+07:00',
    eventTicket: {
      primaryFields: [{ key: 'event', label: 'EVENT', value: 'A O SHOW' }],
      secondaryFields: [{ key: 'loc', label: 'VENUE', value: 'Saigon Opera House' }],
    },
  });
  const ev = parseBooking(text, { now: NOW }).events;
  assert.equal(ev.length, 1, text);
  assert.equal(ev[0].start.date, '2026-11-17');
  assert.equal(ev[0].start.time, '18:00');
  assert.equal(ev[0].icon, '🎭');
});

await check('unsupported and oversized files are rejected with a reason', async () => {
  await assert.rejects(() => read({ name: 'x.rar', type: '', size: 10, arrayBuffer: async () => new ArrayBuffer(10) }, {}), /Unsupported/);
  await assert.rejects(() => read({ name: 'x.txt', type: 'text/plain', size: 31 * 1024 * 1024, arrayBuffer: async () => new ArrayBuffer(1) }, {}), /30 MB/);
});

console.log(failures ? failures + ' failing' : 'all intake tests pass');
process.exit(failures ? 1 : 0);
