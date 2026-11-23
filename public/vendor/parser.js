// bookingtocal — deterministic booking parser. Classic script exposing
// BTCParser; depends on BTCGeo (geo.js) and BTCTz (tz.js). Pure functions, no
// DOM: the same file runs in the browser and under node for the fixture tests.
// Booking text never leaves the page where this runs.
//
// Pipeline, per document:
//   1. prepare()      split into lines; find dates, times and what each time is
//                     (departure / arrival / boarding) from inline labels and
//                     table headers; mark policy text and bookkeeping dates.
//   2. collectors     ground transport, flights, deadlines, hotels, then
//                     leftover dated lines as generic events. Each consumes the
//                     lines it used so the next collector cannot re-read them.
//   3. mergeEvents()  the same trip seen in several documents becomes one event.
//   4. finalize()     titles, venue timezones, estimated arrivals, defaults.
//
// Dates are wall-clock values in the VENUE's timezone (ev.tz / ev.tzEnd); the
// exporters convert them to UTC. Unknown zones stay floating.
var BTCParser = (function () {
  'use strict';

  const G = BTCGeo;
  const TZ = BTCTz;

  // --- public API ---------------------------------------------------------------

  // parseBooking(text, opts) -> { events }
  // opts: { defaultTime 'HH:MM', defaultDurationMin, noTimeAllDay, hotelAllDay, now: Date }
  function parseBooking(text, opts) {
    return parseDocuments([{ name: '', text: text }], opts);
  }

  // parseDocuments([{ name, text }], opts) -> { events }
  // Each event lists the documents it came from in ev.sources.
  function parseDocuments(docs, opts) {
    const defaults = normaliseOptions(opts);
    let all = [];
    for (const doc of docs || []) {
      for (const section of splitSections(doc.text)) {
        const events = parseSection(section, defaults);
        for (const ev of events) ev.sources = doc.name ? [doc.name] : [];
        all = all.concat(events);
      }
    }
    const events = mergeEvents(all);
    for (const ev of events) finalize(ev, defaults);
    events.sort(cmpStart);
    const seen = new Set();
    return {
      events: events.filter((ev) => {
        const key = startKey(ev) + '|' + ev.title.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }),
    };
  }

  function normaliseOptions(opts) {
    opts = opts || {};
    return {
      defaultTime: /^\d{2}:\d{2}$/.test(opts.defaultTime || '') ? opts.defaultTime : '12:00',
      defaultDurationMin: clampInt(opts.defaultDurationMin, 5, 720, 30),
      noTimeAllDay: !!opts.noTimeAllDay,
      hotelAllDay: opts.hotelAllDay !== false,
      now: opts.now instanceof Date ? opts.now : new Date(),
    };
  }

  // A line of only dashes/equals separates unrelated bookings pasted together.
  function splitSections(text) {
    return String(text || '').replace(/\r/g, '').split(/\n[ \t]*[-=_*]{3,}[ \t]*(?=\n)/).filter((s) => s.trim());
  }

  function parseSection(text, defaults) {
    const doc = prepare(text, defaults);
    const events = [];
    collectGround(doc, events);
    collectFlights(doc, events);
    const deadlines = collectDeadlines(doc, events);
    if (!deadlines) collectHotels(doc, events, defaults);
    collectGeneric(doc, events, defaults);
    return events;
  }

  // --- small utilities --------------------------------------------------------------

  const pad2 = (n) => String(n).padStart(2, '0');
  const dateKey = (d) => d.y + '-' + pad2(d.m) + '-' + pad2(d.d);
  const timeKey = (t) => (t ? pad2(t.hh) + ':' + pad2(t.mm) : null);
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const startKey = (ev) => ev.start.date + 'T' + (ev.start.time || '00:00');
  const cmpStart = (a, b) => (startKey(a) < startKey(b) ? -1 : startKey(a) > startKey(b) ? 1 : 0);

  function clampInt(v, min, max, fallback) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
  }

  function shiftDate(key, days) {
    const p = key.split('-').map(Number);
    const dt = new Date(p[0], p[1] - 1, p[2] + days);
    return dateKey({ y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() });
  }

  function addMinutes(hhmm, mins) {
    const p = hhmm.split(':').map(Number);
    const total = p[0] * 60 + p[1] + mins;
    const rem = ((total % 1440) + 1440) % 1440;
    return { time: pad2(Math.floor(rem / 60)) + ':' + pad2(rem % 60), dayShift: Math.floor(total / 1440) };
  }

  // --- dates ----------------------------------------------------------------------

  const MONTHS = {
    jan: 1, january: 1, januar: 1, enero: 1, janvier: 1, ianuarie: 1, ian: 1, gennaio: 1, janeiro: 1,
    feb: 2, february: 2, februar: 2, febrero: 2, fevrier: 2, fevr: 2, februarie: 2, febbraio: 2, fevereiro: 2,
    mar: 3, march: 3, marz: 3, marzo: 3, mars: 3, martie: 3, maart: 3, marco: 3,
    apr: 4, april: 4, abril: 4, avril: 4, aprilie: 4, aprile: 4,
    may: 5, mai: 5, mayo: 5, maggio: 5, mei: 5, maio: 5,
    jun: 6, june: 6, juni: 6, junio: 6, giugno: 6, juin: 6, iunie: 6, iun: 6, junho: 6,
    jul: 7, july: 7, juli: 7, julio: 7, luglio: 7, juillet: 7, iulie: 7, iul: 7, julho: 7,
    aug: 8, august: 8, agosto: 8, aout: 8, augustus: 8,
    sep: 9, sept: 9, september: 9, septembre: 9, septiembre: 9, settembre: 9, septembrie: 9, setembro: 9,
    oct: 10, october: 10, okt: 10, oktober: 10, octubre: 10, ottobre: 10, octobre: 10, octombrie: 10, outubro: 10,
    nov: 11, november: 11, noviembre: 11, novembre: 11, noiembrie: 11, novembro: 11,
    dec: 12, december: 12, dez: 12, dezember: 12, diciembre: 12, dicembre: 12, decembre: 12, decembrie: 12, dezembro: 12,
  };
  const MONTH_SRC = Object.keys(MONTHS).sort((a, b) => b.length - a.length).map(escapeRe).join('|');
  const monthFromName = (name) => MONTHS[G.norm(name)] || 0;

  const WEEKDAYS = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

  // A year is 4 digits, or 2 digits not running into a clock time ("Jul 10
  // 11:30 PM" is July 10, not 2011).
  const YEAR = '((?:19|20)\\d{2}|\\d{2}(?![\\d:]))';
  const DAY = '(0?[1-9]|[12]\\d|3[01])';
  const RE_ISO = new RegExp('\\b((?:19|20)\\d{2})-(0?[1-9]|1[0-2])-' + DAY + '(?!\\d)', 'g');
  // 04.09.2026 / 4/9/26 — which side is the day is decided per document.
  const RE_NUMERIC = new RegExp('\\b' + DAY + '([./])' + DAY + '\\2' + YEAR + '(?!\\d)', 'g');
  // "Sep 4, 2026" / "September 4" / "Nov11"
  const RE_MONTH_FIRST = new RegExp(
    '\\b(' + MONTH_SRC + ')(?![a-z])\\.?\\s{0,2}' + DAY + '(?:st|nd|rd|th)?(?![\\d:])(?:,)?\\s*' + YEAR + '?', 'gi');
  // "4 September 2026" / "4th of September" / "28JAN" / "15Nov2026" / "21 / Jun / 2025"
  const RE_DAY_FIRST = new RegExp(
    '(?<![\\d:.])' + DAY + '(?:st|nd|rd|th)?\\.?(?:\\s+(?:of|de)\\s+|\\s{0,2}[/\\-.]?\\s{0,2})(' + MONTH_SRC + ')(?![a-z])\\.?,?' +
    '(?:\\s{0,2}[/\\-.]?\\s{0,2}' + YEAR + ')?', 'gi');

  // Every date in a line, with positions. ctx: { now, dayFirst }.
  function findDates(line, ctx) {
    const found = [];
    const add = (m, y, mo, d) => found.push({ index: m.index, end: m.index + m[0].length, y: y == null ? null : Number(y), m: Number(mo), d: Number(d) });
    let m;
    const iso = new RegExp(RE_ISO.source, 'g');
    while ((m = iso.exec(line))) add(m, m[1], m[2], m[3]);
    const num = new RegExp(RE_NUMERIC.source, 'g');
    while ((m = num.exec(line))) {
      const a = Number(m[1]), b = Number(m[3]);
      // Dots are day-first (EU). Slashes: a value above 12 settles it; otherwise
      // the document-wide hint, then US month-first.
      const dayFirst = m[2] === '.' || a > 12 || (b <= 12 && ctx.dayFirst === true);
      add(m, m[4], dayFirst ? b : a, dayFirst ? a : b);
    }
    const mf = new RegExp(RE_MONTH_FIRST.source, 'gi');
    while ((m = mf.exec(line))) add(m, m[3], monthFromName(m[1]), m[2]);
    const df = new RegExp(RE_DAY_FIRST.source, 'gi');
    while ((m = df.exec(line))) add(m, m[3], monthFromName(m[2]), m[1]);

    found.sort((a, b) => a.index - b.index || b.end - a.end);
    const kept = [];
    for (const c of found) {
      if (kept.length && c.index < kept[kept.length - 1].end) continue;
      if (!resolveYear(c, line, ctx.now)) continue;
      kept.push(c);
    }
    return kept;
  }

  // Fill in / validate the year. Returns false for impossible dates. A stated
  // year more than five years back marks a birth date or old paperwork — the
  // date is kept (so nothing re-reads its digits) but flagged `stale`.
  function resolveYear(c, line, now) {
    if (c.m < 1 || c.m > 12) return false;
    const thisYear = now.getFullYear();
    if (c.y != null && c.y < 100) {
      const y = 2000 + c.y;
      c.y = y >= thisYear - 2 && y <= thisYear + 3 ? y : null; // "12 Oct 20 kg" is not 2020
    }
    if (c.y == null) {
      const weekday = weekdayNear(line, c);
      c.y = inferYear(c, weekday, now);
      c.yearInferred = weekday == null ? 'guess' : 'weekday';
    }
    const dt = new Date(c.y, c.m - 1, c.d);
    if (dt.getFullYear() !== c.y || dt.getMonth() !== c.m - 1 || dt.getDate() !== c.d) return false;
    if (c.y < thisYear - 5) c.stale = true;
    return true;
  }

  // "Tue 28 Jan" / "Sun-15Nov" / "14 July Tuesday" -> 0..6, or null.
  function weekdayNear(line, c) {
    const before = line.slice(Math.max(0, c.index - 14), c.index).match(/(sun|mon|tue|wed|thu|fri|sat)[a-z]*[\s,.\-·•]*$/i);
    if (before) return WEEKDAYS[before[1].toLowerCase()];
    const after = line.slice(c.end, c.end + 12).match(/^[\s,]*(sun|mon|tue|wed|thu|fri|sat)[a-z]*\b/i);
    return after ? WEEKDAYS[after[1].toLowerCase()] : null;
  }

  // No year in the source. A weekday pins it: the matching year closest to
  // today. Otherwise the next occurrence — except that a date within the last
  // 45 days is read as this year's (someone filing a trip they just took).
  function inferYear(c, weekday, now) {
    const y = now.getFullYear();
    const today = new Date(y, now.getMonth(), now.getDate());
    if (weekday != null) {
      let best = null, bestDist = Infinity;
      for (let cand = y - 3; cand <= y + 3; cand++) {
        const dt = new Date(cand, c.m - 1, c.d);
        if (dt.getMonth() !== c.m - 1 || dt.getDay() !== weekday) continue;
        const dist = Math.abs(dt - today) - (dt >= today ? 1 : 0); // ties go to the future
        if (dist < bestDist) { bestDist = dist; best = cand; }
      }
      if (best != null) return best;
    }
    const daysAgo = (today - new Date(y, c.m - 1, c.d)) / 86400000;
    return daysAgo > 45 ? y + 1 : y;
  }

  // --- times ----------------------------------------------------------------------

  // 14:00 / 6:20 PM / 6 pm / 18h05 / 13∶10 (pdf.js sometimes yields U+2236)
  const RE_TIME_AMPM = /(?<![\d:])([01]?\d|2[0-3])(?:[:.]([0-5]\d))?\s?([ap])\.?\s?m\.?(?![a-z])/gi;
  const RE_TIME_24H = /(?<![\d:])([01]?\d|2[0-3])[:∶]([0-5]\d)(?::[0-5]\d)?(?![\d:])/g;
  const RE_TIME_H = /(?<![\d:])([01]?\d|2[0-3])h([0-5]\d)(?![\dm])/g;
  // "Flight time: 02:15" and "Duration 1:30" are lengths, not clock times.
  const RE_DURATION_LABEL = /(?:flight time|duration|durata|dur[ée]e|journey time|travel time|total time)\s*:?\s*$/i;

  function findTimes(line) {
    const out = [];
    const add = (m, hh, mm) => {
      if (RE_DURATION_LABEL.test(line.slice(0, m.index))) return;
      out.push({ index: m.index, end: m.index + m[0].length, hh: hh, mm: mm, key: pad2(hh) + ':' + pad2(mm) });
    };
    let m;
    const ap = new RegExp(RE_TIME_AMPM.source, 'gi');
    while ((m = ap.exec(line))) {
      let hh = Number(m[1]);
      const pm = m[3].toLowerCase() === 'p';
      if (hh > 12) continue;
      if (pm && hh < 12) hh += 12;
      if (!pm && hh === 12) hh = 0;
      add(m, hh, m[2] ? Number(m[2]) : 0);
    }
    const h24 = new RegExp(RE_TIME_24H.source, 'g');
    while ((m = h24.exec(line))) add(m, Number(m[1]), Number(m[2]));
    const hh = new RegExp(RE_TIME_H.source, 'g');
    while ((m = hh.exec(line))) add(m, Number(m[1]), Number(m[2]));
    out.sort((a, b) => a.index - b.index || b.end - a.end);
    const kept = [];
    for (const t of out) if (!kept.length || t.index >= kept[kept.length - 1].end) kept.push(t);
    return kept;
  }

  // --- document preparation ------------------------------------------------------------

  // Policy / legalese lines often contain real dates ("Cancel for free before
  // 7 July") but are never bookings.
  const RE_POLICY = /\b(?:cancel|cancellation|penalt\w*|refund\w*|no-show|policy|polic(?:ies)|terms and conditions|non-refundable)\b/i;
  // Opening hours and contact lines: their times are not travel times.
  const RE_OFFICE = /^\s*(?:hours|tel|fax|phone|address|opening hours)\b|\bmon\s?[–-]\s?(?:fri|sat|sun)\b|\bpublic holidays\b|\bavailable 24\/7\b|\bdaily\b|\bholidays:/i;
  // Bookkeeping dates: when it was booked, paid, printed, born — never when the
  // trip happens. Matched against the text right before a date.
  const META_SRC = '(?:booked(?: on)?|booking date|date of booking|buy date|purchase date|purchased(?: on)?|date of purchase|' +
    'issued(?: on)?|issue date|date of issue|issuing date|payment date|paid(?: on)?|generated(?: on)?|last updated(?: on)?|' +
    'updated(?: on)?|printed(?: on)?|print date|date of birth|birth ?date|born|dob|expiry date|expiry|expires(?: on)?|' +
    'expiration(?: date)?|invoice date|order date|ordered(?: on)?|created(?: on)?|reservation date|transaction date|' +
    'data cump[aă]r[aă]rii|data emiterii|emis(?: la)?|receipt)';
  const RE_META_BEFORE = new RegExp('\\b' + META_SRC + '\\s*[:\\-]?\\s*(?:[a-z]{3,9}[,\\-\\s]*)?$', 'i');
  const RE_META_LINE = new RegExp('\\b' + META_SRC + '\\b', 'i');

  // What a clock time is, from the words next to it or the column header above.
  // 'other' covers gate/security/check-in deadlines: recognised so they are not
  // mistaken for the departure.
  const ROLE_PATTERNS = [
    ['other', /arrive at the airport|security check|clear security(?: by)?|\bsecurity\b|gate clos\w*|check-?in (?:opens?|closes?|counters?)|bag drop|\bopens\b|\bcloses\b/gi],
    // A bare "Gate" column usually holds a gate number, sometimes a time.
    ['gate', /\bgate\b/gi],
    ['board', /\bboard(?:ing|s)?\b(?!\s*(?:pass|card|group|gate|zone|door|using))(?: time| at)?|gi[oờ] ra m[aá]y bay|\bembarque(?:ment)?\b/gi],
    ['dep', /(?:\bplane )?\bdepart(?:ure|s|ing)?\b(?!\s*(?:date|airport|terminal|city|of\b))(?: time| at)?|\bdep\b(?!\s*\/)|\bplecare\b|\babflug\b|\btake-?off\b/gi],
    ['arr', /\barriv(?:al|es|e|ing)?\b(?!\s*(?:date|airport|terminal|city))(?: time| at)?|\barr\b|\bsosire\b|\bankunft\b|\blanding\b|\blands\b/gi],
  ];

  function labelsIn(text) {
    const hits = [];
    for (const [role, re] of ROLE_PATTERNS) {
      const g = new RegExp(re.source, 'gi');
      let m;
      while ((m = g.exec(text))) {
        if (!m[0]) { g.lastIndex++; continue; }
        hits.push({ role: role, index: m.index, end: m.index + m[0].length });
      }
    }
    hits.sort((a, b) => a.index - b.index || (b.end - b.index) - (a.end - a.index));
    const kept = [];
    for (const h of hits) if (!kept.length || h.index >= kept[kept.length - 1].end) kept.push(h);
    return kept;
  }

  // OCR reads the digits of a short date as letters: "Nov1l" is Nov 11.
  const RE_OCR_DAY = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)(\s?)([0-9lI|O]{1,2})(?![A-Za-z0-9])/gi;
  function repairOcr(line) {
    return line.replace(RE_OCR_DAY, (all, mon, gap, day) =>
      (/\d/.test(day) && /[lI|O]/.test(day) ? mon + gap + day.replace(/[lI|]/g, '1').replace(/O/g, '0') : all));
  }

  function prepare(text, defaults) {
    const raw = String(text || '').replace(/\r/g, '').split('\n').map((l) => repairOcr(l.replace(/\s+$/, ''))).filter((l) => l.trim());
    const ctx = { now: defaults.now, dayFirst: dayFirstHint(raw) };
    const lines = raw.map((t) => ({
      text: t,
      cells: t.split('\t').map((c) => c.trim()).filter(Boolean),
      junk: RE_POLICY.test(t),
      office: RE_OFFICE.test(t),
      used: false,
      dates: [],
      times: [],
      labels: [],
    }));
    for (let i = 0; i < lines.length; i++) {
      const L = lines[i];
      const prev = i > 0 ? lines[i - 1] : null;
      const all = findDates(L.text, ctx);
      // A date is bookkeeping when its own label says so, or when the line
      // above is such a label and the date opens this line.
      const underMetaLabel = prev && !prev.allDates.length && RE_META_LINE.test(prev.text);
      for (const d of all) {
        d.meta = d.stale || RE_META_BEFORE.test(L.text.slice(0, d.index)) || (underMetaLabel && d.index <= 3);
      }
      L.allDates = all;
      L.dates = L.junk ? [] : all.filter((d) => !d.meta);
      L.times = L.office || L.junk ? [] : findTimes(L.text);
      L.labels = L.text.length <= 110 && L.text.split(/\s+/).length <= 14 ? labelsIn(L.text) : [];
    }
    assignRoles(lines);
    const whole = raw.join('\n');
    return {
      lines: lines,
      ctx: ctx,
      text: whole,
      flightish: /\b(?:flight|flt|boarding pass|boarding card|airlines?|airways|aviation|e-?ticket|itinerary|pnr|airport)\b/i.test(whole) || !!G.airlineCodeIn(whole),
      typed: 0,
    };
  }

  // Slash dates: any "25/11/2026" makes the whole document day-first; any
  // "11/25/2026" makes it month-first; otherwise undecided (null).
  function dayFirstHint(rawLines) {
    let hint = null;
    const re = new RegExp(RE_NUMERIC.source, 'g');
    for (const line of rawLines) {
      let m;
      re.lastIndex = 0;
      while ((m = re.exec(line))) {
        if (m[2] !== '/') continue;
        if (Number(m[1]) > 12) return true;
        if (Number(m[3]) > 12) hint = false;
      }
    }
    return hint;
  }

  // Give each time a role: 'dep' | 'arr' | 'board' | 'other' | undefined.
  function assignRoles(lines) {
    // 1. Words on the same line.
    for (const L of lines) {
      if (!L.times.length) continue;
      const timed = L.labels.filter((l) => l.end <= L.times[0].index);
      if (timed.length >= 2 && timed.length === L.times.length && timed.length === L.labels.length) {
        // "BOARDS DEPARTS ARRIVES 10:55 11:25 12:55" on one line: zip in order.
        L.times.forEach((t, k) => { t.role = timed[k].role; });
        continue;
      }
      for (const t of L.times) {
        const before = L.text.slice(0, t.index);
        if (/\bfrom\b[^\d:]{1,40}$/i.test(before)) { t.role = 'dep'; continue; }
        if (/\bto\b[^\d:]{1,40}$/i.test(before) && /\bfrom\b/i.test(before)) { t.role = 'arr'; continue; }
        const near = L.labels.filter((l) => l.end <= t.index && t.index - l.end <= 60);
        const last = near[near.length - 1];
        if (last && !L.times.some((o) => o !== t && o.index >= last.end && o.index < t.index)) t.role = last.role;
      }
    }
    // 2. Column headers: a label row followed by rows of unlabelled times.
    for (let i = 0; i < lines.length; i++) {
      const H = lines[i];
      if (H.times.length || !H.labels.length) continue;
      const roles = H.labels.map((l) => l.role);
      const lone = isLoneLabel(H);
      if (lone && (roles[0] === 'other' || roles[0] === 'gate')) continue;
      const timed = roles.filter((r) => r !== 'gate');
      let k = 0;       // next header label to hand out in column-major layouts
      let matched = false;
      for (let j = i + 1; j < lines.length && (j <= i + 8 || matched); j++) {
        const R = lines[j];
        if (!R.times.length) {
          if (R.labels.length) break; // the next header starts here
          if (matched && j > i + 8) break;
          continue;
        }
        const open = R.times.filter((t) => !t.role);
        if (!open.length) continue;
        if (lone) { open[0].role = roles[0]; break; }
        if (k === 0 && open.length === roles.length && roles.length > 1) {
          open.forEach((t, n) => { t.role = roles[n]; });
          matched = true;
          continue; // further rows of the same table
        }
        if (open.length === timed.length && timed.length < roles.length) {
          // The gate cell is blank or holds a gate number, not a time.
          open.forEach((t, n) => { t.role = timed[n]; });
          matched = true;
          continue;
        }
        if (matched) break;
        if (open.length === 1 && R.times.length === 1) {
          // One value per line under a multi-column header (copy-pasted tables).
          open[0].role = roles[k++];
          if (k >= roles.length) break;
          continue;
        }
        if (open.length === roles.length) { open.forEach((t, n) => { t.role = roles[n]; }); matched = true; continue; }
        break;
      }
    }
  }

  // "Arrival:" or "Giờ ra máy bay / Boarding time" — a line that is nothing but
  // one label; its value is the next time below.
  function isLoneLabel(L) {
    if (!L.labels.length || L.cells.length > 1) return false;
    if (L.labels.some((l) => l.role !== L.labels[0].role)) return false;
    // Bilingual passes print the label twice ("Giờ ra máy bay / Boarding time").
    let rest = L.text;
    for (let k = L.labels.length - 1; k >= 0; k--) rest = rest.slice(0, L.labels[k].index) + rest.slice(L.labels[k].end);
    return !rest.replace(/[\s:*/]+/g, '');
  }

  // --- shared helpers for collectors ------------------------------------------------------

  // Date closest to a time on the same line; ties go to the date before it.
  function dateForTime(L, t) {
    let best = null, bestDist = Infinity;
    for (const d of L.dates) {
      const dist = d.end <= t.index ? t.index - d.end : d.index - t.end + 0.5;
      if (dist < bestDist) { bestDist = dist; best = d; }
    }
    return best;
  }

  function markUsed(doc, from, to) {
    for (let i = from; i <= to && i < doc.lines.length; i++) doc.lines[i].used = true;
  }

  function mkEvent(p) {
    return {
      type: p.type || 'event',
      icon: p.icon || '',
      title: p.title || '',
      location: p.location || '',
      tz: p.tz || null,
      tzEnd: p.tzEnd || null,
      allDay: !!p.allDay,
      start: p.start,
      end: p.end || null,
      confidence: p.confidence || 'medium',
      meta: p.meta || {},
      notes: p.notes || [],
      flags: {},
      sources: [],
    };
  }

  const startOf = (date, time) => ({ date: dateKey(date), time: time ? time.key : null, inferred: date.yearInferred || false });

  // --- booking references, seats ---------------------------------------------------------

  const RE_REF_LABEL = /(?:airline booking reference|carrier reservation number|booking reference|booking ref\b\.?|booking (?:no\b\.?|number|code)|reservation (?:code|number|no\b\.?)|confirmation(?: code| number| no\b\.?)?|\bpnr\b|record locator|check-in locator)/i;
  const REF_TOKEN = /(?<![A-Za-z0-9])(?=[A-Z0-9]{0,7}[A-Z])[A-Z0-9]{5,8}(?![A-Za-z0-9])/g;
  const REF_STOP = /^(?:NUMBER|BOOKING|STATUS|CONFIRMED|PASSENGER|FLIGHT|TICKET|REFERENCE|DETAILS|ECONOMY|BOARDING|ADULT|CHILD|GUEST|GUESTS)$/;

  function refToken(text, skip) {
    const re = new RegExp(REF_TOKEN.source, 'g');
    let m;
    while ((m = re.exec(text))) {
      if (REF_STOP.test(m[0]) || (skip && skip.indexOf(m[0]) > -1)) continue;
      return m[0];
    }
    return null;
  }

  // Airline record locator within lines [s, e]. The value may follow the label,
  // sit under it as the last cell of the next row, or stand alone a few lines
  // below (PDF columns get shuffled). `skip` lists flight numbers to ignore.
  function findRef(doc, s, e, skip) {
    for (let i = s; i <= e && i < doc.lines.length; i++) {
      const L = doc.lines[i];
      const m = L.text.match(RE_REF_LABEL);
      if (!m) continue;
      const inline = refToken(L.text.slice(m.index + m[0].length), skip);
      if (inline) return inline;
      const next = doc.lines[i + 1];
      if (next) {
        const words = next.text.trim().split(/\s+/);
        const last = refToken(words[words.length - 1], skip);
        if (last && last === words[words.length - 1]) return last;
      }
      for (let j = i + 1; j <= Math.min(i + 4, doc.lines.length - 1); j++) {
        const t = doc.lines[j].text.trim();
        if (/^[A-Z0-9]{5,8}$/.test(t) && refToken(t, skip)) return t;
      }
    }
    return null;
  }

  // Seat like "28D": on the label's line or within the three lines under it.
  function findSeat(doc, s, e) {
    for (let i = s; i <= e && i < doc.lines.length; i++) {
      const m = doc.lines[i].text.match(/\bseat|ghế/i);
      if (!m) continue;
      const same = doc.lines[i].text.slice(m.index).match(/(?<![A-Za-z0-9])(\d{1,2}[A-HJK])(?![A-Za-z0-9])/);
      if (same) return same[1];
      for (let j = i + 1; j <= Math.min(i + 3, e); j++) {
        const below = doc.lines[j].text.match(/(?<![A-Za-z0-9])(\d{1,2}[A-HJK])(?![A-Za-z0-9])/);
        if (below) return below[1];
      }
    }
    return null;
  }

  // --- ground transport: trains, buses, ferries -----------------------------------------

  const GROUND = [
    { type: 'train', word: 'Train', re: /\b(?:trains?|rail|railway|eurostar|tgv|sncf|renfe|trenitalia|italo|thalys|amtrak|shinkansen|tren|trenuri|treno|zug|intercity|nozomi|hikari|kodama|sakura|mizuho|hayabusa|platform|gleis|binario)\b|\bICE\s?\d/i },
    { type: 'bus', word: 'Bus', re: /\b(?:bus|buses|flixbus|megabus|greyhound|autobuz|autocar|autobus|national express)\b/i },
    { type: 'ferry', word: 'Ferry', re: /\b(?:ferry|ferries|catamaran|hydrofoil|speedboat|traghetto)\b/i },
  ];
  const RE_JAPAN_RAIL = /shinkansen|nozomi|hikari|kodama|sakura|mizuho|hayabusa|kagayaki|\bjr\b/i;
  const RE_SERVICE = /\b(eurostar|tgv|thalys|italo|frecciarossa|ave|ice|nozomi|hikari|kodama|sakura|mizuho|hayabusa|kagayaki|flixbus|train|tren|zug|treno|bus)\s*(?:no\.?|number|nr\.?|#)?\s*([A-Z]{0,3}\s?\d{1,5})\b/i;
  const ARROW = /\s*(?:→|➝|➔|->|=>|–>)\s*/;

  function groundMode(doc, i) {
    const L = doc.lines;
    for (const g of GROUND) if (g.re.test(L[i].text)) return g;
    if (/\bflight\b|\bflt\b/i.test(L[i].text)) return null;
    for (let j = Math.max(0, i - 3); j <= Math.min(L.length - 1, i + 2); j++) {
      if (j === i) continue;
      // A neighbouring line that is itself another dated leg does not lend its
      // keyword ("Return train ..." above "Outbound flight ...").
      if (L[j].dates.length && /\bflight\b|\bflt\b/i.test(L[i].text + L[j].text)) continue;
      for (const g of GROUND) if (g.re.test(L[j].text)) return g;
    }
    return null;
  }

  function collectGround(doc, events) {
    const L = doc.lines;
    const made = [];
    for (let i = 0; i < L.length; i++) {
      const line = L[i];
      if (line.used || !line.dates.length) continue;
      const mode = groundMode(doc, i);
      if (!mode) continue;

      // Departure and arrival on the anchor line; arrival may sit on a line below.
      let dep = line.times.find((t) => t.role === 'dep') || line.times.find((t) => !t.role) || null;
      let arr = line.times.find((t) => t.role === 'arr') || line.times.find((t) => t !== dep && (!t.role || t.role === 'arr')) || null;
      let last = i;
      if (!arr) {
        for (let j = i + 1; j <= Math.min(i + 4, L.length - 1); j++) {
          if (L[j].used || L[j].dates.length) break;
          const t = L[j].times.find((x) => x.role === 'arr');
          if (t) { arr = t; last = j; break; }
        }
      }
      const depDate = (dep && dateForTime(line, dep)) || line.dates[0];
      const arrDate = arr && last === i && line.dates.length > 1 ? dateForTime(line, arr) : null;

      const stations = groundStations(doc, i, dep, arr);
      const svc = groundService(doc, i);
      last = Math.max(last, svc.lastLine);
      markUsed(doc, stations.firstLine, last);

      const fromTz = (stations.from && G.tzFromText(stations.from)) || null;
      const toTz = (stations.to && G.tzFromText(stations.to)) || null;
      const around = L.slice(Math.max(0, i - 4), last + 1).map((x) => x.text).join(' ');
      const japan = RE_JAPAN_RAIL.test(around) || fromTz === 'Asia/Tokyo' || toTz === 'Asia/Tokyo';
      const ev = mkEvent({
        type: mode.type,
        icon: mode.type === 'train' ? (japan ? '🚅' : '🚆') : mode.type === 'bus' ? '🚌' : '⛴️',
        tz: fromTz || toTz || G.tzFromText(around) || G.tzFromText(doc.text),
        start: startOf(depDate, dep),
        end: arr ? { date: dateKey(arrDate || depDate), time: arr.key, dateExplicit: !!arrDate } : null,
        confidence: dep ? 'high' : 'medium',
        meta: {
          kind: mode.type, word: mode.word, number: svc.number, coach: svc.coach, seat: svc.seat,
          from: stations.from ? { city: stations.from } : null,
          to: stations.to ? { city: stations.to } : null,
          unsplit: stations.unsplit || null,
          ref: findRef(doc, Math.max(0, i - 8), Math.min(L.length - 1, last + 6)),
          fallbackTitle: lineTitle(doc, i),
        },
      });
      ev.tzEnd = toTz || ev.tz;
      events.push(ev);
      made.push(ev);
      doc.typed++;
      i = last;
    }
    splitPairedStations(made);
  }

  // Station names for the leg anchored on line i.
  function groundStations(doc, i, dep, arr) {
    const L = doc.lines;
    const clean = (s) => String(s || '').replace(/^[\s|:,\-]+|[\s|:,\-]+$/g, '').trim();
    // "A → B" on the line or just around it.
    for (const j of [i, i - 1, i + 1, i - 2]) {
      if (j < 0 || j >= L.length) continue;
      const parts = L[j].text.split(/[|\t]/).map((c) => c.trim());
      for (const part of parts) {
        const m = part.split(ARROW);
        if (m.length === 2 && m[0] && m[1]) {
          return { from: clean(m[0].replace(/^.*\bfrom\b/i, '')), to: clean(m[1]), firstLine: Math.min(i, j) };
        }
        const ft = part.match(/\bfrom\s+(.{2,40}?)\s+to\s+(.{2,40}?)(?:\s+on\b|\s+at\b|[,.;]|$)/i);
        if (ft) return { from: clean(ft[1]), to: clean(ft[2]), firstLine: Math.min(i, j) };
      }
    }
    // Ticket tables: stations sit between the two times on the anchor line, or
    // alone on the line above it.
    let between = '';
    if (dep && arr && arr.index > dep.end) between = L[i].text.slice(dep.end, arr.index);
    let srcLine = i;
    if (!between.trim() && i > 0) {
      const above = L[i - 1];
      if (!above.dates.length && !above.times.length && !above.labels.length && !/\d/.test(above.text)) {
        between = above.text;
        srcLine = i - 1;
      }
    }
    const cells = between.split('\t').map(clean).filter(Boolean);
    if (cells.length === 2) return { from: cells[0], to: cells[1], firstLine: srcLine };
    if (cells.length === 1 && cells[0].split(/\s+/).length >= 2) return { unsplit: cells[0], firstLine: srcLine };
    return { firstLine: i };
  }

  // Train/bus number, coach and seat: a "Train | Car | Places" header with its
  // values row below, or a named service on the line ("Eurostar 9208").
  function groundService(doc, i) {
    const L = doc.lines;
    const out = { number: null, coach: null, seat: null, lastLine: i };
    for (let j = i + 1; j <= Math.min(i + 3, L.length - 2); j++) {
      const H = L[j];
      if (H.dates.length) break;
      if (!/\b(?:tren|train|zug|treno|bus)\b/i.test(H.text) || !/\b(?:vagon|car|coach|wagen|voiture|carrozza|seat|loc|locuri|places?)\b/i.test(H.text)) continue;
      // The values row is the next line that starts with a service number
      // (a price line can sit in between).
      for (let r = j + 1; r <= Math.min(j + 2, L.length - 1); r++) {
        const row = L[r];
        const m = row.text.match(/^((?:[A-Z]{1,3}\s?\d{1,5})(?:\s*,\s*[A-Z]{1,3}\s?\d{1,5})*)(?:[\s\t]+(\d{1,3}))?(?:[\s\t]+(\d{1,3}[A-Z]?))?(?![\d.,])/);
        if (!m) continue;
        out.number = m[1].replace(/\s*,\s*/g, ' + ').replace(/\s+/g, ' ');
        out.coach = m[2] || null;
        out.seat = m[3] || null;
        out.lastLine = r;
        return out;
      }
    }
    for (const j of [i, i - 1, i + 1]) {
      if (j < 0 || j >= L.length) continue;
      const m = L[j].text.match(RE_SERVICE);
      if (m) {
        const generic = /^(?:train|tren|zug|treno|bus)$/i.test(m[1]);
        out.number = (generic ? '' : m[1].charAt(0).toUpperCase() + m[1].slice(1) + ' ') + m[2].replace(/\s+/g, ' ').trim();
        break;
      }
    }
    const coach = L[i].text.match(/\b(?:coach|car|carriage|wagen|voiture|vagon)\s*[:#]?\s*(\d{1,3})\b/i);
    if (coach) out.coach = coach[1];
    const seat = L[i].text.match(/\b(?:seat|sitz|place|loc)\s*[:#]?\s*(\d{1,3}[A-Z]?)\b/i);
    if (seat) out.seat = seat[1];
    return out;
  }

  // Pasted tickets lose the column gap: "București Nord Piatra Neamț". A return
  // leg prints the same two names swapped, which reveals where to cut.
  function splitPairedStations(events) {
    const open = events.filter((e) => e.meta.unsplit);
    for (const a of open) {
      if (!a.meta.unsplit) continue; // already split as the partner of an earlier leg
      const words = a.meta.unsplit.split(/\s+/);
      for (const b of open) {
        if (a === b || !b.meta.unsplit || !a.meta.unsplit) continue;
        for (let k = 1; k < words.length; k++) {
          const x = words.slice(0, k).join(' '), y = words.slice(k).join(' ');
          if (b.meta.unsplit === y + ' ' + x) {
            a.meta.from = { city: x }; a.meta.to = { city: y }; a.meta.unsplit = null;
            b.meta.from = { city: y }; b.meta.to = { city: x }; b.meta.unsplit = null;
            break;
          }
        }
      }
    }
  }

  // --- flights ---------------------------------------------------------------------------

  // Two-letter designators that are also English words need a flight label or
  // the compact form ("OK123") before they count.
  const WORDLIKE = /^(?:AS|AT|IT|ME|TO|OK|AM|AD|AI|DE|LA|ID|HA|SA|PC|PS|BT|TP|TR|FY|MS|PR|PG|SG|TS|PD|HO|IB)$/;
  const RE_AIRCRAFT = /^(?:A3(?:19|2[01]|[3458]0)|A22[03])$/;
  const RE_FLIGHT_WORD = /\bflight\b|\bflt\b|\bvol\b|\bvuelo\b|\bzbor\b/i;
  const RE_FCODE = /(?<![A-Za-z0-9])([A-Z][A-Z0-9]|[0-9][A-Z])([ \t-]{0,3})(\d{1,4})([A-Z])?(?![\dA-Za-z:])/g;
  const CODE_STOP = /^(?:THE|AND|FOR|YOU|PIN|SEQ|ADT|CHD|INF|TAX|DOM|INT|EUR|USD|GBP|MYR|VND|SGD|THB|JPY|AUD|CAD|CHF|IDR|KHR|RON|LEI|GMT|UTC|EST|PST|CET|MRS|SSR|VAT|TVA|PNR|NOT|ALL|ONE|TWO|BAG|ECO|YES|NON|SUN|MON|TUE|WED|THU|FRI|SAT|PDF|GET|NEW|OUR|ANY|ARE|WAS|HAS|CAN|MAY|DAY|VIA|NET|TEL|FAX|APP|WEB)$/;

  // "BA0011" -> "BA11"; a designator ending in a digit keeps a space ("W4 3139").
  const normFlight = (designator, digits, suffix) => designator + (/\d$/.test(designator) ? ' ' : '') + String(Number(digits)) + (suffix || '');

  // Flight numbers on line i: [{ code, index }].
  function flightCodes(doc, i) {
    const text = doc.lines[i].text;
    const out = [];
    const re = new RegExp(RE_FCODE.source, 'g');
    let m;
    while ((m = re.exec(text))) {
      const des = m[1];
      if (/^(?:AM|PM)$/.test(des)) continue;
      if (!m[2] && RE_AIRCRAFT.test(des + m[3])) continue;
      // "ON 28JAN": those digits are a day of the month, not a flight number.
      if (new RegExp('^(?:' + MONTH_SRC + ')(?![a-z])', 'i').test(text.slice(m.index + m[0].length))) continue;
      const labelled = /\bfl(?:igh)?t\.?\s*(?:no|number|num|nr|#)?\.?\s*[:#]?\s*$/i.test(text.slice(0, m.index));
      if (!labelled) {
        if (!doc.flightish || !G.hasAirline(des)) continue;
        if (WORDLIKE.test(des) && m[2] && !RE_FLIGHT_WORD.test(text) && !(i > 0 && RE_FLIGHT_WORD.test(doc.lines[i - 1].text))) continue;
      }
      out.push({ code: normFlight(des, m[3], m[4]), index: m.index, des: des });
    }
    if (!out.length && doc.flightish) {
      // "VietJet Air VI953": the airline named on the line corrects a designator
      // that is one character off (OCR reads J as I).
      const named = G.airlineCodeIn(text);
      const near = named && text.match(/(?<![A-Za-z0-9])([A-Z0-9]{2})\s?(\d{2,4})(?![\dA-Za-z:])/);
      if (near && !G.hasAirline(near[1]) && (near[1][0] === named[0]) !== (near[1][1] === named[1])) {
        out.push({ code: normFlight(named, near[2]), index: near.index, des: named });
      }
    }
    if (!out.length) {
      // "FLIGHT NUMBER: 525" — digits only; the airline name supplies the rest.
      const d = text.match(/\bflight\s*(?:no|number|num|nr|#)\.?\s*[:#]?\s*(\d{2,4})\b/i);
      if (d) {
        const near = doc.lines.slice(Math.max(0, i - 3), i + 2).map((l) => l.text).join(' ');
        const des = G.airlineCodeIn(near) || G.airlineCodeIn(doc.text) || '';
        out.push({ code: des ? normFlight(des, d[1]) : String(Number(d[1])), index: d.index, des: des });
      }
    }
    return out;
  }

  function collectFlights(doc, events) {
    const L = doc.lines;
    const perLine = [];
    const seenOn = {};
    for (let i = 0; i < L.length; i++) {
      if (L[i].used || L[i].junk) continue;
      const codes = flightCodes(doc, i);
      if (!codes.length) continue;
      const distinct = [];
      for (const c of codes) if (distinct.indexOf(c.code) < 0) distinct.push(c.code);
      perLine.push({ i: i, codes: distinct });
      for (const c of distinct) (seenOn[c] = seenOn[c] || []).push(i);
    }

    // A line naming several flights is either a connection ("TK209 IST TK1045":
    // one journey) or a list ("VJ953 10F, VJ521 4F": each flight has its own
    // row elsewhere). Lists only contribute seats.
    const anchors = [];
    const listSeats = {};
    for (const p of perLine) {
      if (p.codes.length > 1 && p.codes.some((c) => seenOn[c].length > 1)) {
        for (const c of p.codes) {
          const m = L[p.i].text.match(new RegExp(c.replace(/^([A-Z0-9]{2})\s?/, '$1\\s?0*') + '\\s+(\\d{1,2}[A-HJK])(?![A-Za-z0-9])'));
          if (m) listSeats[c] = m[1];
        }
        L[p.i].used = true;
        continue;
      }
      anchors.push({ i: p.i, code: p.codes[0], via: p.codes.slice(1) });
    }

    // Consecutive mentions of one flight number are one booking (boarding
    // passes print it several times) unless each sits on its own dated row.
    const groups = [];
    for (const a of anchors) {
      const last = groups[groups.length - 1];
      const ownDate = L[a.i].dates[0] ? dateKey(L[a.i].dates[0]) : null;
      if (last && last.code === a.code && !(ownDate && last.rowDate && ownDate !== last.rowDate)) {
        last.lines.push(a.i);
        if (ownDate) last.rowDate = ownDate;
      } else {
        groups.push({ code: a.code, via: a.via, lines: [a.i], rowDate: ownDate });
      }
    }

    // Every booking in a document is laid out the same way, so the number of
    // lines the first one keeps above its flight number applies to all.
    // A lone booking simply owns the lines above it.
    const lead = groups.length === 1 ? 10 : groups.length ? leadAbove(doc, groups[0].lines[0]) : 0;
    const made = [];
    for (let k = 0; k < groups.length; k++) {
      const g = groups[k];
      const first = g.lines[0], lastAnchor = g.lines[g.lines.length - 1];
      const prevEnd = k > 0 ? groups[k - 1].lines[groups[k - 1].lines.length - 1] : -1;
      const s = Math.max(prevEnd + 1, first - lead);
      let e = Math.min(L.length - 1, lastAnchor + 14);
      if (k + 1 < groups.length) e = Math.min(e, Math.max(lastAnchor, groups[k + 1].lines[0] - lead - 1));
      const ev = extractFlight(doc, s, e, g);
      if (ev) {
        if (listSeats[g.code] && !ev.meta.seat) ev.meta.seat = listSeats[g.code];
        made.push(ev);
      }
    }

    // Flights mentioned without a number: a dated line with flight vocabulary
    // on it or right next to it.
    for (let i = 0; i < L.length; i++) {
      if (L[i].used || !L[i].dates.length) continue;
      const near = L.slice(Math.max(0, i - 3), i + 4).some((x) => !x.used && /\bflight\b|\bflt\b|boarding pass|\bairlines?\b|\bairways\b|\bair\b/i.test(x.text));
      if (!near || groundMode(doc, i)) continue;
      let s = i, e = i;
      while (s > 0 && i - s < 3 && !L[s - 1].used && !L[s - 1].dates.length) s--;
      while (e < L.length - 1 && e - i < 5 && !L[e + 1].used && !(L[e + 1].dates.length && !L[e + 1].labels.length)) e++;
      const ev = extractFlight(doc, s, e, { code: null, via: [], lines: [i] });
      if (ev) made.push(ev);
      markUsed(doc, s, e);
    }

    // A block with a number but no date of its own (a second copy of a boarding
    // pass) tops up the dated event for the same flight.
    const dated = made.filter((ev) => ev.start);
    for (const ev of made) {
      if (ev.start) continue;
      const host = dated.filter((d) => d.meta.number === ev.meta.number);
      if (host.length === 1) fillMeta(host[0], ev);
    }
    // PNRs usually apply to the whole booking: reuse the document-wide one.
    if (dated.length) {
      const anyRef = findRef(doc, 0, L.length - 1, dated.map((d) => d.meta.number).filter(Boolean));
      for (const ev of dated) {
        if (!ev.meta.ref && anyRef) ev.meta.ref = anyRef;
        events.push(ev);
        doc.typed++;
      }
    }
  }

  // How many lines directly above the first flight number carry that flight's
  // data (dates, times, route). Up to two filler lines may sit in between.
  function leadAbove(doc, anchor) {
    const L = doc.lines;
    let lead = 0, gap = 0;
    for (let i = anchor - 1; i >= 0 && anchor - i <= 8; i--) {
      const x = L[i];
      if (x.used) break;
      const data = x.dates.length || x.times.length || /\(\s*[A-Z]{3}\s*\)/.test(x.text) || isCodeOnly(x.text) ||
        ARROW.test(x.text) || /\bfrom\b.*\bto\b|\bTO\b/.test(x.text) || /\b[A-Z]{3}\s*(?:-|–|—)\s*[A-Z]{3}\b/.test(x.text) ||
        (x.labels.length && x.cells.length > 1);
      if (data) { lead = anchor - i; gap = 0; } else if (++gap > 2) break;
    }
    return lead;
  }

  const range = (from, to) => { const out = []; for (let i = from; i <= to; i++) out.push(i); return out; };
  const validCode = (c) => !CODE_STOP.test(c) && !MONTHS[c.toLowerCase()] && !!G.airport(c);
  const isCodeOnly = (text) => /^\W*[A-Z]{3}\W*(?:[A-Z]{3}\W*)?$/.test(text) && (text.match(/[A-Z]{3}/g) || []).every(validCode);

  function endpoint(airport) {
    return { code: airport.code, city: airport.city, name: airport.name, tz: airport.tz };
  }

  // Airport named anywhere in a short fragment: longest run of words first.
  function airportIn(fragment) {
    const text = String(fragment || '').replace(/[|·•>]+/g, ' ').trim();
    const code = text.match(/^[\s\-–]*([A-Z]{3})\b/);
    if (code && validCode(code[1])) return G.airport(code[1]);
    const words = text.replace(/^[\s\-–:]+/, '').split(/\s+/).filter(Boolean).slice(0, 7);
    for (let len = Math.min(4, words.length); len >= 1; len--) {
      for (let at = 0; at + len <= words.length; at++) {
        const a = G.findAirport(words.slice(at, at + len).join(' '));
        if (a) return a;
      }
    }
    return null;
  }

  // The place printed after a clock time: "19:30 SGN Ho Chi Minh City",
  // "13:30 - Hiroshima Airport", or an airport code on the following lines.
  function placeAfterTime(doc, li, t) {
    const L = doc.lines;
    const line = L[li];
    const next = line.times.find((x) => x.index > t.index);
    let rest = line.text.slice(t.end, next ? next.index : undefined);
    for (const d of line.dates) if (d.index >= t.end) rest = rest.replace(line.text.slice(d.index, d.end), ' ');
    rest = rest.replace(/^[\s\-–·•|]+/, '');
    let a = null, source = rest;
    if (rest.trim() && !/^\d/.test(rest)) a = airportIn(rest);
    if (!a && !rest.trim() && line.times.length === 1) {
      for (let j = li + 1; j <= Math.min(li + 2, L.length - 1); j++) {
        const m = L[j].text.match(/^\s*([A-Z]{3})\b/);
        if (m && validCode(m[1])) { a = G.airport(m[1]); source = L[j].text; break; }
        if (L[j].times.length) break;
      }
    }
    if (!a) return null;
    const ep = endpoint(a);
    const term = source.match(/\bT(\d)\b|\bTerminal\s+(\w{1,2})\b/);
    if (term) ep.terminal = term[1] || term[2];
    return ep;
  }

  const ROUTE_SEP = /\s*(?:→|➝|➔|->|=>|‒|–|—)\s*|\s+-\s+|\s+(?:to|TO|To)\s+/;

  // Departure and arrival airports for the block [s, e].
  function findRoute(doc, s, e, anchor, depAt, arrAt) {
    const L = doc.lines;
    const pair = (a, b, line) => (a && b && a.code !== b.code ? { from: endpoint(a), to: endpoint(b), line: line } : null);
    // 1. Two codes in brackets: "Bangkok (DMK) to Danang (DAD)".
    for (let i = s; i <= e; i++) {
      const codes = (L[i].text.match(/\(\s*[A-Z]{3}\s*\)/g) || []).map((c) => c.replace(/[^A-Z]/g, '')).filter(validCode);
      const r = codes.length >= 2 && pair(G.airport(codes[0]), G.airport(codes[codes.length - 1]), i);
      if (r) return r;
    }
    // 2. Two codes with a separator, anywhere on a line: "IST To BAH", "OTP - BLQ".
    for (const i of [anchor].concat(range(s, e))) {
      const m = L[i].text.match(/(?<![A-Za-z])([A-Z]{3})\s*(?:-|–|—|→|>|to|To|TO)\s*([A-Z]{3})(?![A-Za-z])/);
      const r = m && validCode(m[1]) && validCode(m[2]) && pair(G.airport(m[1]), G.airport(m[2]), i);
      if (r) return r;
    }
    // 2b. Places printed next to the departure and arrival times.
    const from = depAt ? placeAfterTime(doc, depAt.li, depAt.t) : null;
    const to = arrAt ? placeAfterTime(doc, arrAt.li, arrAt.t) : null;
    if (from && to && from.code !== to.code) return { from: from, to: to, line: Math.max(depAt.li, arrAt.li) };
    // 3. A line that is just two airport codes: "KUL DMK".
    for (let i = s; i <= e; i++) {
      const m = L[i].text.match(/^\W*([A-Z]{3})\W+([A-Z]{3})\W*$/);
      const r = m && validCode(m[1]) && validCode(m[2]) && pair(G.airport(m[1]), G.airport(m[2]), i);
      if (r) return r;
    }
    // 4. "X → Y", "X - Y", "X to Y".
    for (let i = s; i <= e; i++) {
      const x = L[i];
      if (x.junk || x.times.length || x.text.length > 90) continue;
      let text = x.text;
      for (const d of x.allDates) text = text.replace(x.text.slice(d.index, d.end), ' ');
      const parts = text.split(ROUTE_SEP);
      if (parts.length < 2) continue;
      const left = parts[0].trim().split(/\s+/), right = parts[1].trim().split(/\s+/);
      let a = null, b = null;
      const lastLeft = left[left.length - 1].replace(/[()]/g, '');
      if (/^[A-Z]{3}$/.test(lastLeft) && validCode(lastLeft)) a = G.airport(lastLeft);
      for (let n = Math.min(4, left.length); n >= 1 && !a; n--) a = G.findAirport(left.slice(-n).join(' '));
      for (let n = Math.min(5, right.length); n >= 1 && !b; n--) {
        const tail = right[n - 1].replace(/[()]/g, '');
        if (/^[A-Z]{3}$/.test(tail) && validCode(tail)) b = G.airport(tail);
        else b = G.findAirport(right.slice(0, n).join(' '));
      }
      const r = pair(a, b, i);
      if (r) return r;
    }
    // 5. Two place names side by side: "HEATHROW<TAB>CHANGI".
    for (let i = s; i <= e; i++) {
      const x = L[i];
      if (/\d/.test(x.text) || x.labels.length || x.text.split(/\s+/).length > 7) continue;
      let r = null;
      if (x.cells.length === 2) r = pair(G.findAirport(x.cells[0]), G.findAirport(x.cells[1]), i);
      if (!r && Math.abs(i - anchor) <= 6) {
        const two = G.splitTwoAirports(x.text);
        if (two) r = pair(two[0], two[1], i);
      }
      if (r) return r;
    }
    if (from || to) return { from: from, to: to, line: anchor };
    return null;
  }

  // Stated flight length in minutes ("1h 40m", "Flight time: 02:15"), if any.
  function findDuration(doc, s, e) {
    for (let i = s; i <= e; i++) {
      const text = doc.lines[i].text;
      if (/\b(?:before|prior|least|within|after|every|penalty)\b/i.test(text)) continue;
      const clock = text.match(/(?:flight time|duration|durata)\s*:?\s*(\d{1,2}):(\d{2})\b/i);
      if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
      const m = text.match(/(?<![\d:])(\d{1,2})\s?h(?:(?:ou)?rs?)?\b\.?\s*(?:(\d{1,2})\s?m(?:in(?:ute)?)?\s?s?\b)?/i);
      if (!m) continue;
      if (text.length <= 26 || /duration|flight time|direct|non-?stop|journey|travel time/i.test(text)) {
        return Number(m[1]) * 60 + (m[2] ? Number(m[2]) : 0);
      }
    }
    return null;
  }

  // Minutes from a departure wall time to an arrival wall time, across zones.
  function elapsedMinutes(depDate, depTime, tzDep, arrDate, arrTime, tzArr) {
    const a = TZ.wallToUtc(depDate, depTime, tzDep);
    const b = TZ.wallToUtc(arrDate, arrTime, tzArr);
    if (a && b) return Math.round((b - a) / 60000);
    const pa = depTime.split(':').map(Number), pb = arrTime.split(':').map(Number);
    const days = Math.round((new Date(arrDate) - new Date(depDate)) / 86400000);
    return days * 1440 + (pb[0] * 60 + pb[1]) - (pa[0] * 60 + pa[1]);
  }

  // One flight from lines [s, e]. g: { code, via, lines: [anchor lines] }.
  // Returns an event; `start` is null when the block has no date of its own.
  function extractFlight(doc, s, e, g) {
    const L = doc.lines;
    const anchor = g.lines[0];
    const rowMode = g.lines.length === 1 && L[anchor].dates.length && L[anchor].times.length;
    const span = [];
    if (rowMode) span.push(anchor);
    else for (let i = s; i <= e; i++) if (!L[i].used && !L[i].junk) span.push(i);

    const times = [];
    for (const li of span) for (const t of L[li].times) times.push({ li: li, t: t });
    const after = (x, y) => x.li > y.li || (x.li === y.li && x.t.index > y.t.index);
    let dep = times.find((x) => x.t.role === 'dep') || null;
    let arr = times.find((x) => x.t.role === 'arr') || null;
    const board = times.find((x) => x.t.role === 'board') || null;
    const open = times.filter((x) => !x.t.role);
    if (!dep && open.length) dep = open[0];
    let arrGuessed = false;
    if (dep && !arr) {
      arr = open.find((x) => after(x, dep) && x.t.key !== dep.t.key) || null;
      arrGuessed = !!arr;
    }

    // Departure date: on the departure line, else the nearest dated line.
    const ref = dep || board;
    let depDate = ref ? dateForTime(L[ref.li], ref.t) : null;
    let dateLine = ref ? ref.li : -1;
    if (!depDate) {
      const from = ref ? ref.li : anchor;
      let bestDist = Infinity;
      for (const li of span) {
        if (!L[li].dates.length) continue;
        const dist = Math.abs(li - from) + (li > from ? 0.5 : 0);
        if (dist < bestDist) { bestDist = dist; depDate = L[li].dates[0]; dateLine = li; }
      }
    }
    let arrDate = null;
    if (arr && L[arr.li].dates.length) {
      const d = dateForTime(L[arr.li], arr.t);
      if (d && d !== depDate) arrDate = d;
    }
    let nextDay = false;
    if (arr) {
      const tail = L[arr.li].text.slice(arr.t.end);
      nextDay = /^\s*(?:\(\+1\)|\+1\b(?!\s*\d))/.test(tail) ||
        [arr.li + 1, arr.li + 2].some((j) => j < L.length && /^\s*(?:next day|\+1(?:\s*day)?|following day)\s*$/i.test(L[j].text));
    }

    const route = findRoute(doc, s, e, anchor, dep, arr);
    const from = route && route.from, to = route && route.to;
    const terminals = span.map((li) => L[li].text.match(/^Terminal\s+(\w{1,2})\s+Terminal\s+(\w{1,2})$/i)).find(Boolean);
    if (terminals && from && to) { from.terminal = terminals[1]; to.terminal = terminals[2]; }
    const durationMin = findDuration(doc, s, e);

    // An unlabelled "arrival" is only a guess: on a boarding pass the second
    // time is often the boarding time. Keep it when the implied flight length
    // is believable for this route.
    if (arr && arrGuessed && depDate && from && to && from.tz && to.tz && !g.via.length) {
      const expect = durationMin || G.flightMinutes(G.airport(from.code), G.airport(to.code));
      const d0 = dateKey(depDate);
      let mins = elapsedMinutes(d0, dep.t.key, from.tz, arrDate ? dateKey(arrDate) : d0, arr.t.key, to.tz);
      if (mins <= 0 && !arrDate) mins += 1440;
      if (expect && (mins < expect * 0.5 - 15 || mins > expect * 1.6 + 45)) arr = null;
    }

    const number = g.code;
    const skip = [number].concat(g.via).filter(Boolean).map((n) => n.replace(/\s+/g, ''));
    const rawNumbers = g.lines.map((li) => (L[li].text.match(/[A-Z0-9]{2}\d{1,4}/) || [])[0]).filter(Boolean);
    const gate = span.map((li) => L[li].text.match(/\bgate\s*[:#]?\s*([A-Z]?\d{1,3}[A-Z]?)(?![:\d\w])/i)).find(Boolean);
    const meta = {
      kind: 'flight',
      number: number,
      airline: number && /^[A-Z0-9]{2}/.test(number) ? G.airlineName(number.slice(0, 2)) : null,
      via: g.via.slice(),
      from: from || null,
      to: to || null,
      ref: findRef(doc, s, e, skip.concat(rawNumbers)),
      seat: findSeat(doc, s, e),
      gate: gate ? gate[1] : null,
      boarding: board ? board.t.key : null,
      durationMin: durationMin,
      fallbackTitle: number ? null : lineTitle(doc, anchor),
    };

    const evidence = [anchor, dateLine, dep ? dep.li : -1, arr ? arr.li : -1, board ? board.li : -1, route ? route.line : -1]
      .concat(g.lines).filter((x) => x >= 0);
    markUsed(doc, Math.min.apply(null, evidence.concat([s])), Math.max.apply(null, evidence));
    // Later copies of the same pass (and their dates) belong to this flight too.
    for (const li of span) if (L[li].dates.some((d) => depDate && dateKey(d) === dateKey(depDate))) L[li].used = true;

    const ev = mkEvent({
      type: 'flight',
      icon: '✈️',
      start: depDate ? { date: dateKey(depDate), time: dep ? dep.t.key : null, inferred: depDate.yearInferred || false } : null,
      end: depDate && arr ? { date: dateKey(arrDate || depDate), time: arr.t.key, dateExplicit: !!arrDate, nextDay: nextDay } : null,
      meta: meta,
    });
    return ev;
  }

  // --- deadlines (visas, permits) ---------------------------------------------------------

  const RE_VISA_DOC = /\b(?:e-?visa|visa|e-?voa|voa|esta|travel authori[sz]ation|residence permit)\b/i;
  const RE_DEADLINE = /must be used before|must be used by|valid until|valid to|valid through|valid thru|use by|enter before|enter by|last day to enter|expir(?:es|y|ation)(?: date| on)?/i;

  function collectDeadlines(doc, events) {
    if (!RE_VISA_DOC.test(doc.text)) return 0;
    const L = doc.lines;
    let made = 0;
    for (let i = 0; i < L.length; i++) {
      const m = L[i].text.match(RE_DEADLINE);
      if (!m || /passport/i.test(L[i].text)) continue;
      // The date after the label, else alone on one of the next two lines.
      let date = L[i].allDates.find((d) => d.index >= m.index && !d.stale) || null;
      for (let j = i + 1; !date && j <= Math.min(i + 2, L.length - 1); j++) {
        if (/passport/i.test(L[j].text)) break;
        date = L[j].allDates.find((d) => !d.stale && !/issue|birth/i.test(L[j].text.slice(0, d.index))) || null;
      }
      if (!date) continue;
      const kind = /e-?voa/i.test(doc.text) ? 'e-VOA' : /\besta\b/i.test(doc.text) ? 'ESTA' : /residence permit/i.test(doc.text) ? 'residence permit' : 'visa';
      const country = dominantPlace(doc.text);
      const number = doc.text.match(/\bvisa\s*(?:no|number|nr)\b\.?\s*[:#]?\s*([A-Z0-9]{6,12})\b/i);
      const verb = /used|use by/i.test(m[0]) ? 'use before' : /enter/i.test(m[0]) ? 'enter before' : 'expires';
      events.push(mkEvent({
        type: 'deadline',
        icon: '🛂',
        title: (country ? country + ' ' : '') + kind + ': ' + verb,
        allDay: true,
        tz: country ? G.tzFromText(country) : null,
        start: { date: dateKey(date), time: null },
        end: { date: dateKey(date), time: null },
        confidence: 'high',
        meta: { kind: 'deadline', label: verb.charAt(0).toUpperCase() + verb.slice(1), ref: number ? number[1] : null, refLabel: 'Visa no.' },
      }));
      for (const x of L) x.used = true; // nothing else in a visa is an appointment
      doc.typed++;
      made++;
      break;
    }
    return made;
  }

  // The country a document talks about most ("Indonesia" on an Indonesian visa
  // that also states the holder's nationality once).
  const COUNTRY_WORDS = ['indonesia', 'vietnam', 'thailand', 'cambodia', 'laos', 'malaysia', 'singapore', 'philippines', 'japan',
    'china', 'india', 'sri lanka', 'nepal', 'turkey', 'egypt', 'kenya', 'tanzania', 'australia', 'new zealand', 'canada',
    'united states', 'usa', 'united kingdom', 'brazil', 'mexico', 'south korea', 'taiwan', 'myanmar', 'saudi arabia',
    'united arab emirates', 'qatar', 'oman', 'jordan', 'morocco', 'south africa', 'russia', 'uzbekistan', 'kazakhstan', 'mongolia'];
  function dominantPlace(text) {
    const t = G.norm(text);
    let best = null, bestCount = 0;
    for (const c of COUNTRY_WORDS) {
      const n = (t.match(new RegExp('\\b' + c + '\\b', 'g')) || []).length;
      if (n > bestCount) { bestCount = n; best = c; }
    }
    return best ? best.replace(/\b[a-z]/g, (ch) => ch.toUpperCase()).replace(/^Usa$/, 'USA') : null;
  }

  // --- hotels --------------------------------------------------------------------------------

  const RE_CHECKIN = /\bcheck[\s-]?in\b|\barriv(?:al|e)\b|\banreise\b/i;
  const RE_CHECKOUT = /\bcheck[\s-]?out\b|\bcheckout\b|\bdeparture\b|\babreise\b/i;
  const RE_LODGING = /\b(?:hotel|resort|hostel|apartments?|bnb|b&b|inn|lodge|suites?|villa|guest ?house|motel|riad|ryokan)\b/i;
  const RE_HOTEL_DOC = /\b(?:hotel|rooms?|nights?|guests?|property|accommodation|resort|hostel|apartment|villa|check-?out)\b/i;

  // First usable date at or below line `at` (within `span` lines) with its time
  // from the same line or the next two ("Check in / Friday July 10 / (after 2 PM)").
  function dateWithTime(doc, at, span) {
    const L = doc.lines;
    for (let i = at; i <= Math.min(at + span, L.length - 1); i++) {
      if (L[i].junk || L[i].used) return null;
      if (!L[i].dates.length) continue;
      const date = L[i].dates[0];
      let time = nearestTime(L[i], date);
      for (let j = i + 1; !time && j <= Math.min(i + 2, L.length - 1); j++) {
        if (L[j].dates.length) break;
        if (L[j].times.length) time = L[j].times[0];
      }
      return { date: date, time: time, line: i };
    }
    return null;
  }

  // Time closest to a date on the same line, preferring one after it.
  function nearestTime(L, date, window) {
    let best = null, bestScore = Infinity;
    for (const t of L.times) {
      const dist = t.index >= date.end ? t.index - date.end : date.index - t.end;
      if (dist > (window || 40)) continue;
      const score = dist + (t.index >= date.end ? 0 : 4);
      if (score < bestScore) { bestScore = score; best = t; }
    }
    return best;
  }

  function collectHotels(doc, events, defaults) {
    const L = doc.lines;
    const hotelDoc = RE_HOTEL_DOC.test(doc.text);
    for (let i = 0; i < L.length; i++) {
      if (L[i].used || L[i].junk || !RE_CHECKIN.test(L[i].text)) continue;
      // "Arrival" alone is flight vocabulary too; outside a lodging document
      // only an explicit check-in counts.
      if (!/\bcheck[\s-]?in\b|\banreise\b/i.test(L[i].text) && !hotelDoc) continue;
      const found = dateWithTime(doc, i, 4);
      if (!found) continue;
      const onLine = L[found.line].dates;

      let outDate = null, outTime = null, lastLine = found.line;
      if (onLine[1]) {
        outDate = onLine[1];
        outTime = nearestTime(L[found.line], outDate);
        if (!outTime) {
          // A shared row below ("After 14:00  Before 12:00"): check-out is last.
          for (let j = found.line + 1; j <= Math.min(found.line + 2, L.length - 1); j++) {
            if (L[j].times.length) { outTime = L[j].times[L[j].times.length - 1]; if (L[j].times.length > 1 && !found.time) found.time = L[j].times[0]; break; }
          }
        }
      } else {
        for (let j = found.line + 1; j <= Math.min(found.line + 8, L.length - 1); j++) {
          if (L[j].used || L[j].junk || !RE_CHECKOUT.test(L[j].text)) continue;
          const out = dateWithTime(doc, j, 4);
          if (out) { outDate = out.date; outTime = out.time; lastLine = out.line; }
          break;
        }
      }
      if (!outDate) continue;

      const name = hotelName(doc, found.line);
      const address = hotelAddress(doc, found.line);
      const city = hotelCity(address, name);
      let inKey = dateKey(found.date), outKey = dateKey(outDate);
      if (outKey < inKey) { const t = inKey; inKey = outKey; outKey = t; }
      const ref = doc.text.match(/\b(?:booking (?:id|no|number|reference)|confirmation (?:number|no|code)|reservation (?:number|no))\b\.?\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{4,17})\b/i);
      const room = doc.text.match(/\broom type\s*:?\s*\n?\s*([^\n:]{3,50})$/im);
      events.push(mkEvent({
        type: 'hotel',
        icon: '🏨',
        location: address || '',
        tz: G.tzFromText(address) || G.tzFromText(name) || hotelZone(doc, found.line, lastLine),
        start: { date: inKey, time: null, inferred: found.date.yearInferred || false },
        end: { date: outKey, time: null },
        confidence: name ? 'high' : 'medium',
        meta: {
          kind: 'hotel', name: name, city: city,
          checkIn: found.time ? found.time.key : null,
          checkOut: outTime ? outTime.key : null,
          ref: ref && /\d/.test(ref[1]) ? ref[1] : firstNumberBelow(doc, /\bbooking id\b/i),
          refLabel: 'Booking ID',
          room: room ? room[1].trim() : null,
        },
      }));
      markUsed(doc, i, lastLine);
      doc.typed++;
      i = lastLine;
    }
  }

  // "Booking ID | Check-in | ..." header with the values on the next row.
  function firstNumberBelow(doc, labelRe) {
    const L = doc.lines;
    for (let i = 0; i < L.length - 1; i++) {
      if (!labelRe.test(L[i].text)) continue;
      const m = L[i + 1].text.match(/^\s*(\d{6,18})\b/);
      if (m) return m[1];
    }
    return null;
  }

  // The property's name: a "Property:" / "Hotel:" label's value, else the
  // closest short line above the dates that reads like a name.
  function hotelName(doc, atLine) {
    const L = doc.lines;
    const tidy = (s) => s
      .replace(/\b(?:confirmed|cancelled|booked|reservation|booking confirmation|booking)\b/gi, '')
      .replace(/^[\s,:;|·•\-–—]+|[\s,:;|·•\-–—]+$/g, '').trim().slice(0, 60);
    const sentence = /\b(?:your|please|upon|voucher|will|must|you|the hotel|can|this)\b/i;
    for (let i = 0; i < L.length; i++) {
      const m = L[i].text.match(/^\s*(?:property|hotel|hotel name|accommodation|property name)\s*:\s*(.*)$/i);
      if (!m) continue;
      const value = m[1].trim() || (L[i + 1] && !/:\s*$/.test(L[i + 1].text) ? L[i + 1].text.trim() : '');
      if (value && value.length <= 60 && !sentence.test(value)) return tidy(value);
    }
    for (let i = atLine; i >= Math.max(0, atLine - 12); i--) {
      const t = L[i].text;
      if (L[i].junk || t.length > 70 || !RE_LODGING.test(t) || sentence.test(t) || /:\s*$/.test(t)) continue;
      for (const seg of t.split(/[|·•:\t]|\s[-–—]\s/)) {
        if (RE_LODGING.test(seg) && tidy(seg)) return tidy(seg);
      }
    }
    return null;
  }

  function hotelAddress(doc, atLine) {
    const L = doc.lines;
    for (let i = 0; i < L.length; i++) {
      const m = L[i].text.match(/^\s*address\s*:\s*(.+)$/i);
      if (!m) continue;
      let addr = m[1].trim();
      // The address often wraps onto a later line ("..., Siem Reap, Cambodia,").
      for (let j = i + 1; j <= Math.min(i + 3, L.length - 1); j++) {
        const t = L[j].text.trim();
        if (/,\s*$/.test(t) || (/,/.test(t) && !/:/.test(t) && t.length < 70 && G.tzFromText(t))) { addr += ', ' + t; break; }
      }
      const parts = [];
      for (const part of addr.split(',').map((x) => x.trim()).filter(Boolean)) {
        if (!parts.some((x) => x.toLowerCase() === part.toLowerCase())) parts.push(part);
      }
      return parts.join(', ').slice(0, 120);
    }
    const street = /\d.*(?:street|st\b|road|rd\b|avenue|ave\b|boulevard|blvd|lane|ln\b|jalan|platz|stra(?:ss|ß)e|via\b|rue\b)|(?:via|rue|calle|strada)\s+\S+.*\d/i;
    for (let i = Math.max(0, atLine - 10); i <= Math.min(atLine + 6, L.length - 1); i++) {
      if (!street.test(L[i].text) || L[i].junk) continue;
      const near = L.slice(Math.max(0, i - 3), i + 1).map((x) => x.text).join(' ');
      if (/payable|pte|ltd\b|inc\b|company|invoice/i.test(near)) continue; // the agency's own address
      return L[i].text.trim().slice(0, 120);
    }
    return '';
  }

  // City for the title: the address part that is a known city.
  function hotelCity(address, name) {
    for (const part of String(address || '').split(',').reverse()) {
      const a = G.cityAirport(part);
      if (a && !(name && G.norm(name).includes(G.norm(a.city)))) return a.city;
      if (a) return null;
    }
    return null;
  }

  function hotelZone(doc, from, to) {
    const text = doc.lines.slice(Math.max(0, from - 12), to + 1)
      .filter((l) => !/residence|payable|nationality/i.test(l.text)).map((l) => l.text).join(' ');
    return G.tzFromText(text);
  }

  // --- generic events -----------------------------------------------------------------------

  const CATEGORIES = [
    [/\b(?:circus|cirque)\b/i, '🎪'],
    [/\b(?:aqua ?park|water ?park|aquaventure|water slides?|splash park)\b/i, '🌊'],
    [/\b(?:theat(?:re|er)|opera|musical|ballet|broadway|show|cabaret|puppet)\b/i, '🎭'],
    [/\b(?:concert|gig|festival|live music|philharmonic|symphony|dj set)\b/i, '🎵'],
    [/\b(?:cinema|movie|film|imax|screening)\b/i, '🎬'],
    [/\b(?:museum|gallery|exhibition|exhibit)\b/i, '🖼️'],
    [/\b(?:zoo|safari|aquarium|oceanarium)\b/i, '🦁'],
    [/\b(?:theme park|amusement park|disneyland|universal studios|roller ?coaster)\b/i, '🎢'],
    [/\b(?:restaurant|dinner|lunch|brunch|table for|bistro|trattoria)\b/i, '🍽️'],
    [/\b(?:spa|massage|wellness|sauna|hammam)\b/i, '💆'],
    [/\b(?:car rental|car hire|rent-a-car|pick-?up|drop-?off)\b/i, '🚗'],
    [/\b(?:transfer|taxi|shuttle|chauffeur)\b/i, '🚕'],
    [/\b(?:tour|excursion|sightseeing|guided|day trip|cruise)\b/i, '🗺️'],
    [/\b(?:match|stadium|football|soccer|nba|tennis|grand prix|formula 1)\b/i, '🏟️'],
    [/\b(?:ski|snowboard|lift pass)\b/i, '⛷️'],
    [/\b(?:diving|snorkel\w*|scuba)\b/i, '🤿'],
    [/\b(?:doctor|dentist|clinic|appointment|hospital)\b/i, '🩺'],
    [/\b(?:conference|summit|meetup|workshop|webinar|seminar)\b/i, '🎤'],
  ];
  function categoryIcon(text) {
    for (const [re, icon] of CATEGORIES) if (re.test(text)) return icon;
    return '📅';
  }

  // Any remaining dated line. Next to a real booking, a bare date is almost
  // always noise, so it must carry a clock time to count.
  function collectGeneric(doc, events, defaults) {
    const L = doc.lines;
    for (let i = 0; i < L.length; i++) {
      const line = L[i];
      if (line.used || line.junk || !line.dates.length) continue;
      const date = line.dates[0];
      let time = nearestTime(line, date);
      if (!time) {
        for (let j = i + 1; j <= Math.min(i + 3, L.length - 1) && !time; j++) {
          if (L[j].used || L[j].dates.length) break;
          if (L[j].times.length) time = L[j].times[0];
        }
      }
      if (doc.typed && !time) continue;
      const title = lineTitle(doc, i);
      const location = nearbyLabel(doc, i, /venue|address|location|where/i);
      const second = line.dates[1] || null;
      const endTime = second ? nearestTime(line, second) : (time ? line.times.find((t) => t !== time && t.index > time.index) : null);
      const around = L.slice(Math.max(0, i - 3), Math.min(L.length, i + 4)).map((x) => x.text).join(' ');
      events.push(mkEvent({
        type: 'event',
        icon: categoryIcon(title + ' ' + location + ' ' + around),
        title: title,
        location: location,
        tz: G.tzFromText(line.text + ' ' + location),
        start: startOf(date, time),
        end: second ? { date: dateKey(second), time: endTime ? endTime.key : null, dateExplicit: true }
          : endTime ? { date: dateKey(date), time: endTime.key } : null,
        confidence: time ? (second ? 'high' : 'medium') : (second ? 'medium' : 'low'),
        meta: { kind: 'event', ref: findRef(doc, Math.max(0, i - 6), Math.min(L.length - 1, i + 6)) },
      }));
      line.used = true;
    }
  }

  // Value of a "Label: value" / "Label<TAB>value" line near `at` ("Venue",
  // "Show Name"); falls back to the line after the label.
  function nearbyLabel(doc, at, re) {
    const L = doc.lines;
    for (let i = Math.max(0, at - 5); i <= Math.min(at + 5, L.length - 1); i++) {
      if (!re.test(L[i].text)) continue;
      const m = L[i].text.match(/^[^:\t]*?(?:venue|address|location|where|show name|event name|title|name)\s*[:\t]\s*(.+)$/i);
      if (m && m[1].trim()) return m[1].trim().slice(0, 80);
      const next = L[i + 1];
      if (next && !next.dates.length && !/[:\t]/.test(next.text)) return next.text.trim().split(/[|·•]/)[0].slice(0, 80);
    }
    return '';
  }

  // A human title for the dated line `at`: an explicit name label, the line
  // without its date and time, or a neighbouring heading.
  function lineTitle(doc, at) {
    const L = doc.lines;
    const labelled = nearbyLabel(doc, at, /show name|event name|\btitle\b|\bname\b/i);
    if (labelled && !/^(?:mr|mrs|ms)\b/i.test(labelled)) return labelled;
    let text = L[at].text;
    const cut = L[at].allDates.map((d) => [d.index, d.end]).concat(L[at].times.map((t) => [t.index, t.end])).sort((a, b) => b[0] - a[0]);
    for (const c of cut) text = text.slice(0, c[0]) + ' ' + text.slice(c[1]);
    text = text
      .replace(/\b(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\b[,.]?/gi, ' ')
      .replace(/\b(?:departs?|arrives?|departure|arrival|from|until)\b\s*:?\s*$/i, ' ')
      .replace(/\s+/g, ' ')
      .replace(/(?:^|\s)(?:at|on|um|am|the)\s*$/i, '')
      .replace(/^[\s,:;|·•()\-–—]+|[\s,:;|·•()\-–—]+$/g, '')
      .replace(/\s+(?:at|on|departs?|arrives?)$/i, '')
      .replace(/\s+(?:at|on)$/i, '')
      .trim();
    if (text.length >= 3 && /[a-z]{3}/i.test(text)) return text.slice(0, 80);
    for (const j of [at - 1, at - 2, at - 3, at + 1, at + 2]) {
      if (j < 0 || j >= L.length || L[j].dates.length) continue;
      const t = L[j].text.trim();
      if (t.length >= 3 && /[a-z]{3}/i.test(t)) return t.split(/[|·•\t]/)[0].trim().slice(0, 80);
    }
    return 'Event';
  }

  // --- merging ---------------------------------------------------------------------------------

  const placeKey = (p) => (p ? (p.code || G.norm(p.city || '').replace(/[^a-z0-9]/g, '')) : '');
  const transport = (ev) => ev.type === 'flight' || ev.type === 'train' || ev.type === 'bus' || ev.type === 'ferry';

  function sameTrip(a, b) {
    if (a.type !== b.type || !a.start || !b.start) return false;
    const sameDay = a.start.date === b.start.date ||
      ((a.start.inferred || b.start.inferred) && a.start.date.slice(5) === b.start.date.slice(5));
    if (!sameDay) return false;
    if (transport(a)) {
      const na = a.meta.number, nb = b.meta.number;
      if (na && nb) return na.replace(/\s+/g, '') === nb.replace(/\s+/g, '');
      const routeA = placeKey(a.meta.from) + '>' + placeKey(a.meta.to), routeB = placeKey(b.meta.from) + '>' + placeKey(b.meta.to);
      if (routeA.length > 1 && routeB.length > 1) return routeA === routeB && (!a.start.time || !b.start.time || a.start.time === b.start.time);
      return !!a.start.time && a.start.time === b.start.time;
    }
    if (a.type === 'hotel') {
      const x = G.norm(a.meta.name || ''), y = G.norm(b.meta.name || '');
      return a.end.date === b.end.date && (!x || !y || x.includes(y) || y.includes(x));
    }
    return a.title.toLowerCase() === b.title.toLowerCase() && (a.start.time || '') === (b.start.time || '');
  }

  // How much a source can be trusted for times: a boarding pass (seat, boarding
  // time) beats an itinerary, an explicit time beats none. Measured once, on
  // the event as its own document produced it — details inherited from other
  // sources later must not make a weaker source look like a boarding pass.
  function sourceRank(ev) {
    if (ev.rank == null) {
      ev.rank = (ev.start.time ? 4 : 0) + (ev.meta.seat || ev.meta.boarding ? 2 : 0) + (ev.end && ev.end.time ? 1 : 0) +
        (ev.start.inferred ? 0 : 1) + (ev.meta.from && ev.meta.to ? 1 : 0);
    }
    return ev.rank;
  }

  // Copy every detail `ev` lacks from `other`.
  function fillMeta(ev, other) {
    for (const k in other.meta) {
      const v = other.meta[k];
      if (v == null || (Array.isArray(v) && !v.length)) continue;
      const cur = ev.meta[k];
      if (cur == null || (Array.isArray(cur) && !cur.length)) ev.meta[k] = v;
      else if ((k === 'from' || k === 'to') && typeof cur === 'object') {
        for (const f in v) if (cur[f] == null) cur[f] = v[f];
      }
    }
    if (!ev.location && other.location) ev.location = other.location;
    if (!ev.tz && other.tz) ev.tz = other.tz;
    if (!ev.tzEnd && other.tzEnd) ev.tzEnd = other.tzEnd;
  }

  // One event per real-world booking: duplicates across (and within) documents
  // fold into the most trustworthy copy, which inherits what it was missing.
  function mergeEvents(events) {
    const out = [];
    for (const ev of events) {
      if (!ev.start) continue;
      const host = out.find((o) => sameTrip(o, ev));
      if (!host) { out.push(ev); continue; }
      const keep = sourceRank(ev) > sourceRank(host) ? ev : host;
      const other = keep === ev ? host : ev;
      if (keep.start.inferred && !other.start.inferred) {
        const delta = Math.round((new Date(other.start.date) - new Date(keep.start.date)) / 86400000);
        keep.start.date = other.start.date;
        keep.start.inferred = false;
        if (keep.end && keep.end.date) keep.end.date = shiftDate(keep.end.date, delta);
      }
      if (keep.start.time && other.start.time && keep.start.time !== other.start.time) {
        keep.notes.push('Another source lists departure at ' + other.start.time + (other.end && other.end.time ? ' and arrival at ' + other.end.time : '') + '.');
      }
      if (!keep.start.time && other.start.time) { keep.start.time = other.start.time; keep.rank = sourceRank(other); }
      if (!(keep.end && keep.end.time) && other.end && other.end.time && (!keep.start.time || keep.start.time === other.start.time || !other.start.time)) {
        keep.end = other.end;
      }
      fillMeta(keep, other);
      for (const n of other.notes) if (keep.notes.indexOf(n) < 0) keep.notes.push(n);
      for (const s of other.sources) if (keep.sources.indexOf(s) < 0) keep.sources.push(s);
      if (keep.confidence !== 'high' && other.confidence === 'high') keep.confidence = 'high';
      if (keep === ev) out[out.indexOf(host)] = ev;
    }
    return out;
  }

  // --- finalisation ------------------------------------------------------------------------------

  const placeLabel = (p) => (p ? (p.city || p.name || p.code || '') : '');

  function finalize(ev, defaults) {
    if (ev.type === 'flight') finalizeFlight(ev);
    else if (transport(ev)) finalizeGround(ev);
    else if (ev.type === 'hotel') finalizeHotel(ev, defaults);

    if (ev.start.inferred === 'guess') {
      ev.flags.yearAssumed = true;
      ev.notes.push('The document has no year; ' + ev.start.date.slice(0, 4) + ' is assumed.');
    } else if (ev.start.inferred) {
      ev.notes.push('The document has no year; ' + ev.start.date.slice(0, 4) + ' matches its weekday.');
    }
    if (!ev.allDay) applyDefaults(ev, defaults);
    delete ev.start.inferred;
    if (ev.end) { delete ev.end.dateExplicit; delete ev.end.nextDay; }
    for (const k of ['fallbackTitle', 'unsplit', 'word']) delete ev.meta[k];
    delete ev.rank;
    return ev;
  }

  function finalizeFlight(ev) {
    const m = ev.meta;
    if (m.from && m.from.tz) ev.tz = m.from.tz;
    if (m.to && m.to.tz) ev.tzEnd = m.to.tz;
    if (!ev.tzEnd) ev.tzEnd = ev.tz;
    const route = m.from && m.to ? placeLabel(m.from) + ' - ' + placeLabel(m.to) : '';
    if (m.number && route) ev.title = m.number + ': ' + route;
    else if (m.number) ev.title = 'Flight ' + m.number;
    else if (route) ev.title = 'Flight: ' + route;
    else ev.title = m.fallbackTitle && m.fallbackTitle !== 'Event' ? m.fallbackTitle : 'Flight';
    if (m.from) ev.location = airportLabel(m.from);

    if (!ev.start.time && m.boarding) {
      ev.start.time = m.boarding;
      ev.flags.startIsBoarding = true;
      ev.notes.push('Starts at the boarding time; the document does not state the departure time.');
    }
    const a = m.from && m.from.code ? G.airport(m.from.code) : null;
    const b = m.to && m.to.code ? G.airport(m.to.code) : null;
    if (ev.start.time && !(ev.end && ev.end.time)) {
      const stated = m.durationMin || null;
      const mins = stated || G.flightMinutes(a, b);
      const depUtc = mins && ev.tz && ev.tzEnd ? TZ.wallToUtc(ev.start.date, ev.start.time, ev.tz) : null;
      if (depUtc) {
        const lead = ev.flags.startIsBoarding ? 35 : 0;
        const wall = TZ.utcToWall(new Date(depUtc.getTime() + (mins + lead) * 60000), ev.tzEnd);
        ev.end = { date: wall.date, time: wall.time };
        if (!stated || lead) {
          ev.flags.endEstimated = true;
          ev.notes.push('Arrival time is estimated from the flight distance.');
        }
      }
    } else if (ev.end && ev.end.time) {
      if (ev.end.nextDay) ev.end.date = shiftDate(ev.end.date, 1);
      else if (!ev.end.dateExplicit && elapsedMinutes(ev.start.date, ev.start.time, ev.tz, ev.end.date, ev.end.time, ev.tzEnd) <= 0) {
        ev.end.date = shiftDate(ev.end.date, 1); // lands after midnight
      }
    }
    if (!ev.start.time) {
      ev.allDay = true;
      ev.end = { date: ev.start.date, time: null };
      ev.notes.push('The document gives no flight times, so this is an all-day event.');
    }
    ev.confidence = ev.start.time && !ev.flags.startIsBoarding && m.from && m.to ? 'high' : ev.start.time ? 'medium' : 'low';
  }

  function airportLabel(p) {
    if (!p.code) return placeLabel(p);
    const name = p.name && p.name.toLowerCase().indexOf((p.city || '').toLowerCase()) < 0 && p.city ? p.name + ' Airport, ' + p.city : (p.name || p.city) + ' Airport';
    return name + ' (' + p.code + ')' + (p.terminal ? ', Terminal ' + p.terminal : '');
  }

  function finalizeGround(ev) {
    const m = ev.meta;
    const route = m.from && m.to ? placeLabel(m.from) + ' - ' + placeLabel(m.to) : (m.unsplit || '');
    if (m.number && route) ev.title = m.number + ': ' + route;
    else if (route) ev.title = m.word + ': ' + route;
    else if (m.number) ev.title = /[a-z]{3}/i.test(m.number) ? m.number : m.word + ' ' + m.number;
    else ev.title = m.fallbackTitle && m.fallbackTitle !== 'Event' ? m.fallbackTitle : m.word;
    if (m.from) ev.location = placeLabel(m.from);
    if (ev.end && ev.end.time && !ev.end.dateExplicit && ev.end.date === ev.start.date && ev.start.time && ev.end.time < ev.start.time) {
      ev.end.date = shiftDate(ev.end.date, 1);
    }
  }

  function finalizeHotel(ev, defaults) {
    const m = ev.meta;
    ev.title = m.name ? m.name + (m.city ? ', ' + m.city : '') : 'Hotel stay';
    if (!ev.location && m.city) ev.location = m.city;
    if (defaults.hotelAllDay || (defaults.noTimeAllDay && !m.checkIn && !m.checkOut)) {
      ev.allDay = true;
    } else {
      ev.start.time = m.checkIn;
      ev.end.time = m.checkOut;
      if (!m.checkIn && !m.checkOut) ev.confidence = 'medium';
    }
  }

  // Missing start time -> all-day or the default time; a lone moment gets the
  // default duration; an end clock earlier than the start rolls to the next day.
  function applyDefaults(ev, defaults) {
    if (!ev.start.time) {
      if (defaults.noTimeAllDay) {
        ev.allDay = true;
        if (ev.end) ev.end.time = null; else ev.end = { date: ev.start.date, time: null };
        return;
      }
      ev.start.time = defaults.defaultTime;
      ev.flags.timeAssumed = true;
    }
    if (!ev.end) {
      const end = addMinutes(ev.start.time, defaults.defaultDurationMin);
      ev.end = { date: shiftDate(ev.start.date, end.dayShift), time: end.time };
      ev.flags.endAssumed = true;
    } else if (ev.end.time && ev.end.date === ev.start.date && ev.end.time < ev.start.time && !transport(ev)) {
      ev.end.date = shiftDate(ev.start.date, 1);
    }
  }

  return { parseBooking: parseBooking, parseDocuments: parseDocuments };
})();
