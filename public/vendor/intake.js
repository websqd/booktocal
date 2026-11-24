// bookingtocal — turning files into text. Classic script exposing BTCIntake;
// uses BTCExtract (extract.js) for PDFs. Everything runs in the browser: no
// file is uploaded anywhere.
//
//   BTCIntake.kindOf(file)            'pdf' | 'image' | 'eml' | 'html' | 'pkpass' | 'text' | null
//   BTCIntake.read(file, env)         -> Promise<[{ name, text }]>  (an email can
//                                        yield several documents: body + attachments)
//   env: { pdfjs: () => Promise<pdf.js module>, onProgress(message) }
//
// The pure converters (htmlToText, parseEml, unzip, passToText) have no DOM
// dependency and are covered by tests/intake.test.mjs.
var BTCIntake = (function () {
  'use strict';

  var ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.gif,.bmp,.eml,.html,.htm,.txt,.pkpass,application/pdf,image/*,text/plain,text/html,message/rfc822,application/vnd.apple.pkpass';

  function kindOf(file) {
    var name = String(file.name || '').toLowerCase();
    var type = String(file.type || '').toLowerCase();
    if (type === 'application/pdf' || /\.pdf$/.test(name)) return 'pdf';
    if (/\.pkpass$/.test(name) || type === 'application/vnd.apple.pkpass') return 'pkpass';
    if (/\.eml$/.test(name) || type === 'message/rfc822') return 'eml';
    if (/\.html?$/.test(name) || type === 'text/html') return 'html';
    if (/^image\//.test(type) || /\.(png|jpe?g|webp|gif|bmp)$/.test(name)) return 'image';
    if (/^text\//.test(type) || /\.(txt|text|md|csv)$/.test(name)) return 'text';
    return null;
  }

  // --- HTML -> text -------------------------------------------------------------------

  var ENTITIES = {
    nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", rarr: '→', larr: '←', middot: '·', bull: '•',
    ndash: '–', mdash: '—', hellip: '…', copy: '©', reg: '®', euro: '€', pound: '£', deg: '°', times: '×',
    lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', zwnj: '', zwj: '', shy: '',
    aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', agrave: 'à', egrave: 'è', igrave: 'ì', ograve: 'ò',
    ugrave: 'ù', acirc: 'â', ecirc: 'ê', icirc: 'î', ocirc: 'ô', ucirc: 'û', auml: 'ä', euml: 'ë', iuml: 'ï', ouml: 'ö',
    uuml: 'ü', atilde: 'ã', otilde: 'õ', ntilde: 'ñ', ccedil: 'ç', aring: 'å', oslash: 'ø', aelig: 'æ', szlig: 'ß',
  };

  function decodeEntities(s) {
    return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, function (all, body) {
      if (body.charAt(0) === '#') {
        var code = body.charAt(1).toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
        if (!isFinite(code) || code <= 0 || code > 0x10ffff) return ' ';
        try { return String.fromCodePoint(code); } catch (e) { return ' '; }
      }
      var key = body.toLowerCase();
      if (!Object.prototype.hasOwnProperty.call(ENTITIES, key)) return all;
      // "&Eacute;" is the capital of "&eacute;".
      return /^[A-Z][a-z]/.test(body) && ENTITIES[key].length === 1 ? ENTITIES[key].toUpperCase() : ENTITIES[key];
    });
  }

  // Layout survives as line breaks (blocks, rows) and tabs (table cells), which
  // is what the parser's table logic expects.
  function htmlToText(html) {
    var s = String(html || '')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|head|title|svg|noscript)\b[\s\S]*?<\/\1\s*>/gi, ' ')
      .replace(/\r?\n/g, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:td|th)\s*>/gi, '\t')
      .replace(/<\/(?:p|div|tr|li|h[1-6]|table|section|article|header|footer|blockquote|ul|ol|dd|dt)\s*>/gi, '\n')
      .replace(/<(?:p|div|tr|li|h[1-6]|table|hr)\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, '');
    s = decodeEntities(s).replace(/[​‌‍﻿]/g, '');
    return s.split('\n')
      .map(function (line) { return line.replace(/[  ]+/g, ' ').replace(/ ?\t ?/g, '\t').replace(/^[\t ]+|[\t ]+$/g, ''); })
      .filter(function (line) { return line.replace(/\t/g, '').trim(); })
      .join('\n');
  }

  // --- bytes helpers ---------------------------------------------------------------------

  function latin1(bytes) {
    var out = '', chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) out += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    return out;
  }

  function bytesOf(binary) {
    var out = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i) & 0xff;
    return out;
  }

  function decodeText(bytes, charset) {
    try { return new TextDecoder(charset || 'utf-8').decode(bytes); } catch (e) { return new TextDecoder('utf-8').decode(bytes); }
  }

  function fromBase64(s) {
    var clean = s.replace(/[^A-Za-z0-9+/=]/g, '');
    try { return bytesOf(atob(clean)); } catch (e) { return new Uint8Array(0); }
  }

  function fromQuotedPrintable(s) {
    return bytesOf(s.replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, function (all, hex) { return String.fromCharCode(parseInt(hex, 16)); }));
  }

  // --- email (.eml) ------------------------------------------------------------------------

  // RFC 2047 "=?utf-8?B?...?=" header words.
  function decodeHeaderWords(value) {
    return String(value || '').replace(/=\?([^?]+)\?([bq])\?([^?]*)\?=(?:\s+(?==\?))?/gi, function (all, charset, enc, data) {
      var bytes = enc.toLowerCase() === 'b' ? fromBase64(data) : fromQuotedPrintable(data.replace(/_/g, ' '));
      return decodeText(bytes, charset);
    });
  }

  function splitHeaders(raw) {
    var m = raw.match(/\r?\n\r?\n/);
    var head = m ? raw.slice(0, m.index) : raw;
    var body = m ? raw.slice(m.index + m[0].length) : '';
    var headers = {};
    head.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/).forEach(function (line) {
      var i = line.indexOf(':');
      if (i > 0) headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
    });
    return { headers: headers, body: body };
  }

  function headerParam(value, name) {
    var m = String(value || '').match(new RegExp('(?:^|;)\\s*' + name + '\\*?=\\s*(?:"([^"]*)"|([^;\\s]*))', 'i'));
    return m ? (m[1] != null ? m[1] : m[2]) : '';
  }

  // Walk a MIME tree. `raw` is a binary string (one char per byte).
  function walkMime(raw, out, depth) {
    var part = splitHeaders(raw);
    var ctype = part.headers['content-type'] || 'text/plain';
    var type = ctype.split(';')[0].trim().toLowerCase();
    if (/^multipart\//.test(type) && depth < 8) {
      var boundary = headerParam(ctype, 'boundary');
      if (!boundary) return;
      var pieces = part.body.split('--' + boundary);
      for (var i = 1; i < pieces.length; i++) {
        if (/^--/.test(pieces[i])) break; // closing delimiter
        walkMime(pieces[i].replace(/^\r?\n/, ''), out, depth + 1);
      }
      return;
    }
    var encoding = (part.headers['content-transfer-encoding'] || '').toLowerCase();
    var bytes = encoding === 'base64' ? fromBase64(part.body)
      : encoding === 'quoted-printable' ? fromQuotedPrintable(part.body)
        : bytesOf(part.body);
    var disposition = part.headers['content-disposition'] || '';
    var name = decodeHeaderWords(headerParam(disposition, 'filename') || headerParam(ctype, 'name'));
    if (type === 'message/rfc822' && depth < 8) { walkMime(latin1(bytes), out, depth + 1); return; }
    var attached = /attachment/i.test(disposition) || !!name;
    if (type === 'text/plain' && !attached) out.plain.push(decodeText(bytes, headerParam(ctype, 'charset')));
    else if (type === 'text/html' && !attached) out.html.push(decodeText(bytes, headerParam(ctype, 'charset')));
    else out.attachments.push({ name: name || 'attachment', type: type, bytes: bytes });
  }

  // parseEml(bytes) -> { subject, text, attachments: [{ name, type, bytes }] }
  function parseEml(bytes) {
    var raw = latin1(bytes);
    var out = { plain: [], html: [], attachments: [] };
    walkMime(raw, out, 0);
    var subject = decodeHeaderWords(splitHeaders(raw).headers.subject || '');
    var plain = out.plain.join('\n').trim();
    // Booking emails often ship a token text part ("view this email in your
    // browser"); the HTML part is then the real content.
    var body = plain.length >= 200 || !out.html.length ? plain : htmlToText(out.html.join('\n'));
    return { subject: subject, text: (subject ? subject + '\n' : '') + body, attachments: out.attachments };
  }

  // --- zip (.pkpass) ----------------------------------------------------------------------

  var MAX_ENTRY = 5 * 1024 * 1024; // a pass.json is a few KB

  // Stops at `limit` bytes of output: the sizes in a zip header can lie.
  async function inflateRaw(bytes, limit) {
    var reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
    var chunks = [], total = 0;
    for (;;) {
      var step = await reader.read();
      if (step.done) break;
      total += step.value.length;
      if (total > limit) {
        try { await reader.cancel(); } catch (e) {}
        throw new Error('Zip entry is too large');
      }
      chunks.push(step.value);
    }
    var out = new Uint8Array(total), at = 0;
    for (var i = 0; i < chunks.length; i++) { out.set(chunks[i], at); at += chunks[i].length; }
    return out;
  }

  // unzip(bytes, wanted) -> { name: Uint8Array } for entries whose name passes
  // `wanted(name)`. Reads the central directory; supports stored and deflated.
  async function unzip(bytes, wanted) {
    var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var eocd = -1;
    for (var i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
      if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Not a zip archive');
    var count = view.getUint16(eocd + 10, true);
    var at = view.getUint32(eocd + 16, true);
    var files = {};
    for (var n = 0; n < count && at + 46 <= bytes.length; n++) {
      if (view.getUint32(at, true) !== 0x02014b50) break;
      var method = view.getUint16(at + 10, true);
      var size = view.getUint32(at + 20, true);
      var fullSize = view.getUint32(at + 24, true);
      var nameLen = view.getUint16(at + 28, true);
      var extraLen = view.getUint16(at + 30, true);
      var commentLen = view.getUint16(at + 32, true);
      var local = view.getUint32(at + 42, true);
      var name = decodeText(bytes.subarray(at + 46, at + 46 + nameLen), 'utf-8');
      at += 46 + nameLen + extraLen + commentLen;
      if (wanted && !wanted(name)) continue;
      if (size > MAX_ENTRY || fullSize > MAX_ENTRY) continue;
      var dataAt = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      var data = bytes.subarray(dataAt, dataAt + size);
      files[name] = method === 0 ? data : method === 8 ? await inflateRaw(data, MAX_ENTRY) : new Uint8Array(0);
    }
    return files;
  }

  // --- Apple Wallet pass -> text -------------------------------------------------------------

  var TRANSIT = { PKTransitTypeAir: 'Flight boarding pass', PKTransitTypeTrain: 'Train ticket', PKTransitTypeBus: 'Bus ticket', PKTransitTypeBoat: 'Ferry ticket' };

  // "2026-11-23T14:20:00+07:00" -> "2026-11-23 14:20": the wall time at the venue.
  function wallTime(value) {
    var m = String(value == null ? '' : value).match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
    return m ? m[1] + ' ' + m[2] : String(value == null ? '' : value);
  }

  // Lay a pass out as labelled lines the booking parser understands.
  function passToText(pass) {
    var lines = [];
    var style = ['boardingPass', 'eventTicket', 'generic', 'coupon', 'storeCard'].filter(function (k) { return pass && pass[k]; })[0];
    var body = (style && pass[style]) || {};
    lines.push([pass.organizationName, pass.description].filter(Boolean).join(' — '));
    if (style === 'boardingPass') lines.push(TRANSIT[body.transitType] || 'Boarding pass');
    if (style === 'eventTicket') lines.push('Event ticket');
    var primary = body.primaryFields || [];
    if (style === 'boardingPass' && primary.length === 2) {
      var end = function (f) { return /^[A-Z]{3}$/.test(String(f.value)) ? (f.label ? f.label + ' ' : '') + '(' + f.value + ')' : String(f.value); };
      lines.push(end(primary[0]) + ' → ' + end(primary[1]));
      primary = [];
    }
    if (pass.relevantDate) lines.push((style === 'boardingPass' ? 'Departure: ' : 'Date: ') + wallTime(pass.relevantDate));
    var groups = [body.headerFields, primary, body.secondaryFields, body.auxiliaryFields];
    for (var g = 0; g < groups.length; g++) {
      var fields = groups[g] || [];
      for (var i = 0; i < fields.length; i++) {
        var f = fields[i];
        if (f == null || f.value == null || f.value === '') continue;
        lines.push((f.label ? f.label + ': ' : '') + wallTime(f.value));
      }
    }
    return lines.filter(Boolean).join('\n');
  }

  async function readPass(bytes) {
    var files = await unzip(bytes, function (name) { return name === 'pass.json'; });
    if (!files['pass.json']) throw new Error('No pass.json in this pass');
    return passToText(JSON.parse(decodeText(files['pass.json'], 'utf-8')));
  }

  // --- OCR (browser only) ------------------------------------------------------------------

  var TESS = '/vendor/tesseract/';
  var ocrWorker = null;
  var ocrProgress = null;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Could not load ' + src)); };
      document.head.appendChild(s);
    });
  }

  async function getOcrWorker() {
    if (ocrWorker) return ocrWorker;
    if (typeof Tesseract === 'undefined') await loadScript(TESS + 'tesseract.min.js');
    ocrWorker = await Tesseract.createWorker('eng', 1, {
      workerPath: TESS + 'worker.min.js',
      corePath: TESS + 'tesseract-core-simd-lstm.wasm.js',
      langPath: TESS + 'lang',
      workerBlobURL: false, // the CSP only allows same-origin workers
      gzip: true,
      logger: function (m) { if (ocrProgress && m.status === 'recognizing text') ocrProgress(m.progress); },
    });
    return ocrWorker;
  }

  var MAX_CANVAS_AREA = 16000000;

  // Screenshots carry small type; doubling the pixels (on white, so transparent
  // PNGs do not turn black) is what makes Tesseract read "VJ953" not "VI953".
  function upscaleFactor(width, height) {
    var scale = Math.max(1, Math.min(3, 2400 / Math.max(width, 1)));
    if (width * scale > 4096) scale = 4096 / width;
    // iOS Safari returns a blank canvas above ~16.7 million pixels.
    var area = width * scale * height * scale;
    if (area > MAX_CANVAS_AREA) scale *= Math.sqrt(MAX_CANVAS_AREA / area);
    return scale;
  }

  function upscale(source, width, height) {
    var scale = upscaleFactor(width, height);
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(width * scale));
    canvas.height = Math.max(1, Math.floor(height * scale));
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  async function ocrCanvas(canvas, onProgress) {
    var worker = await getOcrWorker();
    ocrProgress = onProgress || null;
    try {
      var result = await worker.recognize(canvas);
      return result.data.text || '';
    } finally {
      ocrProgress = null;
    }
  }

  async function ocrImage(blob, onProgress) {
    var bitmap = await createImageBitmap(blob);
    try {
      return await ocrCanvas(upscale(bitmap, bitmap.width, bitmap.height), onProgress);
    } finally {
      if (bitmap.close) bitmap.close();
    }
  }

  // Scanned PDFs have no text layer: render the pages and read them.
  async function ocrPdf(pdfjs, bytes, onProgress) {
    var doc = await pdfjs.getDocument({ data: bytes }).promise;
    var pages = Math.min(doc.numPages, 6);
    var text = [];
    for (var p = 1; p <= pages; p++) {
      var page = await doc.getPage(p);
      var viewport = page.getViewport({ scale: 2 });
      var canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport, canvas: canvas }).promise;
      text.push(await ocrCanvas(canvas, function (f) { if (onProgress) onProgress((p - 1 + f) / pages); }));
    }
    try { await doc.destroy(); } catch (e) {}
    return text.join('\n');
  }

  async function releaseOcr() {
    var w = ocrWorker;
    ocrWorker = null;
    if (w) { try { await w.terminate(); } catch (e) {} }
  }

  // --- reading one file ----------------------------------------------------------------------

  var MAX_BYTES = 30 * 1024 * 1024;

  // env: { pdfjs: async () => module, onProgress: (message) => void }
  async function read(file, env) {
    env = env || {};
    var progress = env.onProgress || function () {};
    var kind = kindOf(file);
    if (!kind) throw new Error('Unsupported file type');
    if (file.size > MAX_BYTES) throw new Error('File is larger than 30 MB');
    var bytes = new Uint8Array(await file.arrayBuffer());
    return readBytes(file.name, kind, bytes, file, env, progress, 0);
  }

  async function readBytes(name, kind, bytes, blob, env, progress, depth) {
    if (kind === 'text') return [{ name: name, text: decodeText(bytes) }];
    if (kind === 'html') return [{ name: name, text: htmlToText(decodeText(bytes)) }];
    if (kind === 'pkpass') return [{ name: name, text: await readPass(bytes) }];
    if (kind === 'image') {
      progress('Reading image');
      var text = await ocrImage(blob || new Blob([bytes]), function (f) { progress('Reading image ' + Math.round(f * 100) + '%'); });
      return [{ name: name, text: text }];
    }
    if (kind === 'pdf') {
      progress('Reading PDF');
      var pdfjs = await env.pdfjs();
      // pdf.js takes ownership of the buffer it is given; keep a copy for OCR.
      var pdfText = await BTCExtract.extractPdfText(pdfjs, bytes.slice());
      if (pdfText.replace(/\s/g, '').length < 40 && typeof document !== 'undefined') {
        progress('Scanned PDF — reading pages');
        pdfText = await ocrPdf(pdfjs, bytes.slice(), function (f) { progress('Reading pages ' + Math.round(f * 100) + '%'); });
      }
      return [{ name: name, text: pdfText }];
    }
    if (kind === 'eml') {
      var mail = parseEml(bytes);
      var docs = [{ name: name, text: mail.text }];
      for (var i = 0; i < mail.attachments.length && depth < 2; i++) {
        var a = mail.attachments[i];
        var k = kindOf({ name: a.name, type: a.type });
        // Inline images in emails are logos and banners, not tickets.
        if (!k || k === 'image') continue;
        try {
          var inner = await readBytes(name + ' › ' + a.name, k, a.bytes, null, env, progress, depth + 1);
          docs = docs.concat(inner);
        } catch (e) { /* an unreadable attachment must not sink the email */ }
      }
      return docs;
    }
    throw new Error('Unsupported file type');
  }

  return {
    ACCEPT: ACCEPT,
    kindOf: kindOf,
    read: read,
    releaseOcr: releaseOcr,
    htmlToText: htmlToText,
    parseEml: parseEml,
    unzip: unzip,
    upscaleFactor: upscaleFactor,
    passToText: passToText,
  };
})();
