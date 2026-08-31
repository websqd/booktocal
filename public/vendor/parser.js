// bookingtocal — client-side booking parser. Pure functions, no DOM, no deps:
// the same module runs in the browser (inline-injected) and under node for the
// fixture tests. Booking text never leaves the page where this runs.
//
// Strategy: scan line-by-line for typed patterns (hotel, flight, train), then
// sweep unconsumed dates as generic events. Dates/times accept the formats
// real confirmation emails use (ISO, US, EU, month-name, weekday prefixes).
// Missing details fall back to the caller-provided defaults (noon / 30 min).
//
// All produced dates are FLOATING local times (no timezone conversion): the
// event renders in whatever timezone the user's calendar is set to. That is
// the honest choice when the source text rarely states a timezone — see README.

// --- public API -------------------------------------------------------------

// parseBooking(text, opts) -> { events: [...] }
// opts: { defaultTime: 'HH:MM', defaultDurationMin: Number, noTimeAllDay: Boolean, now: Date }
// event: { type, title, location, allDay, start: {date,time}, end: {date,time}|null,
//          confidence: 'high'|'medium'|'low', source }
function parseBooking(text, opts = {}) {
  const defaults = {
    defaultTime: opts.defaultTime && /^\d{2}:\d{2}$/.test(opts.defaultTime) ? opts.defaultTime : '12:00',
    defaultDurationMin: clampInt(opts.defaultDurationMin, 5, 720, 30),
    noTimeAllDay: !!opts.noTimeAllDay,
    now: opts.now instanceof Date ? opts.now : new Date(),
  };

  const clean = String(text || '').replace(/\r/g, '');
  const lines = clean.split('\n');
  const events = [];
  const consumed = new Set(); // line indexes already turned into typed events

  collectHotel(lines, consumed, events, defaults);
  collectFlight(lines, consumed, events, defaults);
  collectTrain(lines, consumed, events, defaults);
  collectGeneric(lines, consumed, events, defaults);
  const survivors = dedupeNearDuplicates(events);

  // Sort chronologically and drop exact duplicates (same start+title).
  survivors.sort((a, b) => cmpStart(a, b));
  const seen = new Set();
  const unique = [];
  for (const ev of survivors) {
    const key = startKey(ev) + '|' + ev.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(ev);
  }
  return { events: unique };
}

// --- date / time primitives --------------------------------------------------

const MONTHS = {
  jan: 1, january: 1, januar: 1, enero: 1,
  fevr: 2, fevrier: 2, feb: 2, february: 2, februar: 2, febrero: 2,
  mar: 3, march: 3, marz: 3, marzo: 3, mars: 3,
  apr: 4, april: 4, abril: 4,
  may: 5, mai: 5, mayo: 5, maggio: 5,
  jun: 6, june: 6, juni: 6, junio: 6, giugno: 6,
  jul: 7, july: 7, juli: 7, julio: 7, luglio: 7,
  aug: 8, august: 8, agosto: 8, aout: 8,
  sep: 9, september: 9, sept: 9, septembre: 9, septiembre: 9, settembre: 9,
  oct: 10, october: 10, okt: 10, oktober: 10, octubre: 10, ottobre: 10,
  nov: 11, november: 11, noviembre: 11,
  dec: 12, december: 12, dez: 12, dezember: 12, diciembre: 12, dicembre: 12,
};

const MONTH_NAME_SRC = Object.keys(MONTHS)
  .sort((a, b) => b.length - a.length)
  .map(escapeRe)
  .join('|');

// Strip accents so "février"/"août" match the ASCII month keys.
function monthFromName(name) {
  const key = String(name).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return MONTHS[key] || 0;
}

// 2026-09-04 / 2026-9-4
const RE_ISO = /\b(20\d{2})-(0?[1-9]|1[0-2])-(0?[1-9]|[12]\d|3[01])\b/g;
// 04.09.2026 / 4.9.26 / 04/09/2026 / 9/4/2026 (separator-consistent)
const RE_NUMERIC = /\b(0?[1-9]|[12]\d|3[01])([.\/])(0?[1-9]|1[0-2])\2((?:20\d{2})|\d{2})\b/g;
// "Sep 4, 2026" / "September 4 2026" / "4 September 2026" / "4th of September"
// A bare 2-digit year must not swallow the hour of a following "11:30" time
// ("Jul 10\t11:30 PM" is July 10, not year 2011).
const YEAR_OPT = '((?:20\\d{2})|\\d{2}(?![\\d:]))?';
const RE_MONTH_FIRST = new RegExp(
  '\\b(' + MONTH_NAME_SRC + ')\\.?\\s+(0?[1-9]|[12]\\d|3[01])(?:st|nd|rd|th)?(?:,)?\\s*' + YEAR_OPT + '\\b', 'gi');
const RE_DAY_FIRST = new RegExp(
  '\\b(0?[1-9]|[12]\\d|3[01])(?:st|nd|rd|th)?\\.?(?:\\s+(?:of|de))?\\s+(' + MONTH_NAME_SRC + ')\\.?(?:,)?\\s*' + YEAR_OPT + '\\b', 'gi');

// 14:00 / 6:20 PM / 6 pm / 18h05 (fr) / 13∶10 (pdf.js often yields U+2236)
const RE_TIME_AMPM = /\b([01]?\d|2[0-3])(?::([0-5]\d))?\s*([ap])\.?\s?m\.?(?![a-z])/gi;
const RE_TIME_24H = /\b([01]?\d|2[0-3])[:∶]([0-5]\d)(?![\d:])/g;
const RE_TIME_H = /\b([01]?\d|2[0-3])h([0-5]\d)(?!\d)/g;

const pad2 = (n) => String(n).padStart(2, '0');
const dateKey = (d) => d.y + '-' + pad2(d.m) + '-' + pad2(d.d);
const timeKey = (t) => (t ? pad2(t.hh) + ':' + pad2(t.mm) : null);

// Collect every date candidate in a line with positions.
function findDates(line, now) {
  const out = [];
  const push = (m, y, mo, d, style) => {
    let year = y == null ? null : Number(y);
    if (year != null && year < 100) year += 2000;
    out.push({
      index: m.index,
      end: m.index + m[0].length,
      raw: m[0],
      y: year, m: Number(mo), d: Number(d),
      style,
    });
  };

  let m;
  const reIso = new RegExp(RE_ISO.source, 'g');
  while ((m = reIso.exec(line))) push(m, m[1], m[2], m[3], 'iso');

  const reNum = new RegExp(RE_NUMERIC.source, 'g');
  while ((m = reNum.exec(line))) {
    const first = Number(m[1]), second = Number(m[3]), year = m[4];
    let day, mon;
    if (m[2] === '.') {
      // Dot-separated is overwhelmingly EU style: day first.
      day = first; mon = second;
    } else if (first > 12) {
      // Slash-separated: if a > 12 it must be day-first; if b > 12 it must be
      // US-style month-first; ties go to US (largest booking-email market).
      day = first; mon = second;
    } else if (second > 12) {
      day = second; mon = first;
    } else {
      day = second; mon = first;
    }
    push(m, year, mon, day, 'numeric');
  }

  const reMF = new RegExp(RE_MONTH_FIRST.source, 'gi');
  while ((m = reMF.exec(line))) {
    const mon = monthFromName(m[1]);
    if (mon) push(m, m[3], mon, m[2], 'month-first');
  }

  const reDF = new RegExp(RE_DAY_FIRST.source, 'gi');
  while ((m = reDF.exec(line))) {
    const mon = monthFromName(m[2]);
    if (mon) push(m, m[3], mon, m[1], 'day-first');
  }

  // Overlaps (e.g. ISO also matching numeric) keep the first, drop overlaps.
  out.sort((a, b) => a.index - b.index);
  const kept = [];
  for (const c of out) {
    if (kept.length && c.index < kept[kept.length - 1].end) continue;
    if (!isValidDate(c, now)) continue;
    kept.push(c);
  }
  return kept;
}

function isValidDate(c, now) {
  if (!c.y) { c.y = inferYear(c, now); c.yearInferred = true; }
  if (c.m < 1 || c.m > 12 || c.d < 1 || c.d > 31) return false;
  const dt = new Date(c.y, c.m - 1, c.d);
  return dt.getFullYear() === c.y && dt.getMonth() === c.m - 1 && dt.getDate() === c.d;
}

// No year in source: current year; if that date already passed, next year.
function inferYear(c, now) {
  const y = now.getFullYear();
  const probe = new Date(y, c.m - 1, c.d);
  if (probe < new Date(y, now.getMonth(), now.getDate() - 1)) return y + 1;
  return y;
}

// Collect every time candidate in a line with positions.
function findTimes(line) {
  const out = [];
  let m;
  const reAp = new RegExp(RE_TIME_AMPM.source, 'gi');
  while ((m = reAp.exec(line))) {
    let hh = Number(m[1]);
    const ap = m[3].toLowerCase();
    if (ap === 'p' && hh < 12) hh += 12;
    if (ap === 'a' && hh === 12) hh = 0;
    out.push({ index: m.index, end: m.index + m[0].length, hh, mm: m[2] ? Number(m[2]) : 0, raw: m[0] });
  }
  const re24 = new RegExp(RE_TIME_24H.source, 'g');
  while ((m = re24.exec(line))) {
    out.push({ index: m.index, end: m.index + m[0].length, hh: Number(m[1]), mm: Number(m[2]), raw: m[0] });
  }
  const reH = new RegExp(RE_TIME_H.source, 'g');
  while ((m = reH.exec(line))) {
    out.push({ index: m.index, end: m.index + m[0].length, hh: Number(m[1]), mm: Number(m[2]), raw: m[0] });
  }
  out.sort((a, b) => a.index - b.index);
  const kept = [];
  for (const t of out) {
    if (kept.length && t.index < kept[kept.length - 1].end) continue;
    kept.push(t);
  }
  return kept;
}

// Nearest time to a date match within `window` chars, preferring "after".
function timeNear(line, dateMatch, window = 40) {
  const times = findTimes(line);
  if (!times.length) return null;
  let best = null, bestDist = Infinity;
  for (const t of times) {
    const dist = t.index >= dateMatch.end ? t.index - dateMatch.end : dateMatch.index - t.end;
    if (dist > window) continue;
    const score = dist + (t.index >= dateMatch.end ? 0 : 4); // prefer time after date
    if (score < bestDist) { bestDist = score; best = t; }
  }
  return best;
}

// --- event assembly -----------------------------------------------------------

function applyDefaults(ev, defaults) {
  if (!ev.start.time) {
    if (defaults.noTimeAllDay) {
      ev.allDay = true;
      if (ev.end) ev.end.time = null;
    } else {
      ev.start.time = defaults.defaultTime;
      ev.start.timeWasDefault = true;
    }
  }
  // Single moment with no explicit end -> default duration (unless all-day).
  if (!ev.allDay && ev.start.time && !ev.end) {
    const end = addMinutes(ev.start.time, defaults.defaultDurationMin);
    ev.end = { date: ev.start.date, time: end.time, dayShift: end.dayShift, timeWasDefault: true };
  }
  return ev;
}

function addMinutes(hhmm, mins) {
  const [h, m] = hhmm.split(':').map(Number);
  const total = h * 60 + m + mins;
  const day = Math.floor(total / 1440);
  const rem = ((total % 1440) + 1440) % 1440;
  return { time: pad2(Math.floor(rem / 60)) + ':' + pad2(rem % 60), dayShift: day };
}

// For timed events whose end time spilled past midnight, shift the end date.
function resolveEnd(ev) {
  if (ev.end && 'dayShift' in ev.end) {
    if (ev.end.dayShift) ev.end.date = shiftDate(ev.end.date, ev.end.dayShift);
    delete ev.end.dayShift;
  }
  return ev;
}

function shiftDate(key, days) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return dateKey({ y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() });
}

function mkEvent(partial) {
  return {
    type: partial.type || 'event',
    title: partial.title || 'Event',
    location: partial.location || '',
    tz: partial.tz || null,
    tzEnd: partial.tzEnd || null,
    allDay: !!partial.allDay,
    start: partial.start,
    end: partial.end || null,
    confidence: partial.confidence || 'medium',
    source: (partial.source || '').trim().slice(0, 400),
  };
}

function startKey(ev) {
  return ev.start.date + 'T' + (ev.start.time || '00:00');
}

function cmpStart(a, b) {
  return (startKey(a) < startKey(b) ? -1 : startKey(a) > startKey(b) ? 1 : 0);
}

function clampInt(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// --- timezone detection --------------------------------------------------------
// Events carry the venue timezone (hotel country, departure/arrival airport) so
// exports can render the booking in ITS timezone instead of the viewer's.
// Compact curated tables; unknown places fall back to floating local times.

const TZ_BY_IATA = {
  // Western Europe
  LHR:'Europe/London', LGW:'Europe/London', LTN:'Europe/London', STN:'Europe/London', MAN:'Europe/London', EDI:'Europe/London', BRS:'Europe/London',
  DUB:'Europe/Dublin', CDG:'Europe/Paris', ORY:'Europe/Paris', NCE:'Europe/Paris', LYS:'Europe/Paris', MRS:'Europe/Paris', TLS:'Europe/Paris',
  AMS:'Europe/Amsterdam', EIN:'Europe/Amsterdam', BRU:'Europe/Brussels', CRL:'Europe/Brussels',
  FRA:'Europe/Berlin', MUC:'Europe/Berlin', BER:'Europe/Berlin', DUS:'Europe/Berlin', HAM:'Europe/Berlin', CGN:'Europe/Berlin', SXF:'Europe/Berlin',
  ZRH:'Europe/Zurich', GVA:'Europe/Zurich', VIE:'Europe/Vienna', LUX:'Europe/Luxembourg',
  MAD:'Europe/Madrid', BCN:'Europe/Madrid', AGP:'Europe/Madrid', PMI:'Europe/Madrid', ALC:'Europe/Madrid', VLC:'Europe/Madrid',
  LIS:'Europe/Lisbon', OPO:'Europe/Lisbon', FAO:'Europe/Lisbon', FNC:'Europe/Lisbon', PDL:'Atlantic/Azores',
  FCO:'Europe/Rome', MXP:'Europe/Rome', LIN:'Europe/Rome', VCE:'Europe/Rome', NAP:'Europe/Rome', CTA:'Europe/Rome', PMO:'Europe/Rome', BLQ:'Europe/Rome',
  ATH:'Europe/Athens', SKG:'Europe/Athens', IST:'Europe/Istanbul', SAW:'Europe/Istanbul', AYT:'Europe/Istanbul',
  CPH:'Europe/Copenhagen', ARN:'Europe/Stockholm', OSL:'Europe/Oslo', HEL:'Europe/Helsinki', KEF:'Atlantic/Reykjavik',
  WAW:'Europe/Warsaw', KRK:'Europe/Warsaw', PRG:'Europe/Prague', BUD:'Europe/Budapest', OTP:'Europe/Bucharest', CLJ:'Europe/Bucharest', SOF:'Europe/Sofia',
  BEG:'Europe/Belgrade', ZAG:'Europe/Zagreb', SJJ:'Europe/Sarajevo', SKP:'Europe/Skopje', TIA:'Europe/Tirane', LJU:'Europe/Ljubljana',
  RIX:'Europe/Riga', VNO:'Europe/Vilnius', TLL:'Europe/Tallinn', KBP:'Europe/Kyiv', KIV:'Europe/Chisinau', SVO:'Europe/Moscow', DME:'Europe/Moscow', VKO:'Europe/Moscow', LED:'Europe/Moscow',
  MLA:'Europe/Malta', LCA:'Asia/Nicosia', JTR:'Europe/Athens', JMK:'Europe/Athens',
  // North America
  JFK:'America/New_York', EWR:'America/New_York', LGA:'America/New_York', BOS:'America/New_York', IAD:'America/New_York', DCA:'America/New_York',
  PHL:'America/New_York', MIA:'America/New_York', ATL:'America/New_York', TPA:'America/New_York', MCO:'America/New_York', CLT:'America/New_York',
  ORD:'America/Chicago', DFW:'America/Chicago', IAH:'America/Chicago', MSP:'America/Chicago', DTW:'America/Detroit', STL:'America/Chicago', MSY:'America/Chicago',
  DEN:'America/Denver', LAS:'America/Los_Angeles', LAX:'America/Los_Angeles', SFO:'America/Los_Angeles', SEA:'America/Los_Angeles', PDX:'America/Los_Angeles', SAN:'America/Los_Angeles',
  PHX:'America/Phoenix', SLC:'America/Denver', AUS:'America/Chicago',
  HNL:'Pacific/Honolulu', ANC:'America/Anchorage', SJU:'America/Puerto_Rico',
  YYZ:'America/Toronto', YVR:'America/Vancouver', YUL:'America/Montreal', YYC:'America/Edmonton', YOW:'America/Toronto',
  MEX:'America/Mexico_City', CUN:'America/Cancun', GDL:'America/Mexico_City', PTY:'America/Panama', SJO:'America/Costa_Rica', HAV:'America/Havana',
  // South America
  GRU:'America/Sao_Paulo', GIG:'America/Sao_Paulo', CGH:'America/Sao_Paulo', BSB:'America/Sao_Paulo', EZE:'America/Argentina/Buenos_Aires', AEP:'America/Argentina/Buenos_Aires',
  SCL:'America/Santiago', LIM:'America/Lima', BOG:'America/Bogota', MVD:'America/Montevideo', CCS:'America/Caracas', UIO:'America/Guayaquil', VVI:'America/La_Paz',
  // Middle East & Africa
  DXB:'Asia/Dubai', DWC:'Asia/Dubai', AUH:'Asia/Abu_Dhabi', SHJ:'Asia/Dubai', DOH:'Asia/Qatar', RUH:'Asia/Riyadh', JED:'Asia/Riyadh', DMM:'Asia/Riyadh',
  KWI:'Asia/Kuwait', BAH:'Asia/Bahrain', MCT:'Asia/Muscat', AMM:'Asia/Amman', TLV:'Asia/Jerusalem', BEY:'Asia/Beirut', IKA:'Asia/Tehran', BGW:'Asia/Baghdad',
  CAI:'Africa/Cairo', HRG:'Africa/Cairo', SSH:'Africa/Cairo', SPX:'Africa/Cairo', CMN:'Africa/Casablanca', RAK:'Africa/Casablanca', TUN:'Africa/Tunis', ALG:'Africa/Algiers',
  JNB:'Africa/Johannesburg', CPT:'Africa/Johannesburg', DUR:'Africa/Johannesburg', NBO:'Africa/Nairobi', ADD:'Africa/Addis_Ababa', LOS:'Africa/Lagos', ACC:'Africa/Accra', DAR:'Africa/Dar_es_Salaam',
  // Asia
  SIN:'Asia/Singapore', KUL:'Asia/Kuala_Lumpur', PEN:'Asia/Kuala_Lumpur', BKK:'Asia/Bangkok', DMK:'Asia/Bangkok', CNX:'Asia/Bangkok', HKT:'Asia/Bangkok', USM:'Asia/Bangkok', UTP:'Asia/Bangkok',
  SGN:'Asia/Ho_Chi_Minh', HAN:'Asia/Ho_Chi_Minh', DAD:'Asia/Ho_Chi_Minh', CXR:'Asia/Ho_Chi_Minh', PQC:'Asia/Ho_Chi_Minh', HUI:'Asia/Ho_Chi_Minh', VCA:'Asia/Ho_Chi_Minh',
  PNH:'Asia/Phnom_Penh', VTE:'Asia/Vientiane', RGN:'Asia/Yangon',
  CGK:'Asia/Jakarta', SUB:'Asia/Jakarta', DPS:'Asia/Makassar',
  MNL:'Asia/Manila', CEB:'Asia/Manila', HKG:'Asia/Hong_Kong', TPE:'Asia/Taipei', KHH:'Asia/Taipei', MFM:'Asia/Macau',
  PVG:'Asia/Shanghai', PEK:'Asia/Shanghai', PKX:'Asia/Shanghai', CAN:'Asia/Shanghai', SZX:'Asia/Shanghai', HGH:'Asia/Shanghai', CTU:'Asia/Shanghai', TFU:'Asia/Shanghai',
  KMG:'Asia/Shanghai', XIY:'Asia/Shanghai', CKG:'Asia/Shanghai', WUH:'Asia/Shanghai', TAO:'Asia/Shanghai', XMN:'Asia/Shanghai', CSX:'Asia/Shanghai',
  ICN:'Asia/Seoul', NRT:'Asia/Tokyo', HND:'Asia/Tokyo', KIX:'Asia/Tokyo', ITM:'Asia/Tokyo', CTS:'Asia/Tokyo', FUK:'Asia/Tokyo',
  DEL:'Asia/Kolkata', BOM:'Asia/Kolkata', MAA:'Asia/Kolkata', BLR:'Asia/Kolkata', HYD:'Asia/Kolkata', CCU:'Asia/Kolkata', COK:'Asia/Kolkata', GOI:'Asia/Kolkata',
  CMB:'Asia/Colombo', MLE:'Indian/Maldives', KTM:'Asia/Kathmandu', DAC:'Asia/Dhaka', ISB:'Asia/Karachi', KHI:'Asia/Karachi', LHE:'Asia/Karachi',
  TAS:'Asia/Tashkent', ALA:'Asia/Almaty', TBS:'Asia/Tbilisi', EVN:'Asia/Yerevan', GYD:'Asia/Baku', ULN:'Asia/Ulaanbaatar',
  // Oceania
  SYD:'Australia/Sydney', MEL:'Australia/Melbourne', BNE:'Australia/Brisbane', PER:'Australia/Perth', ADL:'Australia/Adelaide', CNS:'Australia/Brisbane', OOL:'Australia/Brisbane', DRW:'Australia/Darwin',
  AKL:'Pacific/Auckland', CHC:'Pacific/Auckland', WLG:'Pacific/Auckland', ZQN:'Pacific/Auckland', NAN:'Pacific/Fiji',
};

// Country/region words -> primary IANA zone (hotels rarely name the airport).
const TZ_BY_PLACE = {
  'singapore':'Asia/Singapore', 'hong kong':'Asia/Hong_Kong', 'macau':'Asia/Macau', 'taiwan':'Asia/Taipei', 'china':'Asia/Shanghai', 'chinese':'Asia/Shanghai',
  'japan':'Asia/Tokyo', 'tokyo':'Asia/Tokyo', 'osaka':'Asia/Tokyo', 'kyoto':'Asia/Tokyo',
  'south korea':'Asia/Seoul', 'korea':'Asia/Seoul', 'seoul':'Asia/Seoul',
  'thailand':'Asia/Bangkok', 'bangkok':'Asia/Bangkok', 'phuket':'Asia/Bangkok', 'chiang mai':'Asia/Bangkok', 'chiangmai':'Asia/Bangkok', 'krabi':'Asia/Bangkok', 'samui':'Asia/Bangkok', 'pattaya':'Asia/Bangkok',
  'vietnam':'Asia/Ho_Chi_Minh', 'viet nam':'Asia/Ho_Chi_Minh', 'ho chi minh':'Asia/Ho_Chi_Minh', 'saigon':'Asia/Ho_Chi_Minh', 'hanoi':'Asia/Ho_Chi_Minh', 'da nang':'Asia/Ho_Chi_Minh', 'danang':'Asia/Ho_Chi_Minh', 'nha trang':'Asia/Ho_Chi_Minh', 'hue':'Asia/Ho_Chi_Minh', 'phu quoc':'Asia/Ho_Chi_Minh',
  'malaysia':'Asia/Kuala_Lumpur', 'kuala lumpur':'Asia/Kuala_Lumpur', 'penang':'Asia/Kuala_Lumpur',
  'indonesia':'Asia/Jakarta', 'jakarta':'Asia/Jakarta', 'bali':'Asia/Makassar', 'denpasar':'Asia/Makassar',
  'philippines':'Asia/Manila', 'manila':'Asia/Manila', 'cebu':'Asia/Manila',
  'cambodia':'Asia/Phnom_Penh', 'laos':'Asia/Vientiane', 'myanmar':'Asia/Yangon', 'burma':'Asia/Yangon',
  'india':'Asia/Kolkata', 'delhi':'Asia/Kolkata', 'mumbai':'Asia/Kolkata', 'goa':'Asia/Kolkata',
  'maldives':'Indian/Maldives', 'sri lanka':'Asia/Colombo', 'nepal':'Asia/Kathmandu', 'bangladesh':'Asia/Dhaka', 'pakistan':'Asia/Karachi',
  'united arab emirates':'Asia/Dubai', 'uae':'Asia/Dubai', 'dubai':'Asia/Dubai', 'abu dhabi':'Asia/Abu_Dhabi',
  'saudi arabia':'Asia/Riyadh', 'qatar':'Asia/Qatar', 'doha':'Asia/Qatar', 'bahrain':'Asia/Bahrain', 'kuwait':'Asia/Kuwait', 'oman':'Asia/Muscat', 'muscat':'Asia/Muscat',
  'israel':'Asia/Jerusalem', 'jordan':'Asia/Amman', 'lebanon':'Asia/Beirut', 'iraq':'Asia/Baghdad', 'iran':'Asia/Tehran', 'turkey':'Europe/Istanbul', 'turkiye':'Europe/Istanbul', 'istanbul':'Europe/Istanbul',
  'egypt':'Africa/Cairo', 'cairo':'Africa/Cairo', 'morocco':'Africa/Casablanca', 'marrakech':'Africa/Casablanca', 'tunisia':'Africa/Tunis', 'algeria':'Africa/Algiers',
  'south africa':'Africa/Johannesburg', 'kenya':'Africa/Nairobi', 'tanzania':'Africa/Dar_es_Salaam', 'zanzibar':'Africa/Dar_es_Salaam', 'nigeria':'Africa/Lagos', 'ethiopia':'Africa/Addis_Ababa', 'ghana':'Africa/Accra',
  'united kingdom':'Europe/London', 'england':'Europe/London', 'scotland':'Europe/London', 'wales':'Europe/London', 'london':'Europe/London', 'edinburgh':'Europe/London', 'manchester':'Europe/London',
  'ireland':'Europe/Dublin', 'dublin':'Europe/Dublin', 'iceland':'Atlantic/Reykjavik', 'reykjavik':'Atlantic/Reykjavik',
  'portugal':'Europe/Lisbon', 'lisbon':'Europe/Lisbon', 'spain':'Europe/Madrid', 'madrid':'Europe/Madrid', 'barcelona':'Europe/Madrid', 'mallorca':'Europe/Madrid', 'ibiza':'Europe/Madrid', 'canary':'Atlantic/Canary', 'tenerife':'Atlantic/Canary',
  'france':'Europe/Paris', 'paris':'Europe/Paris', 'nice':'Europe/Paris', 'marseille':'Europe/Paris', 'monaco':'Europe/Monaco', 'monaco montecarlo':'Europe/Monaco',
  'belgium':'Europe/Brussels', 'netherlands':'Europe/Amsterdam', 'holland':'Europe/Amsterdam', 'amsterdam':'Europe/Amsterdam', 'luxembourg':'Europe/Luxembourg',
  'germany':'Europe/Berlin', 'berlin':'Europe/Berlin', 'munich':'Europe/Berlin', 'frankfurt':'Europe/Berlin', 'hamburg':'Europe/Berlin', 'cologne':'Europe/Berlin',
  'switzerland':'Europe/Zurich', 'zurich':'Europe/Zurich', 'geneva':'Europe/Zurich', 'austria':'Europe/Vienna', 'vienna':'Europe/Vienna',
  'italy':'Europe/Rome', 'rome':'Europe/Rome', 'roma':'Europe/Rome', 'milan':'Europe/Rome', 'milano':'Europe/Rome', 'venice':'Europe/Rome', 'venezia':'Europe/Rome', 'florence':'Europe/Rome', 'naples':'Europe/Rome', 'sicily':'Europe/Rome', 'sardinia':'Europe/Rome',
  'greece':'Europe/Athens', 'athens':'Europe/Athens', 'santorini':'Europe/Athens', 'mykonos':'Europe/Athens', 'cyprus':'Asia/Nicosia', 'malta':'Europe/Malta',
  'croatia':'Europe/Zagreb', 'serbia':'Europe/Belgrade', 'slovenia':'Europe/Ljubljana', 'bosnia':'Europe/Sarajevo', 'albania':'Europe/Tirane', 'north macedonia':'Europe/Skopje',
  'bulgaria':'Europe/Sofia', 'romania':'Europe/Bucharest', 'bucharest':'Europe/Bucharest', 'hungary':'Europe/Budapest', 'budapest':'Europe/Budapest',
  'poland':'Europe/Warsaw', 'warsaw':'Europe/Warsaw', 'krakow':'Europe/Warsaw', 'czech':'Europe/Prague', 'czechia':'Europe/Prague', 'prague':'Europe/Prague',
  'slovakia':'Europe/Bratislava', 'denmark':'Europe/Copenhagen', 'copenhagen':'Europe/Copenhagen', 'sweden':'Europe/Stockholm', 'stockholm':'Europe/Stockholm',
  'norway':'Europe/Oslo', 'oslo':'Europe/Oslo', 'finland':'Europe/Helsinki', 'estonia':'Europe/Tallinn', 'latvia':'Europe/Riga', 'lithuania':'Europe/Vilnius',
  'russia':'Europe/Moscow', 'moscow':'Europe/Moscow', 'ukraine':'Europe/Kyiv', 'kyiv':'Europe/Kyiv', 'kiev':'Europe/Kyiv', 'moldova':'Europe/Chisinau', 'georgia':'Asia/Tbilisi', 'armenia':'Asia/Yerevan', 'azerbaijan':'Asia/Baku',
  'usa':'America/New_York', 'united states':'America/New_York', 'united states of america':'America/New_York', 'new york':'America/New_York', 'boston':'America/New_York', 'miami':'America/New_York', 'orlando':'America/New_York', 'washington':'America/New_York',
  'chicago':'America/Chicago', 'houston':'America/Chicago', 'dallas':'America/Chicago', 'austin':'America/Chicago', 'seattle':'America/Los_Angeles', 'san francisco':'America/Los_Angeles', 'los angeles':'America/Los_Angeles', 'las vegas':'America/Los_Angeles', 'san diego':'America/Los_Angeles',
  'canada':'America/Toronto', 'toronto':'America/Toronto', 'vancouver':'America/Vancouver', 'montreal':'America/Montreal',
  'hawaii':'Pacific/Honolulu', 'honolulu':'Pacific/Honolulu', 'mexico':'America/Mexico_City', 'cancun':'America/Cancun', 'mexico city':'America/Mexico_City',
  'cuba':'America/Havana', 'dominican republic':'America/Santo_Domingo', 'jamaica':'America/Jamaica', 'puerto rico':'America/Puerto_Rico', 'costa rica':'America/Costa_Rica', 'panama':'America/Panama',
  'brazil':'America/Sao_Paulo', 'sao paulo':'America/Sao_Paulo', 'rio':'America/Sao_Paulo', 'rio de janeiro':'America/Sao_Paulo', 'argentina':'America/Argentina/Buenos_Aires', 'buenos aires':'America/Argentina/Buenos_Aires',
  'chile':'America/Santiago', 'peru':'America/Lima', 'lima':'America/Lima', 'colombia':'America/Bogota', 'bogota':'America/Bogota', 'uruguay':'America/Montevideo', 'ecuador':'America/Guayaquil', 'bolivia':'America/La_Paz', 'venezuela':'America/Caracas',
  'australia':'Australia/Sydney', 'sydney':'Australia/Sydney', 'melbourne':'Australia/Melbourne', 'brisbane':'Australia/Brisbane', 'perth':'Australia/Perth', 'adelaide':'Australia/Adelaide', 'gold coast':'Australia/Brisbane', 'cairns':'Australia/Brisbane',
  'new zealand':'Pacific/Auckland', 'auckland':'Pacific/Auckland', 'queenstown':'Pacific/Auckland', 'fiji':'Pacific/Fiji', 'mongolia':'Asia/Ulaanbaatar', 'uzbekistan':'Asia/Tashkent',
};

// Precompiled word-boundary matchers, longest key first ("ho chi minh" beats
// "minh"-ish fragments; "south korea" beats "korea"). Plain substring matching
// would let "rio" match inside "prior" — hence the \b boundaries.
const TZ_PLACE_LOOKUP = Object.keys(TZ_BY_PLACE)
  .sort((a, b) => b.length - a.length)
  .map((k) => ({ re: new RegExp('\\b' + escapeRe(k) + '\\b'), tz: TZ_BY_PLACE[k] }));

// First place word found in `text` -> IANA zone; null when nothing matches.
function tzFromText(text) {
  const t = String(text || '').toLowerCase();
  for (const entry of TZ_PLACE_LOOKUP) {
    if (entry.re.test(t)) return entry.tz;
  }
  return null;
}

// "LHR → JFK" / "SIN - OTP" -> { start, end } airport zones.
function tzFromRoute(route) {
  if (!route) return { start: null, end: null };
  var codes = (route.match(/\b[A-Z]{3}\b/g) || []).filter(function (c) { return TZ_BY_IATA[c]; });
  return {
    start: codes.length ? TZ_BY_IATA[codes[0]] : null,
    end: codes.length > 1 ? TZ_BY_IATA[codes[codes.length - 1]] : (codes.length ? TZ_BY_IATA[codes[0]] : null),
  };
}

// --- typed collectors -----------------------------------------------------------

const RE_CHECKIN = /\bcheck[\s-]?in\b|\bcheck[\s-]?in date\b|\barriv(al|e)\b|\banreise\b|\bcheck[\s-]?in time\b/i;
const RE_CHECKOUT = /\bcheck[\s-]?out\b|\bcheckout\b|\bdeparture\b|\babreise\b/i;

// Policy/legalese lines often contain real dates ("Cancel for free before
// July 7, 2026") but are never bookings — never anchor an event on them.
const RE_JUNK = /\b(?:cancel|cancellation|penalt|refund|no-show|policy)\b/i;
function isJunk(line) {
  return RE_JUNK.test(line);
}

// Common finalization: defaults, then roll same-date end times that are earlier
// than the start across midnight (overnight flights "23:30 -> 12:20+").
function finalizeEvent(ev, defaults) {
  resolveEnd(applyDefaults(ev, defaults));
  if (!ev.allDay && ev.end && ev.end.time && ev.end.date === ev.start.date && ev.end.time < ev.start.time) {
    ev.end.date = shiftDate(ev.start.date, 1);
  }
  return ev;
}

// First date at or below line `at` (within `span` lines), with its time taken
// from the date's own line or the next two lines (agoda tables, "Check in\n
// Friday July 10, 2026\n(after 2:00 PM)" layouts). Returns null when absent.
function dateWithTime(lines, at, span, now) {
  for (let i = at; i <= Math.min(at + span, lines.length - 1); i++) {
    if (isJunk(lines[i])) return null;
    const dates = findDates(lines[i], now);
    if (!dates.length) continue;
    const date = dates[0];
    let time = timeNear(lines[i], date);
    if (!time) {
      for (let j = i + 1; j <= Math.min(i + 2, lines.length - 1); j++) {
        const ts = findTimes(lines[j]);
        if (ts.length) { time = ts[0]; break; }
      }
    }
    return { date, time, line: i };
  }
  return null;
}

// Hotel: a check-in anchor line and a check-out anchor (or a second date on the
// same line). Handles keyword-line-above-dates layouts (Agoda, "Check in").
function collectHotel(lines, consumed, events, defaults) {
  for (let i = 0; i < lines.length; i++) {
    if (consumed.has(i)) continue;
    if (!RE_CHECKIN.test(lines[i]) || isJunk(lines[i])) continue;

    const found = dateWithTime(lines, i, 4, defaults.now);
    if (!found) continue;
    const datesOnLine = findDates(lines[found.line], defaults.now);
    // A flight itinerary's "Arrival 16:55, July 10, 2026" line also matches the
    // arrival keyword — only treat single-date lines as hotel check-ins when
    // there is no flight context. Two dates on the line is hotel-ish regardless.
    if (datesOnLine.length < 2 && flightIsh(lines, found.line)) continue;

    let outDate = null, outTime = null, lastLine = found.line;
    if (datesOnLine[1]) {
      outDate = datesOnLine[1];
      outTime = timeNear(lines[found.line], outDate);
      if (!outTime) {
        // Shared times row below ("After 14:00 Before 12:00"): check-in time
        // comes first, so the checkout takes the LAST one.
        const row = belowTimesRow(lines, found.line, 2);
        if (row) outTime = row.times[row.times.length >= 2 ? row.times.length - 1 : 0];
      }
    } else {
      for (let j = found.line + 1; j <= Math.min(found.line + 8, lines.length - 1); j++) {
        if (consumed.has(j) || isJunk(lines[j]) || !RE_CHECKOUT.test(lines[j])) continue;
        const out = dateWithTime(lines, j, 4, defaults.now);
        if (out) {
          outDate = out.date;
          outTime = out.time;
          lastLine = out.line;
        }
        break;
      }
    }
    if (!outDate) continue;

    for (let k = i; k <= lastLine; k++) consumed.add(k);

    const ev = mkEvent({
      type: 'hotel',
      title: hotelTitle(lines, found.line) || 'Hotel stay',
      location: hotelLocation(lines, found.line),
      tz: tzFromText(lines.slice(Math.max(0, found.line - 12), lastLine + 1).join(' ')),
      start: { date: dateKey(found.date), time: timeKey(found.time), inferred: !!found.date.yearInferred },
      end: { date: dateKey(outDate), time: timeKey(outTime) },
      confidence: (found.time || outTime) ? 'high' : 'medium',
      source: lines.slice(i, lastLine + 1).join('\n'),
    });
    if (ev.end.date < ev.start.date) { const t = ev.end.date; ev.end.date = ev.start.date; ev.start.date = t; }
    finalizeEvent(ev, defaults);
    events.push(ev);
    i = lastLine;
  }
}

// First line below `at` (within `span`) that carries times, with its times.
function belowTimesRow(lines, at, span) {
  for (let j = at + 1; j <= Math.min(at + span, lines.length - 1); j++) {
    const ts = findTimes(lines[j]);
    if (ts.length) return { line: j, times: ts };
  }
  return null;
}

function timeBelow(lines, at, span) {
  const row = belowTimesRow(lines, at, span);
  return row ? row.times[0] : null;
}

// "Grand Hotel Plaza" / "Kin Hotel Thi Sach Confirmed" / "Oxford Hotel" — pick
// the segment containing the hotel word, strip status suffixes. Hotel names
// often sit several lines above the check-in date, so scan up to 8 lines back;
// policy/legalese lines that merely contain the word "hotel" don't qualify.
function hotelTitle(lines, atLine) {
  for (let i = atLine; i >= Math.max(0, atLine - 10); i--) {
    if (isJunk(lines[i]) || lines[i].length > 100) continue;
    if (!/\b(hotel|resort|hostel|apartment|bnb|b&b|inn|lodge|suites?)\b/i.test(lines[i])) continue;
    const segments = lines[i].split(/[|\-–—·•:]|\s{2,}/);
    for (const seg of segments) {
      if (!/\b(hotel|resort|hostel|apartment|bnb|b&b|inn|lodge|suites?)\b/i.test(seg)) continue;
      const name = seg
        .replace(/\b(confirmed|cancelled|booked|reservation|booking)\b/gi, '')
        .replace(/[\s,:;|·•\-–—]+$/, '').trim();
      if (name) return 'Hotel: ' + name.slice(0, 60);
    }
    return lines[i].trim().split(/[|,·•]/)[0].slice(0, 60);
  }
  return null;
}

function hotelLocation(lines, atLine) {
  for (let i = Math.max(0, atLine - 8); i <= Math.min(atLine + 5, lines.length - 1); i++) {
    // Line contains a house number and a street-ish word ("218 Queen Street").
    if (/\d.*(?:street|st\b|road|rd\b|avenue|ave\b|boulevard|blvd|lane|ln\b|jalan|platz|stra(?:ss|ß)e)/i.test(lines[i])) {
      return lines[i].trim().slice(0, 80);
    }
  }
  return '';
}

const RE_FLIGHT_CTX = /\bflight\b|\bflt\b|\bair\b|airline|aviation|airways|departs?|departure|boarding|terminal|\bgate\b|\barriv|\bpnr\b/i;
const RE_TRAIN_KW = /\b(train|rail|eurostar|tgv|sncf|renfe|trenitalia)\b/i;
// Airline designators always contain a letter ("BA", "VJ", "B6", "F9") — a
// pure-digit pair like "2026" is a year, never a flight code. AM/PM (which sit
// right next to tab-separated times) are excluded explicitly.
const RE_FLIGHT_CODE = /\b(?!(?:AM|PM)\b)([A-Z][A-Z0-9]|[0-9][A-Z])\s?(\d{2,4}[A-Z]?)\b/;

// A date-bearing line is a flight candidate when flight vocabulary (or a flight
// code with supporting context) appears on it or within ±4 lines.
function flightIsh(lines, i) {
  for (let j = Math.max(0, i - 4); j <= Math.min(i + 4, lines.length - 1); j++) {
    if (RE_TRAIN_KW.test(lines[j])) return false;
    if (RE_FLIGHT_CTX.test(lines[j])) return true;
    if (RE_FLIGHT_CODE.test(lines[j])) {
      for (let k = Math.max(0, j - 3); k <= Math.min(j + 3, lines.length - 1); k++) {
        if (/\bflight\b|\bflt\b|airline|aviation|airways|\bair\b/i.test(lines[k])) return true;
      }
    }
  }
  return false;
}

// Flight: departure and arrival datetimes + optional flight number and route.
function collectFlight(lines, consumed, events, defaults) {
  for (let i = 0; i < lines.length; i++) {
    if (consumed.has(i)) continue;
    const line = lines[i];
    if (isJunk(line)) continue;
    const depDates = findDates(line, defaults.now);
    if (!depDates.length) continue;
    if (!flightIsh(lines, i)) continue;

    const depDate = depDates[0];
    let depTime = timeNear(line, depDate);
    let depLine = i;

    // Times often sit on their own lines under the date (itinerary tables);
    // keep scanning until the next date-bearing line so stacked layout blocks
    // ("Departing At: ... 17:15 18:30") still resolve.
    if (!depTime) {
      for (let j = i + 1; j <= Math.min(i + 14, lines.length - 1); j++) {
        if (findDates(lines[j], defaults.now).length) break;
        const ts = findTimes(lines[j]);
        if (ts.length) {
          depTime = ts[0];
          depLine = j;
          break;
        }
      }
    }

    // Arrival: second date on the line, second time on the line, an arrival
    // line below, or the next time-only line below the departure time.
    let arrDate = null, arrTime = null, arrLine = -1;
    const lineTimes = findTimes(line);
    if (depDates[1]) {
      arrDate = depDates[1];
      arrTime = timeNear(line, arrDate) || timeBelow(lines, i, 2);
      arrLine = i;
    } else if (lineTimes.length >= 2) {
      arrTime = pickSecondTime(line, depTime);
      arrDate = depDate;
      arrLine = i;
    }
    if (arrDate == null) {
      for (let j = i + 1; j <= Math.min(i + 6, lines.length - 1); j++) {
        if (consumed.has(j)) continue;
        if (/\barriv|lands?\b|arrival time/i.test(lines[j])) {
          const ds = findDates(lines[j], defaults.now);
          arrDate = ds[0] || depDate;
          arrTime = timeNear(lines[j], arrDate);
          arrLine = j;
          break;
        }
      }
    }
    if (arrDate == null && depTime && depLine !== i) {
      // Times came from a line below the date ("17:15 18:30") — a second time
      // on that same line is the arrival.
      const depLineTimes = findTimes(lines[depLine]);
      if (depLineTimes.length >= 2) {
        arrTime = pickSecondTime(lines[depLine], depTime);
        arrDate = depDate;
        arrLine = depLine;
      }
    }
    if (arrDate == null && depTime) {
      // Next standalone time after the departure-time line, before the next
      // date-bearing line (itinerary blocks like "10:25 / SIN / 20:15 / OTP").
      for (let j = depLine + 1; j <= Math.min(depLine + 8, lines.length - 1); j++) {
        if (consumed.has(j)) continue;
        if (findDates(lines[j], defaults.now).length) break;
        const ts = findTimes(lines[j]);
        if (ts.length) { arrTime = ts[0]; arrDate = depDate; arrLine = j; break; }
      }
    }

    for (let k = i; k <= Math.max(depLine, arrLine); k++) consumed.add(k);

    const num = flightNumber(lines, i);
    const route = routeOf(lines, i, Math.max(depLine, arrLine));
    let title = 'Flight';
    if (num && route) title = 'Flight ' + num + ': ' + route;
    else if (num) title = 'Flight ' + num;
    else if (route) title = 'Flight: ' + route;

    const ev = mkEvent({
      type: 'flight',
      title,
      location: routeOf(lines, i, -1, true) || '',
      tz: null,
      tzEnd: null,
      start: { date: dateKey(depDate), time: timeKey(depTime), inferred: !!depDate.yearInferred },
      end: arrDate ? { date: dateKey(arrDate), time: timeKey(arrTime) } : null,
      confidence: depTime ? 'high' : 'medium',
      source: lines.slice(i, Math.max(depLine, arrLine) + 1).join('\n'),
    });
    // Departure airport sets the start zone, arrival airport the end zone.
    // Without IATA codes, fall back to place words near the dep/arr lines.
    const flightTz = tzFromRoute(route);
    if (flightTz.start) {
      ev.tz = flightTz.start;
      ev.tzEnd = flightTz.end || flightTz.start;
    } else {
      ev.tz = tzFromText(lines.slice(i, depLine + 1).join(' '));
      ev.tzEnd = (arrLine >= 0 ? tzFromText(lines[arrLine]) : null) || ev.tz;
    }
    finalizeEvent(ev, defaults);
    events.push(ev);
    i = Math.max(i, Math.max(depLine, arrLine));
  }
}

function pickSecondTime(line, depTime) {
  const times = findTimes(line);
  for (const t of times) {
    if (!depTime || t.index !== depTime.index) return t;
  }
  return null;
}

function flightNumber(lines, atLine) {
  const from = Math.max(0, atLine - 7);
  const to = Math.min(lines.length - 1, atLine + 7);
  const ctx = lines.slice(from, to + 1).join(' ');
  if (!/\bflight\b|\bflt\b|airline|aviation|airways|\bair\b/i.test(ctx)) return null;
  // Nearest code wins: forward from the date line first, then backward, so a
  // neighbouring flight's number above can't shadow this one's.
  for (let i = atLine; i <= to; i++) {
    const m = lines[i].match(RE_FLIGHT_CODE);
    if (m) return m[1] + m[2];
  }
  for (let i = atLine - 1; i >= from; i--) {
    const m = lines[i].match(RE_FLIGHT_CODE);
    if (m) return m[1] + m[2];
  }
  return null;
}

// Route "From X to Y", "LHR → JFK" via standalone all-caps 3-letter tokens, or
// an all-caps code pair like "DMK CNX" (itinerary tables). Month abbreviations
// ("JAN 2026") are never IATA codes. Lines are checked own-line-first, then
// arrival-side, then above — a table row must not inherit the previous row's
// route.
function routeOf(lines, atLine, arrLine, startOnly) {
  const lo = Math.max(0, atLine - 4);
  const hi = Math.min(lines.length - 1, arrLine >= 0 ? arrLine : atLine);
  const order = [];
  for (let i = atLine; i <= hi; i++) order.push(i);
  for (let i = atLine - 1; i >= lo; i--) order.push(i);
  for (const idx of order) {
    const l = lines[idx];
    const m = l.match(/from\s+([A-Za-z .,'’\-()]{2,40}?)\s+to\s+([A-Za-z .,'’\-()]{2,40}?)(?:\s|$|[,.;])/i);
    if (m) return m[1].trim() + ' → ' + m[2].trim();
    const codes = (l.match(/\b[A-Z]{3}\b/g) || []).filter((c) => !MONTHS[c.toLowerCase()]);
    // Arrowed routes need 2+ codes with an explicit separator; a fully
    // uppercase, digit-free line ("DMK CNX") is an itinerary route row.
    if (codes.length >= 2 && /[→\-–—]|\bto\b/i.test(l)) {
      return codes[0] + ' → ' + codes[codes.length - 1];
    }
    if (codes.length >= 2 && /^[^a-z\d]*$/.test(l.trim())) {
      return codes[0] + ' → ' + codes[codes.length - 1];
    }
    if (startOnly) {
      const one = l.match(/\bfrom\s+([A-Za-z .,'’\-()]{2,40}?)(?:\s+to\b|$|,)/i);
      if (one) return one[1].trim();
    }
  }
  return null;
}

const RE_TRAIN = /\btrain\b|\brail\b|\beurostar\b|\btgv\b|\bice\b|\bsncf\b|\bdb\b|\brenfe\b|\btrenitalia\b|\bplatform\b/i;

function collectTrain(lines, consumed, events, defaults) {
  for (let i = 0; i < lines.length; i++) {
    if (consumed.has(i)) continue;
    const line = lines[i];
    if (!RE_TRAIN.test(line)) continue;
    const dates = findDates(line, defaults.now);
    if (!dates.length) continue;
    const date = dates[0];
    const times = findTimes(line);

    let startTime = times[0] || null;
    let endTime = times[1] || null;
    let arrLine = -1;
    if (!endTime) {
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        if (consumed.has(j) || !/arriv|arrival time/i.test(lines[j])) continue;
        const t2 = findTimes(lines[j]);
        if (t2.length) { endTime = t2[0]; arrLine = j; break; }
      }
    }

    consumed.add(i);
    if (arrLine >= 0) consumed.add(arrLine);

    const route = routeOf(lines, i, arrLine);
    const ev = mkEvent({
      type: 'train',
      title: route ? 'Train: ' + route : (lines[i].trim().split(/[|,·•]/)[0].slice(0, 60) || 'Train'),
      tz: tzFromText(lines.slice(i, Math.max(i, arrLine) + 1).join(' ')),
      start: { date: dateKey(date), time: timeKey(startTime), inferred: !!date.yearInferred },
      end: endTime ? { date: dateKey(date), time: timeKey(endTime) } : null,
      confidence: startTime ? 'high' : 'medium',
      source: lines[i] + (arrLine > i ? '\n' + lines[arrLine] : ''),
    });
    finalizeEvent(ev, defaults);
    events.push(ev);
    i = Math.max(i, arrLine);
  }
}

// Generic: any remaining date becomes an event. Two dates or two times on the
// line make a range; a nearby label line supplies the title ("Show Name ...").
function collectGeneric(lines, consumed, events, defaults) {
  for (let i = 0; i < lines.length; i++) {
    if (consumed.has(i)) continue;
    const line = lines[i];
    if (isJunk(line)) continue;
    const dates = findDates(line, defaults.now);
    if (!dates.length) continue;
    const date = dates[0];
    const time = timeNear(line, date) || timeBelow(lines, i, 3);

    let ev;
    if (dates[1]) {
      // "Nov 23, 2026 ... Nov 25, 2026" on one line without a keyword anchor.
      const t2 = timeNear(line, dates[1]);
      ev = mkEvent({
        type: 'event',
        title: lineTitle(lines, i),
        tz: tzFromText(line),
        start: { date: dateKey(date), time: timeKey(time), inferred: !!date.yearInferred },
        end: { date: dateKey(dates[1]), time: timeKey(t2) },
        confidence: time ? 'high' : 'medium',
        source: line,
      });
    } else {
      const secondTime = time && pickSecondTime(line, time);
      const evLocation = nearbyLabel(lines, i, /venue|address|location|where/i);
      ev = mkEvent({
        type: 'event',
        title: lineTitle(lines, i),
        location: evLocation,
        tz: tzFromText(line + ' ' + evLocation),
        start: { date: dateKey(date), time: timeKey(time), inferred: !!date.yearInferred },
        end: secondTime ? { date: dateKey(date), time: timeKey(secondTime) } : null,
        confidence: time ? 'medium' : 'low',
        source: line,
      });
    }
    finalizeEvent(ev, defaults);
    events.push(ev);
  }
}

// Near-duplicate collapse: itinerary PDFs often repeat one leg on several
// lines — a summary row with the explicit year and a detail row with the flight
// number but a year-inferred date. Same-type events sharing a month/day merge
// into the most informative single event (two rich titles must share a route).
function dedupeNearDuplicates(events) {
  const drop = new Set();
  for (let a = 0; a < events.length; a++) {
    const A = events[a];
    if (drop.has(A)) continue;
    if (A.type !== 'flight' && A.type !== 'train') continue;
    const richA = /: /.test(A.title);
    for (let b = a + 1; b < events.length; b++) {
      const B = events[b];
      if (drop.has(B) || B.type !== A.type) continue;
      if (B.start.date.slice(5) !== A.start.date.slice(5)) continue;
      const richB = /: /.test(B.title);
      if (richA && richB) {
        const ra = A.title.split(': ').slice(1).join(': ');
        const rb = B.title.split(': ').slice(1).join(': ');
        if (ra !== rb) continue;
      }
      // Keep the richer title; inherit the better date/time from the other.
      const score = (ev) =>
        (/: /.test(ev.title) ? 1 : 0) +
        (/Flight [A-Z][A-Z0-9]?\d|Train [A-Z][A-Z0-9]?\d/.test(ev.title) ? 1 : 0) +
        (ev.title.length > 12 ? 1 : 0);
      const keep = score(A) >= score(B) ? A : B;
      const other = keep === A ? B : A;
      drop.add(other);
      if (keep.start.inferred && !other.start.inferred) {
        const oldStart = keep.start.date;
        keep.start.date = other.start.date;
        delete keep.start.inferred;
        if (keep.end) {
          // Shift the end along with the corrected start (same day-delta).
          const p = oldStart.split('-').map(Number);
          const q = keep.start.date.split('-').map(Number);
          const delta = Math.round((new Date(q[0], q[1] - 1, q[2]) - new Date(p[0], p[1] - 1, p[2])) / 86400000);
          if (delta) keep.end.date = shiftDate(keep.end.date, delta);
        }
      }
      if (keep.start.timeWasDefault && !other.start.timeWasDefault) {
        keep.start.time = other.start.time;
        keep.end = other.end;
        delete keep.start.timeWasDefault;
      }
      if (!keep.tz && other.tz) keep.tz = other.tz;
      if (!keep.tzEnd && other.tzEnd) keep.tzEnd = other.tzEnd;
      if (!keep.location && other.location) keep.location = other.location;
      delete keep.start.timeWasDefault;
      if (keep.end) delete keep.end.timeWasDefault;
      keep.confidence = 'high';
    }
  }
  return events.filter((ev) => !drop.has(ev));
}

// Value of a "Label: value" / "Label\tvalue" line near `atLine` ("Venue",
// "Address", "Show Name"). Falls back to the line after the label.
function nearbyLabel(lines, atLine, re) {
  for (let i = Math.max(0, atLine - 4); i <= Math.min(atLine + 4, lines.length - 1); i++) {
    if (!re.test(lines[i])) continue;
    const m = lines[i].match(/^[^:]*?(?:venue|address|location|where|show name|event name|title|name)\s*[:\t]\s*(.+)$/i);
    if (m && m[1].trim()) return m[1].trim().slice(0, 80);
    for (let j = i + 1; j <= Math.min(i + 3, lines.length - 1); j++) {
      const t = lines[j].trim();
      if (t && !findDates(t, new Date()).length) return t.split(/[|,·•]/)[0].slice(0, 80);
    }
  }
  return '';
}

function lineTitle(lines, atLine) {
  // Prefer an explicit label value ("Show Name A O SHOW").
  const labelled = nearbyLabel(lines, atLine, /show name|event name|\btitle\b|\bname\b/i);
  if (labelled) return labelled;
  const line = lines[atLine].trim();
  // Prefer the line itself stripped of the date/time fragments.
  const stripped = line
    .replace(new RegExp(RE_ISO.source, 'g'), '')
    .replace(new RegExp(RE_NUMERIC.source, 'g'), '')
    .replace(new RegExp(RE_MONTH_FIRST.source, 'gi'), '')
    .replace(new RegExp(RE_DAY_FIRST.source, 'gi'), '')
    .replace(new RegExp(RE_TIME_AMPM.source, 'gi'), '')
    .replace(new RegExp(RE_TIME_24H.source, 'g'), '')
    .replace(/[\s,:;|·•\-–—]+$/, '')
    .replace(/^\s*(?:at|on|um|am)\s+/i, '')
    .replace(/[\s,:;|·•\-–—]+$/, '')
    .trim();
  if (stripped.length >= 3) return stripped.slice(0, 80);
  // Fall back to a nearby non-empty line that looks like a heading.
  for (let i = atLine - 1; i >= Math.max(0, atLine - 3); i--) {
    const t = lines[i].trim();
    if (t.length >= 3 && !findDates(t, new Date()).length) return t.split(/[|,·•]/)[0].slice(0, 80);
  }
  for (let i = atLine + 1; i <= Math.min(lines.length - 1, atLine + 3); i++) {
    const t = lines[i].trim();
    if (t.length >= 3 && !findDates(t, new Date()).length) return t.split(/[|,·•]/)[0].slice(0, 80);
  }
  return 'Event';
}
var BTCParser = { parseBooking: parseBooking };
