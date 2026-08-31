// bookingtocal — calendar export. Classic script exposing BTCCal:
//   BTCCal.googleUrl(ev, settings) / outlookUrl / yahooUrl
//   BTCCal.icsFor(events, settings) -> RFC 5545 string
//   BTCCal.downloadIcs(events, settings, filename)
//
// Times are FLOATING (no timezone): the source text rarely states one, so the
// event lands in the user's calendar timezone rather than pretending to know
// the venue's. All-day events use VALUE=DATE with exclusive DTEND.
var BTCCal = (function () {
  'use strict';

  var CRLF = '\r\n';

  function pad2(n) { return String(n).padStart(2, '0'); }

// --- timezone handling -------------------------------------------------------
// When the parser knows the venue timezone, wall times are converted to UTC so
// the event lands at the booking's actual moment regardless of the viewer's
// calendar timezone. Unknown zones keep floating times (no Z suffix).
//
// Wall time in zone -> UTC Date, via Intl offsets (works in browser and node).
function wallToUtcDate(dateIso, timeIso, tz) {
  if (!tz) return null;
  var p = dateIso.split('-').map(Number);
  var t = (timeIso || '12:00').split(':').map(Number);
  var asUtc = Date.UTC(p[0], p[1] - 1, p[2], t[0], t[1], 0);
  function offsetMs(utcMs) {
    try {
      var dtf = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
      var parts = {};
      for (var part of dtf.formatToParts(new Date(utcMs))) parts[part.type] = part.value;
      // hour may come back "24" on some engines at midnight
      var h = parts.hour === '24' ? 0 : Number(parts.hour);
      var wallAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), h, Number(parts.minute), Number(parts.second));
      return wallAsUtc - utcMs;
    } catch (e) {
      return null; // unknown zone -> caller falls back to floating
    }
  }
  var off1 = offsetMs(asUtc);
  if (off1 === null) return null;
  var off2 = offsetMs(asUtc - off1); // refine once across DST edges (offsets in ms)
  if (off2 === null) return null;
  return new Date(asUtc - off2);
}

function utcIcs(d) {
  return d.getUTCFullYear() + pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate()) +
    'T' + pad2(d.getUTCHours()) + pad2(d.getUTCMinutes()) + pad2(d.getUTCSeconds()) + 'Z';
}

function utcIso(d) {
  return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()) +
    'T' + pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes()) + ':' + pad2(d.getUTCSeconds()) + 'Z';
}

function utcCompact(d) {
  return d.getUTCFullYear() + pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate()) +
    'T' + pad2(d.getUTCHours()) + pad2(d.getUTCMinutes()) + pad2(d.getUTCSeconds()) + 'Z';
}

function utcLinkIso(d) {
  return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()) +
    'T' + pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes()) + ':' + pad2(d.getUTCSeconds()) + 'Z';
}

function utcYahoo(d) {
  return d.getUTCFullYear() + pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate()) +
    'T' + pad2(d.getUTCHours()) + pad2(d.getUTCMinutes()) + pad2(d.getUTCSeconds()) + 'Z';
}

  function dtStamp() {
    var d = new Date();
    return d.getUTCFullYear() + pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate()) +
      'T' + pad2(d.getUTCHours()) + pad2(d.getUTCMinutes()) + pad2(d.getUTCSeconds()) + 'Z';
  }

  function fmtDate(iso) {
    return iso.replace(/-/g, '');
  }

  // Floating local datetime: YYYYMMDDTHHMMSS (no Z, no TZID).
  function fmtDateTime(dateIso, timeIso) {
    return fmtDate(dateIso) + 'T' + (timeIso || '12:00').replace(':', '') + '00';
  }

  function addDays(iso, n) {
    var p = iso.split('-').map(Number);
    var d = new Date(p[0], p[1] - 1, p[2] + n);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function escapeIcs(s) {
    return String(s == null ? '' : s)
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');
  }

  // RFC 5545 line folding: max 75 octets per line, continuations start with a space.
  function fold(line) {
    if (line.length <= 73) return line;
    var out = [line.slice(0, 73)];
    var rest = line.slice(73);
    while (rest.length) {
      out.push(' ' + rest.slice(0, 72));
      rest = rest.slice(72);
    }
    return out.join(CRLF);
  }

  // Resolve the event's effective start/end in one place. Timed events with a
  // null end time (hotel checkouts) fall back to the default time. When the
  // parser knows the venue zone, wall times are additionally converted to UTC.
  function resolve(ev, settings) {
    var defTime = settings && settings.defaultTime ? settings.defaultTime : '12:00';
    var allDay = !!ev.allDay;
    var start = { date: ev.start.date, time: allDay ? null : (ev.start.time || defTime) };
    var end = null;
    if (allDay) {
      // DTEND is exclusive: end date inclusive in the UI, +1 day in ICS.
      end = { date: addDays(ev.end && ev.end.date ? ev.end.date : ev.start.date, 1), time: null };
    } else {
      end = {
        date: ev.end && ev.end.date ? ev.end.date : ev.start.date,
        time: (ev.end && ev.end.time) ? ev.end.time : defTime,
      };
      if (end.date + 'T' + end.time <= start.date + 'T' + start.time) {
        end = { date: start.date, time: start.time };
      }
    }
    var utcStart = null, utcEnd = null;
    if (!allDay && ev.tz) {
      utcStart = wallToUtcDate(start.date, start.time, ev.tz);
      utcEnd = wallToUtcDate(end.date, end.time, ev.tzEnd || ev.tz);
      if (utcStart && !utcEnd) utcEnd = new Date(utcStart.getTime());
      if (utcStart && utcEnd && utcEnd.getTime() < utcStart.getTime()) utcEnd = new Date(utcStart.getTime());
    }
    return { start: start, end: end, allDay: allDay, utcStart: utcStart, utcEnd: utcEnd };
  }

  function description(ev) {
    var parts = [];
    if (ev.source) parts.push(ev.source.trim().slice(0, 500));
    parts.push('Created with BookToCal (booktocal.com) \u2014 parsed locally in the browser.');
    return parts.join('\n');
  }

  function icsFor(events, settings) {
    var lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//BookToCal//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
    ];
    var stamp = dtStamp();
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      var r = resolve(ev, settings);
      lines.push('BEGIN:VEVENT');
      lines.push('UID:' + uid() + '@booktocal.com');
      lines.push('DTSTAMP:' + stamp);
      if (r.allDay) {
        lines.push('DTSTART;VALUE=DATE:' + fmtDate(r.start.date));
        lines.push('DTEND;VALUE=DATE:' + fmtDate(r.end.date));
      } else if (r.utcStart) {
        lines.push('DTSTART:' + utcIcs(r.utcStart));
        lines.push('DTEND:' + utcIcs(r.utcEnd));
      } else {
        lines.push('DTSTART:' + fmtDateTime(r.start.date, r.start.time));
        lines.push('DTEND:' + fmtDateTime(r.end.date, r.end.time));
      }
      lines.push('SUMMARY:' + escapeIcs(ev.title || 'Event'));
      if (ev.location) lines.push('LOCATION:' + escapeIcs(ev.location));
      lines.push('DESCRIPTION:' + escapeIcs(description(ev)));
      lines.push('END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return lines.map(fold).join(CRLF) + CRLF;
  }

  var uidCounter = 0;
  function uid() {
    var bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    var hex = '';
    for (var i = 0; i < bytes.length; i++) hex += pad2(bytes[i].toString(16));
    return Date.now().toString(36) + '-' + (uidCounter++) + '-' + hex;
  }

  function downloadIcs(events, settings, filename) {
    var ics = icsFor(events, settings);
    var blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename || 'booktocal.ics';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 5000);
  }

  function googleUrl(ev, settings) {
    var r = resolve(ev, settings);
    var dates;
    if (r.allDay) {
      dates = fmtDate(r.start.date) + '/' + fmtDate(r.end.date);
    } else if (r.utcStart) {
      dates = utcCompact(r.utcStart) + '/' + utcCompact(r.utcEnd);
    } else {
      dates = fmtDateTime(r.start.date, r.start.time) + '/' + fmtDateTime(r.end.date, r.end.time);
    }
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE' +
      '&text=' + encodeURIComponent(ev.title || 'Event') +
      '&dates=' + dates +
      '&details=' + encodeURIComponent(description(ev)) +
      (ev.location ? '&location=' + encodeURIComponent(ev.location) : '');
  }

  function outlookUrl(ev, settings) {
    var r = resolve(ev, settings);
    var startdt, enddt;
    if (r.allDay) {
      // Outlook all-day enddt is exclusive.
      startdt = r.start.date;
      enddt = r.end.date;
    } else if (r.utcStart) {
      startdt = utcLinkIso(r.utcStart);
      enddt = utcLinkIso(r.utcEnd);
    } else {
      startdt = r.start.date + 'T' + r.start.time + ':00';
      enddt = r.end.date + 'T' + r.end.time + ':00';
    }
    return 'https://outlook.live.com/calendar/0/deeplink/compose' +
      '?path=/calendar/action/compose&rru=addevent' +
      '&subject=' + encodeURIComponent(ev.title || 'Event') +
      '&startdt=' + encodeURIComponent(startdt) +
      '&enddt=' + encodeURIComponent(enddt) +
      (r.allDay ? '&allday=true' : '') +
      '&body=' + encodeURIComponent(description(ev)) +
      (ev.location ? '&location=' + encodeURIComponent(ev.location) : '');
  }

  function yahooUrl(ev, settings) {
    var r = resolve(ev, settings);
    var st, dur;
    if (r.allDay) {
      st = fmtDate(r.start.date);
      dur = 'allday';
    } else {
      // Durations are zone-independent; start carries the zone (UTC when known).
      st = r.utcStart ? utcYahoo(r.utcStart) : fmtDateTime(r.start.date, r.start.time);
      var p1 = r.start.time.split(':').map(Number);
      var p2 = r.end.time.split(':').map(Number);
      var mins = (p2[0] * 60 + p2[1]) - (p1[0] * 60 + p1[1]);
      if (mins < 0) mins += 24 * 60;
      dur = pad2(Math.floor(mins / 60)) + pad2(mins % 60);
    }
    return 'https://calendar.yahoo.com/?v=60&type=20' +
      '&title=' + encodeURIComponent(ev.title || 'Event') +
      '&st=' + st +
      '&dur=' + dur +
      '&desc=' + encodeURIComponent(description(ev)) +
      (ev.location ? '&in_loc=' + encodeURIComponent(ev.location) : '');
  }

  return {
    icsFor: icsFor,
    downloadIcs: downloadIcs,
    googleUrl: googleUrl,
    outlookUrl: outlookUrl,
    yahooUrl: yahooUrl,
  };
})();
