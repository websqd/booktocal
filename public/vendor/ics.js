// bookingtocal — calendar export. Classic script exposing BTCCal; depends on
// BTCTz (tz.js).
//   BTCCal.titleOf(ev, settings)        title with the emoji prefix when enabled
//   BTCCal.describe(ev)                 plain-text description built from ev.meta
//   BTCCal.googleUrl / outlookUrl / yahooUrl (ev, settings)
//   BTCCal.icsFor(events, settings) -> RFC 5545 string
//   BTCCal.downloadIcs(events, settings, filename)
//
// When the parser knows the venue timezone (ev.tz, and ev.tzEnd for the far end
// of a journey) wall times are exported as UTC instants, so a 19:30 departure
// from Ho Chi Minh City is 19:30 there no matter where the calendar is viewed.
// Without a zone the times stay floating. All-day events use VALUE=DATE with an
// exclusive DTEND. Titles and descriptions are built here, at export time, so
// edits made in the UI are always reflected.
var BTCCal = (function () {
  'use strict';

  var CRLF = '\r\n';
  var FOOTER = 'Created with BookToCal (booktocal.com)';
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function pad2(n) { return String(n).padStart(2, '0'); }

  // --- formatting helpers ---------------------------------------------------------

  // "2026-11-25" -> "Wed 25 Nov 2026"
  function niceDate(iso) {
    var p = iso.split('-').map(Number);
    var d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    return DAYS[d.getUTCDay()] + ' ' + p[2] + ' ' + MONTHS[p[1] - 1] + ' ' + p[0];
  }

  // 95 -> "1h 35m"
  function niceDuration(mins) {
    if (mins == null || mins < 0) return '';
    var h = Math.floor(mins / 60), m = mins % 60;
    return (h ? h + 'h' : '') + (h && m ? ' ' : '') + (m || !h ? m + 'm' : '');
  }

  function addDays(iso, n) {
    var p = iso.split('-').map(Number);
    var d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
    return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
  }

  function daysBetween(a, b) {
    var p = a.split('-').map(Number), q = b.split('-').map(Number);
    return Math.round((Date.UTC(q[0], q[1] - 1, q[2]) - Date.UTC(p[0], p[1] - 1, p[2])) / 86400000);
  }

  function stamp(d, sep) {
    var date = d.getUTCFullYear() + sep + pad2(d.getUTCMonth() + 1) + sep + pad2(d.getUTCDate());
    var colon = sep ? ':' : '';
    return date + 'T' + pad2(d.getUTCHours()) + colon + pad2(d.getUTCMinutes()) + colon + pad2(d.getUTCSeconds()) + 'Z';
  }
  var compact = function (iso) { return iso.replace(/-/g, ''); };
  var floating = function (dateIso, timeIso) { return compact(dateIso) + 'T' + timeIso.replace(':', '') + '00'; };

  // --- resolving an event's effective start/end ------------------------------------

  // One place decides what gets exported. Timed events with no end time (or an
  // end before the start) collapse to a zero-length event at the start.
  function resolve(ev, settings) {
    var defTime = settings && settings.defaultTime ? settings.defaultTime : '12:00';
    var allDay = !!ev.allDay;
    var start = { date: ev.start.date, time: allDay ? null : (ev.start.time || defTime) };
    var end;
    if (allDay) {
      var last = ev.end && ev.end.date && ev.end.date >= ev.start.date ? ev.end.date : ev.start.date;
      end = { date: addDays(last, 1), time: null }; // exclusive
    } else {
      end = {
        date: ev.end && ev.end.date ? ev.end.date : ev.start.date,
        time: ev.end && ev.end.time ? ev.end.time : (ev.end && ev.end.date && ev.end.date > ev.start.date ? defTime : start.time),
      };
    }
    var utcStart = null, utcEnd = null;
    if (!allDay && ev.tz) {
      utcStart = BTCTz.wallToUtc(start.date, start.time, ev.tz);
      utcEnd = BTCTz.wallToUtc(end.date, end.time, ev.tzEnd || ev.tz);
      if (utcStart && (!utcEnd || utcEnd < utcStart)) utcEnd = new Date(utcStart.getTime());
    }
    if (!allDay && !utcStart && end.date + 'T' + end.time < start.date + 'T' + start.time) {
      end = { date: start.date, time: start.time };
    }
    var minutes = null;
    if (!allDay) {
      minutes = utcStart ? Math.round((utcEnd - utcStart) / 60000)
        : daysBetween(start.date, end.date) * 1440 + toMinutes(end.time) - toMinutes(start.time);
    }
    return { start: start, end: end, allDay: allDay, utcStart: utcStart, utcEnd: utcEnd, minutes: minutes };
  }

  function toMinutes(hhmm) {
    var p = hhmm.split(':').map(Number);
    return p[0] * 60 + p[1];
  }

  // --- title and description ----------------------------------------------------------

  function titleOf(ev, settings) {
    var title = ev.title || 'Event';
    var emoji = !settings || settings.emoji !== false;
    return emoji && ev.icon ? ev.icon + ' ' + title : title;
  }

  // "19:30 (UTC+7)" — the offset is what tells a traveller whose 19:30 it is.
  function clock(dateIso, timeIso, tz) {
    var off = tz ? BTCTz.offsetLabel(tz, dateIso, timeIso) : null;
    return timeIso + (off ? ' (' + off + ')' : '');
  }

  function placeText(p) {
    if (!p) return '';
    var s = p.city || p.name || p.code || '';
    if (p.code && s !== p.code) s += ' (' + p.code + ')';
    if (p.name && p.city && p.name.toLowerCase().indexOf(p.city.toLowerCase()) < 0) s += ', ' + p.name + ' Airport';
    if (p.terminal) s += ', Terminal ' + p.terminal;
    return s;
  }

  // Description lines for one event, built from the structured details the
  // parser kept in ev.meta plus the event's current start/end.
  function detailLines(ev, settings) {
    var m = ev.meta || {};
    var r = resolve(ev, settings);
    var lines = [];
    var add = function (label, value) { if (value) lines.push(label + ': ' + value); };
    var kind = m.kind || ev.type;

    if (kind === 'flight' || kind === 'train' || kind === 'bus' || kind === 'ferry') {
      var word = kind.charAt(0).toUpperCase() + kind.slice(1);
      if (kind === 'flight') {
        if (m.airline || m.number) lines.push([m.airline, m.number].filter(Boolean).join(' '));
      } else if (m.number) {
        lines.push(/[a-z]{3}/i.test(m.number) ? m.number : word + ' ' + m.number);
      }
      if (!r.allDay) {
        var from = placeText(m.from), to = placeText(m.to);
        lines.push('Departs: ' + niceDate(r.start.date) + ', ' + clock(r.start.date, r.start.time, ev.tz) + (from ? ' · ' + from : ''));
        if (ev.end && ev.end.time) {
          lines.push('Arrives: ' + niceDate(r.end.date) + ', ' + clock(r.end.date, r.end.time, ev.tzEnd || ev.tz) + (to ? ' · ' + to : ''));
          if (r.minutes > 0) add('Duration', niceDuration(r.minutes));
        } else if (to) {
          lines.push('To: ' + to);
        }
      } else {
        add('Route', [placeText(m.from), placeText(m.to)].filter(Boolean).join(' → '));
      }
      if (m.via && m.via.length) add('Connecting', m.via.join(', '));
      add('Boarding', m.boarding);
      add('Gate', m.gate);
      add('Coach', m.coach);
      add('Seat', m.seat);
      add('Booking ref', m.ref);
    } else if (kind === 'hotel') {
      add('Check-in', niceDate(ev.start.date) + (m.checkIn ? ', from ' + m.checkIn : ''));
      var out = ev.end && ev.end.date ? ev.end.date : ev.start.date;
      add('Check-out', niceDate(out) + (m.checkOut ? ', until ' + m.checkOut : ''));
      var nights = daysBetween(ev.start.date, out);
      if (nights > 0) add('Nights', String(nights));
      add('Room', m.room);
      add('Address', ev.location);
      add(m.refLabel || 'Booking ref', m.ref);
    } else if (kind === 'deadline') {
      add(m.label || 'Deadline', niceDate(ev.start.date));
      add(m.refLabel || 'Reference', m.ref);
    } else {
      if (!r.allDay) {
        lines.push('When: ' + niceDate(r.start.date) + ', ' + clock(r.start.date, r.start.time, ev.tz));
      }
      add('Where', ev.location);
      add('Booking ref', m.ref);
    }
    var notes = ev.notes || [];
    for (var i = 0; i < notes.length; i++) lines.push('Note: ' + notes[i]);
    return lines;
  }

  function describe(ev, settings) {
    var lines = detailLines(ev, settings);
    if (lines.length) lines.push('');
    lines.push(FOOTER);
    return lines.join('\n');
  }

  // --- ICS ------------------------------------------------------------------------------

  function escapeIcs(s) {
    return String(s == null ? '' : s)
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');
  }

  // RFC 5545 folding: at most 75 OCTETS per line, continuation lines start with
  // a space. Counted in UTF-8 bytes and cut between characters, so an emoji or
  // accented letter is never split across lines.
  function fold(line) {
    var out = [], cur = '', bytes = 0, limit = 75;
    for (var ch of line) {
      var n = ch.codePointAt(0);
      var size = n < 0x80 ? 1 : n < 0x800 ? 2 : n < 0x10000 ? 3 : 4;
      if (bytes + size > limit) {
        out.push(cur);
        cur = ' ';
        bytes = 1;
      }
      cur += ch;
      bytes += size;
    }
    out.push(cur);
    return out.join(CRLF);
  }

  var uidCounter = 0;
  function uid() {
    var bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    var hex = '';
    for (var i = 0; i < bytes.length; i++) hex += pad2(bytes[i].toString(16));
    return Date.now().toString(36) + '-' + (uidCounter++) + '-' + hex;
  }

  function icsFor(events, settings) {
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//BookToCal//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    var now = stamp(new Date(), '');
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      var r = resolve(ev, settings);
      lines.push('BEGIN:VEVENT');
      lines.push('UID:' + uid() + '@booktocal.com');
      lines.push('DTSTAMP:' + now);
      if (r.allDay) {
        lines.push('DTSTART;VALUE=DATE:' + compact(r.start.date));
        lines.push('DTEND;VALUE=DATE:' + compact(r.end.date));
      } else if (r.utcStart) {
        lines.push('DTSTART:' + stamp(r.utcStart, ''));
        lines.push('DTEND:' + stamp(r.utcEnd, ''));
      } else {
        lines.push('DTSTART:' + floating(r.start.date, r.start.time));
        lines.push('DTEND:' + floating(r.end.date, r.end.time));
      }
      lines.push('SUMMARY:' + escapeIcs(titleOf(ev, settings)));
      if (ev.location) lines.push('LOCATION:' + escapeIcs(ev.location));
      lines.push('DESCRIPTION:' + escapeIcs(describe(ev, settings)));
      lines.push('END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return lines.map(fold).join(CRLF) + CRLF;
  }

  function downloadIcs(events, settings, filename) {
    var blob = new Blob([icsFor(events, settings)], { type: 'text/calendar;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename || 'booktocal.ics';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
  }

  // --- web calendar links -----------------------------------------------------------------

  var enc = encodeURIComponent;

  function googleUrl(ev, settings) {
    var r = resolve(ev, settings);
    var dates;
    if (r.allDay) dates = compact(r.start.date) + '/' + compact(r.end.date);
    else if (r.utcStart) dates = stamp(r.utcStart, '') + '/' + stamp(r.utcEnd, '');
    else dates = floating(r.start.date, r.start.time) + '/' + floating(r.end.date, r.end.time);
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE' +
      '&text=' + enc(titleOf(ev, settings)) +
      '&dates=' + dates +
      // Shows the event in the departure zone in Google's editor.
      (r.utcStart && ev.tz ? '&ctz=' + enc(ev.tz) : '') +
      '&details=' + enc(describe(ev, settings)) +
      (ev.location ? '&location=' + enc(ev.location) : '');
  }

  function outlookUrl(ev, settings) {
    var r = resolve(ev, settings);
    var startdt, enddt;
    if (r.allDay) {
      startdt = r.start.date;
      enddt = r.end.date; // exclusive, as Outlook expects
    } else if (r.utcStart) {
      startdt = stamp(r.utcStart, '-');
      enddt = stamp(r.utcEnd, '-');
    } else {
      startdt = r.start.date + 'T' + r.start.time + ':00';
      enddt = r.end.date + 'T' + r.end.time + ':00';
    }
    return 'https://outlook.live.com/calendar/0/deeplink/compose' +
      '?path=/calendar/action/compose&rru=addevent' +
      '&subject=' + enc(titleOf(ev, settings)) +
      '&startdt=' + enc(startdt) +
      '&enddt=' + enc(enddt) +
      (r.allDay ? '&allday=true' : '') +
      '&body=' + enc(describe(ev, settings)) +
      (ev.location ? '&location=' + enc(ev.location) : '');
  }

  function yahooUrl(ev, settings) {
    var r = resolve(ev, settings);
    var when;
    if (r.allDay) {
      when = '&st=' + compact(r.start.date) + '&et=' + compact(addDays(r.end.date, -1)) + '&dur=allday';
    } else {
      // Yahoo takes a start plus an HHMM duration (which is zone-independent).
      var mins = Math.max(0, Math.min(r.minutes, 99 * 60 + 59));
      when = '&st=' + (r.utcStart ? stamp(r.utcStart, '') : floating(r.start.date, r.start.time)) +
        '&dur=' + pad2(Math.floor(mins / 60)) + pad2(mins % 60);
    }
    return 'https://calendar.yahoo.com/?v=60&type=20' +
      '&title=' + enc(titleOf(ev, settings)) +
      when +
      '&desc=' + enc(describe(ev, settings)) +
      (ev.location ? '&in_loc=' + enc(ev.location) : '');
  }

  return {
    titleOf: titleOf,
    describe: describe,
    detailLines: detailLines,
    resolve: resolve,
    niceDate: niceDate,
    niceDuration: niceDuration,
    icsFor: icsFor,
    downloadIcs: downloadIcs,
    googleUrl: googleUrl,
    outlookUrl: outlookUrl,
    yahooUrl: yahooUrl,
  };
})();
