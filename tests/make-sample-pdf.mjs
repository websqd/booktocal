// Generates a small booking-confirmation PDF (tests/fixtures/booking.pdf) with
// a hand-built minimal PDF writer — no deps. Offsets for the xref table are
// computed as objects are appended.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
mkdirSync(dir, { recursive: true });

const esc = (s) => s.replace(/[\\()]/g, (c) => '\\' + c);
const lines = [
  'Booking confirmed - Grand Hotel Plaza',
  'Reservation number: 9876543210',
  'Check-in: Fri, Sep 4, 2026 (from 15:00)',
  'Check-out: Sun, Sep 6, 2026',
  'Guest: John Doe',
  'Total: 340.00 EUR',
];

let content = 'BT /F1 12 Tf 72 720 Td 16 TL\n';
for (const l of lines) content += '(' + esc(l) + ') Tj T*\n';
content += 'ET';

const objs = [];
objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
objs[2] = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>';
objs[3] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>';
objs[4] = '<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream';
objs[5] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';

let pdf = '%PDF-1.4\n';
const offsets = [];
for (let i = 1; i < objs.length; i++) {
  offsets[i] = pdf.length;
  pdf += i + ' 0 obj\n' + objs[i] + '\nendobj\n';
}
const xrefStart = pdf.length;
pdf += 'xref\n0 ' + objs.length + '\n0000000000 65535 f \n';
for (let i = 1; i < objs.length; i++) {
  pdf += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
}
pdf += 'trailer\n<< /Size ' + objs.length + ' /Root 1 0 R >>\nstartxref\n' + xrefStart + '\n%%EOF';

writeFileSync(join(dir, 'booking.pdf'), pdf, 'latin1');
console.log('wrote', join(dir, 'booking.pdf'), pdf.length, 'bytes');
