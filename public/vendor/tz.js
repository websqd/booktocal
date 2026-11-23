// bookingtocal — wall-clock <-> UTC conversion via Intl. Classic script exposing
// BTCTz. Shared by the parser (arrival estimates), the exporters (UTC stamps)
// and the UI (offset labels). Unknown zones return null so callers can fall
// back to floating times.
var BTCTz = (function () {
  'use strict';

  function pad2(n) { return String(n).padStart(2, '0'); }

  var formatters = {};
  function formatter(tz) {
    if (!(tz in formatters)) {
      try {
        formatters[tz] = new Intl.DateTimeFormat('en-US', {
          timeZone: tz, hourCycle: 'h23',
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
        });
      } catch (e) {
        formatters[tz] = null; // unknown zone
      }
    }
    return formatters[tz];
  }

  // Wall-clock fields of the instant `utcMs` in zone `tz`, as a UTC timestamp.
  function wallMs(utcMs, tz) {
    var f = formatter(tz);
    if (!f) return null;
    var p = {};
    var parts = f.formatToParts(new Date(utcMs));
    for (var i = 0; i < parts.length; i++) p[parts[i].type] = parts[i].value;
    var h = p.hour === '24' ? 0 : Number(p.hour);
    return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), h, Number(p.minute), Number(p.second));
  }

  // "2026-11-25" + "19:30" in Asia/Ho_Chi_Minh -> Date (UTC instant), or null.
  function wallToUtc(dateIso, timeIso, tz) {
    if (!tz || !dateIso) return null;
    var d = dateIso.split('-').map(Number);
    var t = (timeIso || '12:00').split(':').map(Number);
    var asUtc = Date.UTC(d[0], d[1] - 1, d[2], t[0], t[1], 0);
    var w1 = wallMs(asUtc, tz);
    if (w1 === null) return null;
    // Refine once so times next to a DST change use the right offset.
    var guess = asUtc - (w1 - asUtc);
    var w2 = wallMs(guess, tz);
    return new Date(asUtc - (w2 - guess));
  }

  // UTC instant -> { date: 'YYYY-MM-DD', time: 'HH:MM' } on the wall in `tz`.
  function utcToWall(date, tz) {
    var w = wallMs(date.getTime(), tz);
    if (w === null) return null;
    var d = new Date(w);
    return {
      date: d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()),
      time: pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes()),
    };
  }

  // Offset of `tz` at the given local date/time in minutes east of UTC.
  function offsetMinutes(tz, dateIso, timeIso) {
    var utc = wallToUtc(dateIso, timeIso, tz);
    if (!utc) return null;
    return Math.round((wallMs(utc.getTime(), tz) - utc.getTime()) / 60000);
  }

  // "UTC+7", "UTC+5:30", "UTC-3"; null for unknown zones.
  function offsetLabel(tz, dateIso, timeIso) {
    var m = offsetMinutes(tz, dateIso, timeIso);
    if (m === null) return null;
    var sign = m < 0 ? '-' : '+';
    var abs = Math.abs(m);
    return 'UTC' + sign + Math.floor(abs / 60) + (abs % 60 ? ':' + pad2(abs % 60) : '');
  }

  return { wallToUtc: wallToUtc, utcToWall: utcToWall, offsetMinutes: offsetMinutes, offsetLabel: offsetLabel };
})();
