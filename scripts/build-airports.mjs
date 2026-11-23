// Regenerates public/vendor/airports.js from OurAirports data (public domain,
// via the `airports-json` dev dependency) + tz-lookup (CC0) for IANA zones.
//   node scripts/build-airports.mjs
// Output is a classic script defining BTC_AIRPORTS (compact string table) and
// BTC_AIRPORT_ZONES. Only airports with an IATA code and scheduled service are
// kept; large airports sort first so city lookups prefer the main airport.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const tzlookup = require('tz-lookup');
const ct = require('countries-and-timezones');
const src = JSON.parse(readFileSync(require.resolve('airports-json/data/airports.json'), 'utf8'));

// City names as travellers write them (OurAirports stores the municipality the
// runway is actually in: "Sepang" for KUL, "Islands" for HKG).
const CITY = {
  KUL: 'Kuala Lumpur', BRU: 'Brussels', FRA: 'Frankfurt', HKG: 'Hong Kong', MFM: 'Macau', NRT: 'Tokyo',
  NGO: 'Nagoya', SDJ: 'Sendai', CEB: 'Cebu', GOI: 'Goa', DEL: 'Delhi', IAD: 'Washington', EWR: 'New York',
  GDL: 'Guadalajara', MTY: 'Monterrey', MEX: 'Mexico City', PTY: 'Panama City', MVD: 'Montevideo',
  ASU: 'Asuncion', KBP: 'Kyiv', VVO: 'Vladivostok', DWC: 'Dubai', ISB: 'Islamabad', MRU: 'Mauritius',
  SEZ: 'Mahe', LPA: 'Gran Canaria', TFS: 'Tenerife', TFN: 'Tenerife', FUE: 'Fuerteventura', ACE: 'Lanzarote',
  PVD: 'Providence', GLA: 'Glasgow', CGN: 'Cologne', TPE: 'Taipei', TSA: 'Taipei', XIY: "Xi'an", UPG: 'Makassar',
  NQZ: 'Astana', BJX: 'Leon', TRN: 'Turin', NAP: 'Naples', VRN: 'Verona', DMM: 'Dammam', RUN: 'Reunion',
  SID: 'Sal', PQC: 'Phu Quoc', GIG: 'Rio de Janeiro', BOG: 'Bogota', CXR: 'Nha Trang', HUI: 'Hue',
  HAN: 'Hanoi', IST: 'Istanbul', SAW: 'Istanbul', DFW: 'Dallas', BSL: 'Basel', KIX: 'Osaka', ITM: 'Osaka',
  FCO: 'Rome', CIA: 'Rome', BGY: 'Milan', LIN: 'Milan', MXP: 'Milan', LGW: 'London', LCY: 'London',
  STN: 'London', LTN: 'London', SEN: 'London', HRI: 'Hambantota', HSA: 'Turkistan', PNH: 'Phnom Penh',
  USM: 'Koh Samui', KBV: 'Krabi', LGK: 'Langkawi', PEN: 'Penang', BKI: 'Kota Kinabalu', LOP: 'Lombok',
  ZNZ: 'Zanzibar', JTR: 'Santorini', JMK: 'Mykonos', CFU: 'Corfu', RHO: 'Rhodes', HER: 'Heraklion',
  IBZ: 'Ibiza', PMI: 'Palma de Mallorca', SJO: 'San Jose', LIR: 'Liberia', PUJ: 'Punta Cana', CUN: 'Cancun',
  HNL: 'Honolulu', OGG: 'Maui', NAN: 'Nadi', PPT: 'Tahiti', MLE: 'Male', CMB: 'Colombo', KTM: 'Kathmandu',
  ORD: 'Chicago', LGA: 'New York', JFK: 'New York', SFO: 'San Francisco', ICN: 'Seoul', GMP: 'Seoul',
  PVG: 'Shanghai', SHA: 'Shanghai', PEK: 'Beijing', PKX: 'Beijing', HND: 'Tokyo', CDG: 'Paris', ORY: 'Paris',
  BVA: 'Paris', CRL: 'Brussels', HHN: 'Frankfurt', NYO: 'Stockholm', TRF: 'Oslo', GRO: 'Girona',
  OTP: 'Bucharest', BBU: 'Bucharest', CLJ: 'Cluj-Napoca', IAS: 'Iasi', TSR: 'Timisoara', SBZ: 'Sibiu',
  DMK: 'Bangkok', BKK: 'Bangkok', SGN: 'Ho Chi Minh City', DAD: 'Da Nang', DPS: 'Denpasar', REP: 'Siem Reap',
};
// Airports newer than the dataset snapshot: [code, city, name, lat, lon].
const EXTRA = [
  ['SAI', 'Siem Reap', 'Siem Reap-Angkor', 13.37, 104.22, 'KH'],
  ['KTI', 'Phnom Penh', 'Techo', 11.36, 104.92, 'KH'],
];
// Where one city name maps to several airports, these lead (title/tz lookups by
// city pick the first table row whose city matches).
const PRIMARY = ['LHR', 'BKK', 'HND', 'CDG', 'JFK', 'MXP', 'SVO', 'IST', 'ICN', 'PVG', 'PEK', 'KIX', 'FCO', 'ORD',
  'IAD', 'EZE', 'GRU', 'GIG', 'IKA', 'CGK', 'DXB', 'CTU', 'BER', 'ARN', 'OTP', 'MCO', 'IAH', 'DFW', 'KUL', 'MEL',
  'TPE', 'MNL', 'BFS', 'GLA', 'TFS', 'KBP', 'WAW', 'BRU', 'FRA', 'BCN', 'SCL', 'SJO', 'PDX', 'BHX', 'MAN', 'HYD',
  'SYD', 'NAP', 'VCE', 'ATH', 'SJU', 'LED', 'SAI', 'PNH', 'SIN', 'HKG', 'DEL', 'BOM', 'LAX', 'YYZ', 'YUL', 'YVR',
  'AMS', 'MAD', 'LIS', 'DUB', 'ZRH', 'VIE', 'CPH', 'OSL', 'HEL', 'PRG', 'BUD', 'DOH', 'AUH', 'CAI', 'JNB', 'NBO'];

const strip = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[łŁ]/g, 'l').replace(/[øØ]/g, 'o').replace(/[đĐ]/g, 'd').replace(/ı/g, 'i').replace(/ß/g, 'ss').replace(/[æÆ]/g, 'ae')
  .replace(/[|;]/g, ' ').replace(/\s+/g, ' ').trim();

function cityOf(a) {
  if (CITY[a.iata_code]) return CITY[a.iata_code];
  let c = strip(a.municipality).replace(/\s*\([^)]*\)/g, '').trim();
  if (c.includes(',')) c = c.split(',').pop().trim();
  if (c.includes('/')) c = c.split('/')[0].trim();
  c = c.replace(/^Ciudad de (?!Mexico)/i, '');
  return c;
}
function nameOf(a, city) {
  let n = strip(a.name)
    .replace(/\b(international|intl|regional|domestic|airport|aeropuerto|aeroport|airfield|air base|field)\b\.?/gi, '')
    .replace(/[/()]/g, ' ').replace(/\s+/g, ' ').replace(/^[\s-]+|[\s-]+$/g, '');
  // Drop the name when it adds nothing beyond the city ("Hiroshima Airport").
  if (n.toLowerCase() === city.toLowerCase()) n = '';
  return n;
}

const rows = [];
const seen = new Set();
const sizeRank = { large_airport: 0, medium_airport: 1 };
const picked = src.filter((a) => a.iata_code && /^[A-Z]{3}$/.test(a.iata_code) && a.scheduled_service === 'yes' && a.type in sizeRank);
picked.sort((a, b) => (sizeRank[a.type] - sizeRank[b.type]) || a.iata_code.localeCompare(b.iata_code));
const push = (code, city, name, lat, lon, country) => {
  if (seen.has(code)) return;
  seen.add(code);
  rows.push({ code, city, name, lat: Number(lat), lon: Number(lon), country });
};
for (const [code, city, name, lat, lon, country] of EXTRA) push(code, city, name, lat, lon, country);
for (const a of picked) { const city = cityOf(a); push(a.iata_code, city, nameOf(a, city), a.latitude_deg, a.longitude_deg, a.iso_country); }
// Primaries first, otherwise keep size order.
const prim = new Map(PRIMARY.map((c, i) => [c, i]));
rows.sort((a, b) => (prim.has(a.code) ? prim.get(a.code) : 1e6) - (prim.has(b.code) ? prim.get(b.code) : 1e6));

// The coordinate grid lookup is coarse near borders and coasts (it put Bahrain
// in Asia/Tehran), so the airport's country constrains it: a single-zone
// country always wins; in a multi-zone country the lookup is trusted only when
// it names one of that country's zones.
// Familiar zone names for countries whose canonical tzdb zone is a neighbour's
// (same clock), and China's single official time.
const COUNTRY_ZONE = { VN: 'Asia/Ho_Chi_Minh', KH: 'Asia/Phnom_Penh', LA: 'Asia/Vientiane', MY: 'Asia/Kuala_Lumpur',
  BH: 'Asia/Bahrain', KW: 'Asia/Kuwait', OM: 'Asia/Muscat', CN: 'Asia/Shanghai', MM: 'Asia/Yangon' };
function zoneFor(r) {
  if (COUNTRY_ZONE[r.country]) return COUNTRY_ZONE[r.country];
  const guess = tzlookup(r.lat, r.lon);
  const country = ct.getCountry(r.country);
  const own = country ? country.timezones.filter((z) => { const t = ct.getTimezone(z); return t && !t.aliasOf; }) : [];
  if (!own.length) return guess;
  if (own.length === 1) return own[0];
  return own.includes(guess) ? guess : own[0];
}

const zones = [];
const zoneIdx = new Map();
const out = [];
for (const r of rows) {
  const tz = zoneFor(r);
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); } catch { throw new Error('Unknown zone ' + tz + ' for ' + r.code); }
  if (!zoneIdx.has(tz)) { zoneIdx.set(tz, zones.length); zones.push(tz); }
  out.push([r.code, r.city, r.name, zoneIdx.get(tz).toString(36), r.lat.toFixed(2), r.lon.toFixed(2)].join('|'));
}
const js = '// GENERATED by scripts/build-airports.mjs — do not edit by hand.\n' +
  '// Source: OurAirports (public domain) via airports-json; zones via tz-lookup (CC0).\n' +
  '// Row: IATA|city|airport name|zone index (base36)|lat|lon, rows joined by ";".\n' +
  'var BTC_AIRPORT_ZONES = ' + JSON.stringify(zones) + ';\n' +
  'var BTC_AIRPORTS = ' + JSON.stringify(out.join(';')) + ';\n';
writeFileSync(new URL('../public/vendor/airports.js', import.meta.url), js);
console.log(rows.length + ' airports, ' + zones.length + ' zones, ' + js.length + ' bytes');
