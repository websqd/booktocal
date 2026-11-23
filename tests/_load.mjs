// Loads the classic-script vendor modules the way the browser does (one shared
// global scope, in <script> order) and returns their globals.
import { readFileSync } from 'node:fs';

const FILES = ['airports.js', 'geo.js', 'tz.js', 'parser.js', 'ics.js', 'extract.js', 'intake.js'];

export function loadVendor() {
  let src = '';
  for (const f of FILES) {
    try { src += readFileSync(new URL('../public/vendor/' + f, import.meta.url), 'utf8') + '\n'; } catch (e) { /* optional */ }
  }
  const names = ['BTCGeo', 'BTCTz', 'BTCParser', 'BTCCal', 'BTCExtract', 'BTCIntake'];
  const ret = names.map((n) => n + ': typeof ' + n + " !== 'undefined' ? " + n + ' : undefined').join(', ');
  return new Function(src + '; return { ' + ret + ' };')();
}
