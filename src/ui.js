// bookingtocal UI pages. appPage() renders the whole single-page app shell.
// All booking parsing/ICS work happens client-side in inline, nonce'd scripts;
// the Worker never sees user content.

export function appPage(nonce, payLink) {
  return `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>BookToCal — booking emails to calendar events</title>
<meta name="description" content="Paste a hotel, flight or train booking and get Google / Apple / Outlook calendar events or an .ics file. Parsing happens entirely in your browser.">
<style>${css()}</style>
</head>
<body>
<div class="aurora" aria-hidden="true"></div>

<header class="topbar">
  <button type="button" id="brand" class="brand" title="BookToCal">
    <span class="logo" aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M9 16l2 2 4-4"/></svg>
    </span>
    <span class="wordmark">Book<em>To</em>Cal</span>
  </button>
  <div class="top-actions">
    <span id="counter" class="counter">0/3 free</span>
    <button type="button" id="settings-btn" class="icon-btn" aria-label="Settings" title="Settings">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
    </button>
    <button type="button" id="theme-btn" class="icon-btn" aria-label="Toggle light theme" title="Toggle theme">
      <svg class="icon-moon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
      <svg class="icon-sun" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
    </button>
  </div>
</header>

<main id="app">
  <div id="payment-banner" class="banner hidden">
    <span class="banner-msg">Enjoying BookToCal? <strong>Unlock unlimited conversions</strong> with a one-time payment of $5 or more.</span>
    <button type="button" id="pay-now-banner" class="btn small primary">Unlock &rarr;</button>
    <button type="button" class="icon-btn banner-dismiss" id="banner-dismiss" aria-label="Dismiss">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
    </button>
  </div>

  <!-- Input -->
  <section id="compose" class="card hero-card">
    <h1 class="headline-lg">Paste a booking.<br><span class="grad">Get calendar events.</span></h1>
    <p class="sub">Hotel stays, flights, trains, tours &mdash; any confirmation email with a date. Turned into Google&nbsp;/&nbsp;Apple&nbsp;/&nbsp;Outlook events or an <span class="mono">.ics</span> file.</p>

    <div class="tabs" role="tablist">
      <button type="button" class="tab active" id="tab-text" role="tab" aria-selected="true">Paste text</button>
      <button type="button" class="tab" id="tab-pdf" role="tab" aria-selected="false">PDF file</button>
    </div>

    <div id="pane-text">
      <textarea id="text-input" class="input mono" rows="10" placeholder="Paste your booking confirmation email here&hellip;

e.g.
Booking confirmation | Hotel Europa, Rome
Check-in: Fri, Sep 4, 2026 (from 14:00)
Check-out: Sun, Sep 6, 2026
Confirmation number: 1234567890"></textarea>
    </div>

    <div id="pane-pdf" class="hidden">
      <div id="pdf-drop" class="dropzone" tabindex="0" role="button" aria-label="Choose or drop a PDF">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/></svg>
        <p><strong>Drop a PDF here</strong> or click to choose</p>
        <p class="drop-hint">Text is extracted in your browser &mdash; the file never leaves your device.</p>
        <p id="pdf-name" class="mono pdf-name hidden"></p>
      </div>
      <input type="file" id="pdf-file" accept="application/pdf,.pdf" class="visually-hidden">
    </div>

    <div class="compose-actions">
      <button type="button" id="convert-btn" class="btn primary big">
        <span id="convert-label">Convert to events</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
      </button>
    </div>

    <p class="privacy-note">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      100% private: parsing runs in your browser. Your booking text is never uploaded.
    </p>
  </section>

  <!-- Results -->
  <section id="results" class="hidden">
    <div class="results-toolbar">
      <div>
        <p class="overline">Detected events</p>
        <p id="results-meta" class="results-meta"></p>
      </div>
      <div class="results-actions">
        <button type="button" id="download-all" class="btn secondary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
          All events (.ics)
        </button>
        <button type="button" id="add-event" class="btn secondary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
          Add event
        </button>
        <button type="button" id="start-over" class="btn secondary">Convert another</button>
      </div>
    </div>
    <div id="event-list" class="event-list"></div>
  </section>
</main>

<footer class="foot">websqu.ad &middot; BookToCal &middot; privacy-first, in-browser parsing</footer>

<!-- Settings slide-over -->
<div id="overlay" class="overlay hidden"></div>
<aside id="settings" class="slideover hidden" aria-label="Settings">
  <div class="slideover-head">
    <h2 class="headline-sm">Settings</h2>
    <button type="button" id="settings-close" class="icon-btn" aria-label="Close settings">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
    </button>
  </div>

  <div class="settings-group">
    <p class="overline">Calendar targets</p>
    <p class="hint">Which buttons appear after a conversion.</p>
    <label class="check-row"><input type="checkbox" data-target="google" checked> <span>Google Calendar <span class="tag">default</span></span></label>
    <label class="check-row"><input type="checkbox" data-target="apple"> <span>Apple Calendar <span class="hint-inline">(.ics derived)</span></span></label>
    <label class="check-row"><input type="checkbox" data-target="outlook"> <span>Outlook</span></label>
    <label class="check-row"><input type="checkbox" data-target="yahoo"> <span>Yahoo</span></label>
    <label class="check-row"><input type="checkbox" data-target="ics" checked> <span>.ics file <span class="hint-inline">(separate option)</span></span></label>
  </div>

  <div class="settings-group">
    <p class="overline">Missing details</p>
    <p class="hint">Used when the source only gives one date, or no time at all.</p>
    <div class="field-row">
      <label for="set-time">Default start time</label>
      <input type="time" id="set-time" class="input" value="12:00">
    </div>
    <div class="field-row">
      <label for="set-duration">Default duration (minutes)</label>
      <input type="number" id="set-duration" class="input" min="5" max="720" step="5" value="30">
    </div>
    <label class="check-row"><input type="checkbox" id="set-allday"> <span>No time in source &rarr; all-day event</span></label>
  </div>
</aside>

<!-- Freemium gate -->
<div id="gate" class="modal-wrap hidden" role="dialog" aria-modal="true" aria-labelledby="gate-title">
  <div class="modal">
    <h2 id="gate-title" class="headline-sm">Free limit reached</h2>
    <p>You&rsquo;ve converted 3 bookings for free. A one-time payment of <strong>$5 or more</strong> unlocks unlimited conversions.</p>
    <button type="button" id="pay-now-gate" class="btn primary big">Unlock unlimited &mdash; $5+</button>
    <p class="gate-alt">Already paid? <button type="button" id="show-code-entry" class="link-btn">Enter your unlock code</button></p>
    <div id="code-entry" class="code-entry hidden">
      <input type="text" id="code" class="input mono" placeholder="Unlock code" autocomplete="off" spellcheck="false">
      <button type="button" id="verify-code-btn" class="btn secondary">Activate</button>
      <p id="code-error" class="code-error" role="alert"></p>
    </div>
  </div>
</div>

<div id="toasts" class="toasts" aria-live="polite"></div>

<script src="/vendor/parser.js"></script>
<script src="/vendor/extract.js"></script>
<script src="/vendor/ics.js"></script>
<script nonce="${nonce}">
'use strict';
var PAY_LINK = ${JSON.stringify(payLink)};
var UPLOADS_KEY = 'btcConversions';
var ACTIVATED_KEY = 'btcActivated';
var SETTINGS_KEY = 'btcSettings';
var THEME_KEY = 'btcTheme';

var SETTING_DEFAULTS = {
  targets: { google: true, apple: true, outlook: false, yahoo: false, ics: true },
  defaultTime: '12:00',
  defaultDuration: 30,
  noTimeAllDay: false
};

var activated = false;
var convertCount = 0;
var settings = loadSettings();
var currentEvents = [];

function qs(s){ return document.querySelector(s); }
function qsa(s){ return Array.prototype.slice.call(document.querySelectorAll(s)); }

// --- state ---------------------------------------------------------------
function loadSettings(){
  try {
    var raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    if (raw && typeof raw === 'object') {
      var s = { targets: {}, defaultTime: SETTING_DEFAULTS.defaultTime, defaultDuration: SETTING_DEFAULTS.defaultDuration, noTimeAllDay: !!raw.noTimeAllDay };
      for (var k in SETTING_DEFAULTS.targets) {
        s.targets[k] = raw.targets ? raw.targets[k] === true : SETTING_DEFAULTS.targets[k];
      }
      if (typeof raw.defaultTime === 'string' && /^\\d{2}:\\d{2}$/.test(raw.defaultTime)) s.defaultTime = raw.defaultTime;
      if (typeof raw.defaultDuration === 'number' && raw.defaultDuration >= 5 && raw.defaultDuration <= 720) s.defaultDuration = raw.defaultDuration;
      return s;
    }
  } catch(e){}
  return JSON.parse(JSON.stringify(SETTING_DEFAULTS));
}
function saveSettings(){
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch(e){}
}

// --- theme ---------------------------------------------------------------
function applyTheme(t){
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem(THEME_KEY, t); } catch(e){}
}
(function initTheme(){
  var t = 'dark';
  try { t = localStorage.getItem(THEME_KEY) || 'dark'; } catch(e){}
  document.documentElement.setAttribute('data-theme', t);
})();
qs('#theme-btn').addEventListener('click', function(){
  applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
});

// --- toasts --------------------------------------------------------------
function toast(msg, kind){
  var el = document.createElement('div');
  el.className = 'toast' + (kind ? ' ' + kind : '');
  el.textContent = msg;
  qs('#toasts').appendChild(el);
  setTimeout(function(){ el.classList.add('out'); }, 2600);
  setTimeout(function(){ el.remove(); }, 3000);
}

// --- tabs ----------------------------------------------------------------
qs('#tab-text').addEventListener('click', function(){ switchTab('text'); });
qs('#tab-pdf').addEventListener('click', function(){ switchTab('pdf'); });
function switchTab(which){
  qs('#tab-text').classList.toggle('active', which === 'text');
  qs('#tab-text').setAttribute('aria-selected', which === 'text');
  qs('#tab-pdf').classList.toggle('active', which === 'pdf');
  qs('#tab-pdf').setAttribute('aria-selected', which === 'pdf');
  qs('#pane-text').classList.toggle('hidden', which !== 'text');
  qs('#pane-pdf').classList.toggle('hidden', which !== 'pdf');
}

// --- PDF dropzone (extraction wired later) --------------------------------
var pdfFile = null;
var drop = qs('#pdf-drop');
drop.addEventListener('click', function(){ qs('#pdf-file').click(); });
drop.addEventListener('keydown', function(e){ if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); qs('#pdf-file').click(); } });
qs('#pdf-file').addEventListener('change', function(){ if (this.files[0]) acceptPdf(this.files[0]); });
['dragover','dragenter'].forEach(function(ev){
  drop.addEventListener(ev, function(e){ e.preventDefault(); drop.classList.add('over'); });
});
['dragleave','dragend'].forEach(function(ev){
  drop.addEventListener(ev, function(){ drop.classList.remove('over'); });
});
drop.addEventListener('drop', function(e){
  e.preventDefault(); drop.classList.remove('over');
  var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (f) acceptPdf(f);
});
function acceptPdf(f){
  if (!/pdf$/i.test(f.type) && !/\\.pdf$/i.test(f.name)) { toast('Please choose a PDF file', 'danger'); return; }
  pdfFile = f;
  qs('#pdf-name').textContent = f.name;
  qs('#pdf-name').classList.remove('hidden');
}

// --- settings drawer ------------------------------------------------------
qs('#settings-btn').addEventListener('click', openSettings);
qs('#settings-close').addEventListener('click', closeSettings);
qs('#overlay').addEventListener('click', closeSettings);
document.addEventListener('keydown', function(e){ if (e.key === 'Escape') closeSettings(); });
function openSettings(){
  qsa('[data-target]').forEach(function(cb){ cb.checked = !!settings.targets[cb.getAttribute('data-target')]; });
  qs('#set-time').value = settings.defaultTime;
  qs('#set-duration').value = String(settings.defaultDuration);
  qs('#set-allday').checked = !!settings.noTimeAllDay;
  qs('#overlay').classList.remove('hidden');
  qs('#settings').classList.remove('hidden');
}
function closeSettings(){
  qsa('[data-target]').forEach(function(cb){ settings.targets[cb.getAttribute('data-target')] = cb.checked; });
  var t = qs('#set-time').value;
  if (/^\\d{2}:\\d{2}$/.test(t)) settings.defaultTime = t;
  var d = parseInt(qs('#set-duration').value, 10);
  if (d >= 5 && d <= 720) settings.defaultDuration = d;
  settings.noTimeAllDay = qs('#set-allday').checked;
  saveSettings();
  if (!qs('#results').classList.contains('hidden')) renderEvents();
  qs('#overlay').classList.add('hidden');
  qs('#settings').classList.add('hidden');
}

// --- counter & freemium gate ----------------------------------------------
function updateCounter(){
  var el = qs('#counter');
  if (activated){ el.className = 'counter unlimited'; el.textContent = '\\u221e'; return; }
  el.className = 'counter' + (convertCount >= 2 ? ' low' : '');
  el.textContent = convertCount + '/3 free';
}
function renderEntryView(){
  var banner = qs('#payment-banner'), gate = qs('#gate'), compose = qs('#compose');
  updateCounter();
  if (activated){
    gate.classList.add('hidden');
    banner.classList.add('hidden');
    compose.classList.remove('hidden');
  } else if (convertCount >= 3){
    compose.classList.add('hidden');
    banner.classList.add('hidden');
    gate.classList.remove('hidden');
  } else {
    gate.classList.add('hidden');
    compose.classList.remove('hidden');
    banner.classList.toggle('hidden', convertCount < 2);
  }
}
function incrementCounter(){
  if (activated) return;
  convertCount++;
  try { localStorage.setItem(UPLOADS_KEY, String(convertCount)); } catch(e){}
  updateCounter();
}
function activateLocal(){
  try { localStorage.setItem(ACTIVATED_KEY, '1'); } catch(e){}
  activated = true;
  renderEntryView();
}
(function initState(){
  try {
    activated = localStorage.getItem(ACTIVATED_KEY) === '1';
    convertCount = activated ? 0 : (parseInt(localStorage.getItem(UPLOADS_KEY) || '0', 10) || 0);
  } catch(e){}
})();

qs('#banner-dismiss').addEventListener('click', function(){ qs('#payment-banner').classList.add('hidden'); });

// --- payment & unlock code ------------------------------------------------
function goToPayment(){ if (PAY_LINK) window.open(PAY_LINK, '_blank', 'noopener'); else toast('Payment link not configured yet', 'warning'); }
qs('#pay-now-banner').addEventListener('click', goToPayment);
qs('#pay-now-gate').addEventListener('click', goToPayment);
qs('#show-code-entry').addEventListener('click', function(){
  qs('#code-entry').classList.toggle('hidden');
  qs('#code').focus();
});
qs('#code').addEventListener('input', function(){ qs('#code-error').textContent = ''; });
qs('#code').addEventListener('keydown', function(e){ if (e.key === 'Enter') qs('#verify-code-btn').click(); });
qs('#verify-code-btn').addEventListener('click', async function(){
  var code = qs('#code').value.trim();
  if (!code){ qs('#code-error').textContent = 'Enter your unlock code'; return; }
  var btn = qs('#verify-code-btn');
  btn.disabled = true; btn.textContent = 'Verifying\\u2026';
  try {
    var res = await fetch('/api/verify-code', {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ code: code })
    });
    var data = await res.json().catch(function(){ return {}; });
    if (data.valid){
      activateLocal();
      toast('Unlocked! Unlimited conversions enabled', 'success');
    } else {
      qs('#code-error').textContent = 'That code is not valid';
    }
  } catch(e){ qs('#code-error').textContent = 'Connection error. Try again.'; }
  btn.disabled = false; btn.textContent = 'Activate';
});

// --- Konami easter egg (unlimited unlock) ---------------------------------
// Click the brand to arm, then: up up down down left right left right B A
var KONAMI = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','KeyB','KeyA'];
var konamiIdx = 0, konamiPrimed = false, konamiTimer = 0;
qs('#brand').addEventListener('click', function(){
  konamiPrimed = true; konamiIdx = 0;
  clearTimeout(konamiTimer);
  konamiTimer = setTimeout(function(){ konamiPrimed = false; konamiIdx = 0; }, 5000);
});
document.addEventListener('keydown', function(e){
  if (!konamiPrimed) return;
  if (e.code === KONAMI[konamiIdx]){
    konamiIdx++;
    if (konamiIdx === KONAMI.length){
      konamiPrimed = false; konamiIdx = 0; clearTimeout(konamiTimer);
      activateLocal();
      toast('Unlocked!', 'success');
      var logo = qs('.logo');
      logo.style.transition = 'box-shadow 0.3s ease';
      logo.style.boxShadow = '0 0 18px 2px var(--accent)';
      setTimeout(function(){ logo.style.boxShadow = ''; }, 1800);
    }
  } else { konamiIdx = 0; }
});

// --- convert: text/PDF -> parser -> events ---------------------------------
var pdfjsModule = null;
var converting = false;

qs('#convert-btn').addEventListener('click', function(){ convertNow(); });

function setBusy(on){
  converting = on;
  qs('#convert-btn').disabled = on;
  qs('#convert-label').textContent = on ? 'Converting\\u2026' : 'Convert to events';
}

async function convertNow(){
  if (converting) return;
  if (!activated && convertCount >= 3){ renderEntryView(); return; }
  var usePdf = qs('#tab-pdf').classList.contains('active');
  var text = '';
  if (usePdf){
    if (!pdfFile){ toast('Choose a PDF first', 'warning'); return; }
    setBusy(true);
    try {
      if (!pdfjsModule) pdfjsModule = await import('/vendor/pdf.min.mjs');
      var buf = new Uint8Array(await pdfFile.arrayBuffer());
      text = await BTCExtract.extractPdfText(pdfjsModule, buf);
    } catch(e){
      setBusy(false);
      toast('Could not read that PDF', 'danger');
      return;
    }
    setBusy(false);
  } else {
    text = qs('#text-input').value;
  }
  if (!text.trim()){ toast('Nothing to convert \\u2014 paste a booking first', 'warning'); return; }
  setBusy(true);
  // Let the UI paint the busy state before the parse work.
  await new Promise(function(r){ setTimeout(r, 30); });
  var result = BTCParser.parseBooking(text, {
    defaultTime: settings.defaultTime,
    defaultDurationMin: settings.defaultDuration,
    noTimeAllDay: settings.noTimeAllDay
  });
  setBusy(false);
  if (!result.events.length){
    toast('No dates found in that text', 'warning');
    return;
  }
  currentEvents = result.events;
  incrementCounter();
  renderEvents();
  qs('#compose').classList.add('hidden');
  qs('#results').classList.remove('hidden');
  toast(currentEvents.length + ' event' + (currentEvents.length === 1 ? '' : 's') + ' found', 'success');
}

qs('#start-over').addEventListener('click', function(){
  qs('#results').classList.add('hidden');
  renderEntryView();
});

// --- events: escaping, rendering, editing -----------------------------------
function esc(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
    return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
  });
}

var TYPE_LABELS = { flight: 'Flight', hotel: 'Hotel', train: 'Train', event: 'Event' };

function todayIso(){
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function plusMinutes(hhmm, mins){
  var p = (hhmm || '12:00').split(':').map(Number);
  var total = p[0] * 60 + p[1] + mins;
  total = ((total % 1440) + 1440) % 1440;
  return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
}

function renderEvents(){
  var list = qs('#event-list');
  var html = '';
  currentEvents.forEach(function(ev, i){ html += eventCard(ev, i); });
  list.innerHTML = html;
  bindEventCards();
  qs('#results-meta').textContent = metaLine();
}

function metaLine(){
  var n = currentEvents.length;
  if (!n) return '';
  var dates = currentEvents.map(function(e){ return e.start.date; }).sort();
  var nice = function(iso){
    var p = iso.split('-');
    return new Date(p[0], p[1] - 1, p[2]).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  };
  var span = dates.length > 1 ? nice(dates[0]) + ' \\u2013 ' + nice(dates[dates.length - 1]) : nice(dates[0]);
  return n + (n === 1 ? ' event \\u00b7 ' : ' events \\u00b7 ') + span;
}

function eventCard(ev, i){
  var conf = { high: 'high', medium: 'medium', low: 'low' }[ev.confidence] || 'medium';
  var confLabel = { high: 'high confidence', medium: 'medium confidence', low: 'low confidence' }[ev.confidence] || 'medium confidence';
  var html = ''
    + '<article class="event-card card" data-idx="' + i + '">'
    + '<div class="event-head">'
    + '<span class="badge type-' + esc(ev.type) + '">' + esc(TYPE_LABELS[ev.type] || 'Event') + '</span>'
    + '<span class="badge conf-' + conf + '">' + esc(confLabel) + '</span>'
    + '<button type="button" class="icon-btn ev-del" data-del="' + i + '" aria-label="Delete event">'
    + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>'
    + '</button>'
    + '</div>'
    + '<div class="event-grid">'
    + '<label class="span2"><span class="field-label">Title</span>'
    + '<input type="text" class="input" data-field="title" value="' + esc(ev.title) + '"></label>'
    + '<label class="span2"><span class="field-label">Location</span>'
    + '<input type="text" class="input" data-field="location" value="' + esc(ev.location) + '" placeholder="Optional"></label>'
    + '<label><span class="field-label">Start date</span>'
    + '<input type="date" class="input" data-field="start.date" value="' + esc(ev.start.date) + '"></label>';
  if (ev.allDay){
    html += '<label><span class="field-label">End date (inclusive)</span>'
      + '<input type="date" class="input" data-field="end.date" value="' + esc(ev.end ? ev.end.date : ev.start.date) + '"></label>';
  } else {
    html += '<label><span class="field-label">Start time</span>'
      + '<input type="time" class="input" data-field="start.time" value="' + esc(ev.start.time || '') + '"></label>'
      + '<label><span class="field-label">End date</span>'
      + '<input type="date" class="input" data-field="end.date" value="' + esc(ev.end ? ev.end.date : ev.start.date) + '"></label>'
      + '<label><span class="field-label">End time</span>'
      + '<input type="time" class="input" data-field="end.time" value="' + esc(ev.end && ev.end.time ? ev.end.time : '') + '"></label>';
  }
  html += '</div>'
    + '<div class="event-actions">'
    + '<span class="field-label">Add to</span>'
    + cardButtons(ev, i)
    + '</div>'
    + '<label class="check-row allday-row"><input type="checkbox" data-field="allDay" ' + (ev.allDay ? 'checked' : '') + '> <span>All-day event</span></label>'
    + '</article>';
  return html;
}

// Per-event target buttons, driven by the settings. Apple has no web prefill —
// it gets a derived .ics download; the standalone ".ics file" target is the
// separate-ics option from settings.
function cardButtons(ev, i){
  var out = '';
  var defs = {
    google: 'Google',
    apple: 'Apple',
    outlook: 'Outlook',
    yahoo: 'Yahoo',
    ics: '.ics file',
  };
  for (var t in defs){
    if (!settings.targets[t]) continue;
    out += '<button type="button" class="btn small secondary" data-export="' + t + '" data-idx="' + i + '">' + defs[t] + '</button>';
  }
  return out;
}

function bindEventCards(){
  qsa('.event-card').forEach(function(card){
    var idx = Number(card.getAttribute('data-idx'));
    Array.prototype.forEach.call(card.querySelectorAll('[data-field]'), function(inp){
      var handler = function(){
        applyField(currentEvents[idx], inp.getAttribute('data-field'), inp);
      };
      inp.addEventListener('change', handler);
      var f = inp.getAttribute('data-field');
      if (f === 'title' || f === 'location') inp.addEventListener('input', handler);
    });
    var del = card.querySelector('[data-del]');
    if (del) del.addEventListener('click', function(){
      currentEvents.splice(idx, 1);
      if (!currentEvents.length){
        qs('#results').classList.add('hidden');
        renderEntryView();
      } else {
        renderEvents();
      }
    });
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-export]'), function(btn){
    btn.addEventListener('click', function(){
      exportEvent(btn.getAttribute('data-export'), Number(btn.getAttribute('data-idx')));
    });
  });
}

// --- export -----------------------------------------------------------------
function exportEvent(target, idx){
  var ev = currentEvents[idx];
  if (!ev){ toast('Event not found', 'danger'); return; }
  if (target === 'google'){ window.open(BTCCal.googleUrl(ev, settings), '_blank', 'noopener'); return; }
  if (target === 'outlook'){ window.open(BTCCal.outlookUrl(ev, settings), '_blank', 'noopener'); return; }
  if (target === 'yahoo'){ window.open(BTCCal.yahooUrl(ev, settings), '_blank', 'noopener'); return; }
  // apple + ics both download .ics (Apple Calendar has no web prefill URL).
  BTCCal.downloadIcs([ev], settings, slug(ev.title) + '.ics');
}

function slug(s){
  return String(s || 'event').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'event';
}

qs('#download-all').addEventListener('click', function(){
  if (!currentEvents.length){ toast('No events to export', 'warning'); return; }
  BTCCal.downloadIcs(currentEvents, settings, 'booktocal-' + currentEvents.length + '-events.ics');
  toast('.ics downloaded \\u2014 open it to import', 'success');
});

function applyField(ev, field, inp){
  if (field === 'allDay'){
    ev.allDay = inp.checked;
    if (ev.allDay){
      if (!ev.end) ev.end = { date: ev.start.date, time: null };
      ev.end.time = null;
      ev.start.time = null;
    } else {
      ev.start.time = settings.defaultTime;
      if (ev.end && !ev.end.time) ev.end.time = settings.defaultTime;
    }
    renderEvents();
    return;
  }
  var v = inp.value;
  if (field.indexOf('.') > -1){
    var parts = field.split('.');
    if (!ev[parts[0]]) ev[parts[0]] = {};
    ev[parts[0]][parts[1]] = v || null;
    if (parts[0] === 'start' && parts[1] === 'date' && ev.end && !ev.end.date) ev.end.date = v;
  } else {
    ev[field] = v;
  }
  qs('#results-meta').textContent = metaLine();
}

qs('#add-event').addEventListener('click', function(){
  var today = todayIso();
  currentEvents.push({
    type: 'event',
    title: 'New event',
    location: '',
    allDay: false,
    start: { date: today, time: settings.defaultTime },
    end: { date: today, time: plusMinutes(settings.defaultTime, settings.defaultDuration) },
    confidence: 'medium',
    source: ''
  });
  renderEvents();
  var cards = document.querySelectorAll('.event-card');
  if (cards.length){
    var last = cards[cards.length - 1];
    last.scrollIntoView({ behavior: 'smooth', block: 'center' });
    var title = last.querySelector('[data-field="title"]');
    if (title) title.focus();
  }
});

// --- app init ---------------------------------------------------------------
(function initApp(){
  renderEntryView();
})();
</script>
</body>
</html>`;
}

function css() {
  return `
/* --- BookToCal design tokens (websquadesign.md) --------------------------- */
:root, [data-theme="dark"] {
  --bg-base: #121214;
  --surface: #1e1e24;
  --surface-hover: #25252b;
  --surface-raised: #2a2a32;
  --surface-input: rgba(0,0,0,0.2);
  --text-primary: #e4e4e7;
  --text-secondary: #a1a1aa;
  --text-muted: #71717a;
  --border-subtle: rgba(255,255,255,0.03);
  --border-default: rgba(255,255,255,0.05);
  --border-strong: rgba(255,255,255,0.1);
  --accent: #6366f1;
  --accent-hover: #4f46e5;
  --success: #22c55e;
  --danger: #ef4444;
  --warning: #f59e0b;
  --info: #3b82f6;
  --shadow-1: 0 1px 2px 0 rgba(0,0,0,0.05);
  --shadow-2: 0 4px 6px -1px rgba(0,0,0,0.1);
  --shadow-3: 0 10px 15px -3px rgba(0,0,0,0.1);
  --topbar-bg: rgba(18,18,20,0.75);
}
[data-theme="light"] {
  --bg-base: #f8fafc;
  --surface: #ffffff;
  --surface-hover: #f1f5f9;
  --surface-raised: #ffffff;
  --surface-input: #ffffff;
  --text-primary: #0f172a;
  --text-secondary: #64748b;
  --text-muted: #94a3b8;
  --border-subtle: #f1f5f9;
  --border-default: #e2e8f0;
  --border-strong: #cbd5e1;
  --topbar-bg: rgba(248,250,252,0.8);
}

* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
  font-size: 16px;
  line-height: 1.55;
  color: var(--text-primary);
  background: var(--bg-base);
  -webkit-font-smoothing: antialiased;
  min-height: 100vh;
}
.mono { font-family: 'SF Mono', Menlo, Consolas, monospace; font-size: 13px; }

/* 2026 ambient backdrop: two slow-drifting accent glows */
.aurora {
  position: fixed; inset: 0; z-index: -1; overflow: hidden; pointer-events: none;
}
.aurora::before, .aurora::after {
  content: ""; position: absolute; width: 55vmax; height: 55vmax; border-radius: 50%;
  filter: blur(90px); opacity: 0.16;
}
.aurora::before {
  background: var(--accent); top: -25vmax; left: -12vmax;
  animation: drift1 26s ease-in-out infinite alternate;
}
.aurora::after {
  background: var(--info); bottom: -30vmax; right: -15vmax;
  animation: drift2 32s ease-in-out infinite alternate;
}
[data-theme="light"] .aurora::before, [data-theme="light"] .aurora::after { opacity: 0.09; }
@keyframes drift1 { to { transform: translate(9vmax, 7vmax) scale(1.12); } }
@keyframes drift2 { to { transform: translate(-8vmax, -6vmax) scale(0.94); } }
@media (prefers-reduced-motion: reduce) {
  .aurora::before, .aurora::after { animation: none; }
}

/* --- top bar -------------------------------------------------------------- */
.topbar {
  position: sticky; top: 0; z-index: 50;
  display: flex; align-items: center; justify-content: space-between;
  gap: 8px; padding: 12px 32px;
  background: var(--topbar-bg);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border-default);
}
.brand {
  display: inline-flex; align-items: center; gap: 10px;
  background: none; border: 0; padding: 4px; cursor: pointer;
  color: var(--text-primary); font: inherit; border-radius: 8px;
}
.logo {
  display: inline-flex; align-items: center; justify-content: center;
  width: 34px; height: 34px; border-radius: 10px;
  background: var(--accent); color: #ffffff;
  box-shadow: 0 2px 8px color-mix(in srgb, var(--accent) 45%, transparent);
}
.wordmark { font-size: 18px; font-weight: 600; letter-spacing: -0.02em; }
.wordmark em { font-style: normal; color: var(--accent); }
.top-actions { display: flex; align-items: center; gap: 8px; }

.counter, .unlimited {
  display: inline-block; margin-right: 4px; font-size: 12px; font-weight: 500;
  padding: 3px 10px; border-radius: 9999px;
  background: var(--surface-hover); color: var(--text-secondary);
  border: 1px solid var(--border-default); white-space: nowrap;
}
.counter.low { background: color-mix(in srgb, var(--warning) 14%, transparent); color: var(--warning); border-color: transparent; }
.counter.unlimited { background: color-mix(in srgb, var(--success) 14%, transparent); color: var(--success); border-color: transparent; font-size: 15px; }

.icon-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 44px; height: 44px; border-radius: 8px;
  background: transparent; border: 1px solid transparent; color: var(--text-secondary);
  cursor: pointer; transition: background 150ms ease-out, color 150ms ease-out;
}
.icon-btn:hover { background: var(--surface-hover); color: var(--text-primary); }

[data-theme="dark"] .icon-sun, [data-theme="light"] .icon-moon { display: none; }

/* --- layout --------------------------------------------------------------- */
main {
  max-width: 880px; margin: 0 auto; padding: 48px 32px 96px;
}
.card {
  background: var(--surface);
  border: 1px solid var(--border-default);
  border-radius: 16px;
}
.hero-card { padding: 48px; }
.headline-lg { font-size: 32px; font-weight: 600; letter-spacing: -0.025em; line-height: 1.15; margin: 0 0 12px; }
.headline-sm { font-size: 20px; font-weight: 600; letter-spacing: -0.025em; margin: 0 0 12px; }
.grad {
  background: linear-gradient(92deg, var(--accent), var(--info));
  -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent; color: transparent;
}
.sub { color: var(--text-secondary); margin: 0 0 32px; max-width: 56ch; }
.overline {
  font-size: 12px; font-weight: 600; letter-spacing: 0.05em;
  text-transform: uppercase; color: var(--text-secondary); margin: 0 0 4px;
}
.hint { font-size: 13px; color: var(--text-muted); margin: 0 0 12px; }
.hint-inline { font-size: 12px; color: var(--text-muted); }

/* --- tabs ------------------------------------------------------------------ */
.tabs {
  display: flex; gap: 16px; border-bottom: 1px solid var(--border-default); margin-bottom: 20px;
}
.tab {
  background: none; border: 0; border-bottom: 2px solid transparent; margin-bottom: -1px;
  padding: 8px 2px; font: inherit; font-weight: 500; color: var(--text-secondary);
  cursor: pointer; transition: color 150ms ease-out;
}
.tab:hover { color: var(--text-primary); }
.tab.active { color: var(--text-primary); border-bottom-color: var(--accent); }

/* --- inputs ---------------------------------------------------------------- */
.input {
  width: 100%; border-radius: 8px; border: 1px solid var(--border-strong);
  background: var(--surface-input); color: var(--text-primary);
  font: inherit; padding: 12px 14px;
  transition: border-color 150ms ease-out;
}
.input::placeholder { color: var(--text-muted); }
.input:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
textarea.input { resize: vertical; min-height: 220px; line-height: 1.6; }

.dropzone {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 48px 24px; text-align: center;
  border: 1.5px dashed var(--border-strong); border-radius: 16px;
  color: var(--text-secondary); cursor: pointer;
  transition: background 150ms ease-out, border-color 150ms ease-out;
}
.dropzone:hover, .dropzone.over, .dropzone:focus-visible {
  background: var(--surface-hover); border-color: var(--accent); color: var(--text-primary);
  outline: none;
}
.drop-hint { font-size: 13px; color: var(--text-muted); margin: 0; }
.pdf-name { margin: 8px 0 0; color: var(--success); }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }

.compose-actions { display: flex; justify-content: flex-end; margin-top: 20px; }
.privacy-note {
  display: flex; align-items: center; gap: 6px;
  margin: 24px 0 0; font-size: 13px; color: var(--text-muted);
}

/* --- buttons ---------------------------------------------------------------- */
.btn {
  display: inline-flex; align-items: center; gap: 8px; justify-content: center;
  border-radius: 8px; border: 1px solid transparent;
  font: inherit; font-weight: 500; padding: 10px 18px; min-height: 44px;
  cursor: pointer; transition: background 150ms ease-out, border-color 150ms ease-out, transform 150ms ease-out;
}
.btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.btn.primary { background: var(--accent); color: #ffffff; }
.btn.primary:hover { background: var(--accent-hover); transform: translateY(-1px); }
.btn.secondary {
  background: var(--surface); border-color: var(--border-strong); color: var(--text-primary);
}
.btn.secondary:hover { background: var(--surface-hover); }
.btn.big { padding: 12px 24px; font-size: 16px; }
.btn.small { padding: 6px 12px; min-height: 36px; font-size: 13px; }
.btn:disabled { background: var(--surface-hover); color: var(--text-muted); border-color: transparent; cursor: not-allowed; transform: none; }
.link-btn {
  background: none; border: 0; padding: 0; font: inherit; color: var(--accent);
  cursor: pointer; text-decoration: underline;
}
.link-btn:hover { color: var(--accent-hover); }

/* --- banner ------------------------------------------------------------------ */
.banner {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  background: color-mix(in srgb, var(--info) 10%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--info) 35%, transparent);
  border-left: 4px solid var(--info);
  border-radius: 12px; padding: 12px 16px; margin-bottom: 24px;
}
.banner-msg { flex: 1 1 auto; color: var(--text-primary); font-size: 14px; }
.banner-dismiss { width: 36px; height: 36px; }

/* --- results ------------------------------------------------------------------ */
.results-toolbar {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; flex-wrap: wrap; margin-bottom: 16px;
}
.results-meta { margin: 0; color: var(--text-secondary); font-size: 14px; }
.results-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.event-list { display: flex; flex-direction: column; gap: 12px; }
.event-card { padding: 20px; }
.event-head { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; }
.event-head .badge:first-child { margin-right: auto; }
.ev-del { width: 36px; height: 36px; margin-left: auto; }
.ev-del:hover { color: var(--danger); background: color-mix(in srgb, var(--danger) 10%, transparent); }
.badge {
  font-size: 12px; font-weight: 500; padding: 2px 10px;
  border-radius: 9999px; white-space: nowrap;
}
.badge.type-flight { background: color-mix(in srgb, var(--info) 13%, transparent); color: var(--info); }
.badge.type-hotel { background: color-mix(in srgb, var(--success) 13%, transparent); color: var(--success); }
.badge.type-train { background: color-mix(in srgb, var(--warning) 15%, transparent); color: var(--warning); }
.badge.type-event { background: color-mix(in srgb, var(--accent) 13%, transparent); color: var(--accent); }
.badge.conf-high { background: var(--surface-hover); color: var(--text-secondary); }
.badge.conf-medium { background: color-mix(in srgb, var(--warning) 10%, transparent); color: var(--warning); }
.badge.conf-low { background: color-mix(in srgb, var(--danger) 10%, transparent); color: var(--danger); }
.event-grid {
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px;
}
.event-grid label { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.event-grid .span2 { grid-column: span 2; }
.field-label { font-size: 12px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--text-secondary); }
.event-grid .input { padding: 9px 12px; }
.allday-row { border-top: 1px solid var(--border-subtle); margin-top: 12px; padding-top: 12px; min-height: auto; }
.event-actions {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--border-subtle);
}
.event-actions .field-label { margin-right: 4px; }
.export-bar {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  margin-top: 24px; padding: 20px;
  background: var(--surface); border: 1px solid var(--border-default); border-radius: 16px;
}
.export-label { margin: 0 4px 0 0; }
@media (max-width: 640px) {
  .event-grid { grid-template-columns: 1fr; }
  .event-grid .span2 { grid-column: auto; }
}

/* --- settings slide-over ------------------------------------------------------- */
.overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 100; }
.slideover {
  position: fixed; top: 0; right: 0; bottom: 0; width: 400px; max-width: 100vw;
  background: var(--surface-raised); border-left: 1px solid var(--border-default);
  box-shadow: var(--shadow-3); z-index: 101; padding: 24px; overflow-y: auto;
  animation: slide-in 250ms ease-out;
}
@keyframes slide-in { from { transform: translateX(24px); opacity: 0; } to { transform: none; opacity: 1; } }
@media (max-width: 640px) { .slideover { width: 100vw; border-left: 0; } }
.slideover-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.slideover-head .headline-sm { margin: 0; }
.settings-group { border-top: 1px solid var(--border-subtle); padding: 16px 0; }
.check-row {
  display: flex; align-items: center; gap: 10px; padding: 8px 0;
  cursor: pointer; min-height: 44px; color: var(--text-primary);
}
.check-row input { accent-color: var(--accent); width: 16px; height: 16px; }
.tag {
  font-size: 11px; font-weight: 600; padding: 1px 7px; border-radius: 9999px;
  background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent);
}
.field-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 0; }
.field-row label { color: var(--text-secondary); font-size: 14px; }
.field-row .input { width: 130px; text-align: right; }
input[type="time"].input, input[type="number"].input { padding: 8px 10px; }

/* --- gate modal ----------------------------------------------------------------- */
.modal-wrap {
  position: fixed; inset: 0; z-index: 110;
  display: flex; align-items: center; justify-content: center; padding: 16px;
  background: rgba(0,0,0,0.5); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
}
.modal {
  width: 100%; max-width: 400px; text-align: center;
  background: var(--surface-raised); border: 1px solid var(--border-default);
  border-radius: 16px; box-shadow: var(--shadow-3); padding: 32px;
  animation: pop 250ms ease-out;
}
@keyframes pop { from { transform: scale(0.96); opacity: 0; } to { transform: none; opacity: 1; } }
.modal p { color: var(--text-secondary); }
.modal .btn.big { width: 100%; margin-top: 8px; }
.gate-alt { font-size: 14px; margin: 16px 0 0; }
.code-entry { margin-top: 16px; display: flex; flex-direction: column; gap: 8px; }
.code-error { color: var(--danger); font-size: 13px; min-height: 1em; margin: 0; }

/* --- toasts ---------------------------------------------------------------------- */
.toasts {
  position: fixed; right: 16px; bottom: 16px; z-index: 120;
  display: flex; flex-direction: column; gap: 8px;
}
.toast {
  background: var(--surface-raised); border: 1px solid var(--border-default);
  border-left: 4px solid var(--info);
  border-radius: 8px; box-shadow: var(--shadow-2);
  padding: 10px 16px; font-size: 14px; color: var(--text-primary);
  animation: toast-in 250ms ease-out; transition: opacity 300ms ease-in, transform 300ms ease-in;
}
.toast.success { border-left-color: var(--success); }
.toast.danger { border-left-color: var(--danger); }
.toast.warning { border-left-color: var(--warning); }
.toast.out { opacity: 0; transform: translateY(6px); }
@keyframes toast-in { from { transform: translateY(8px); opacity: 0; } to { transform: none; opacity: 1; } }

/* --- footer ----------------------------------------------------------------------- */
.foot {
  max-width: 880px; margin: 0 auto; padding: 24px 32px 48px;
  color: var(--text-muted); font-size: 13px;
}

/* --- responsive -------------------------------------------------------------------- */
@media (max-width: 640px) {
  .topbar { padding: 10px 16px; }
  main { padding: 24px 16px 64px; }
  .hero-card { padding: 24px; }
  .headline-lg { font-size: 26px; }
  .compose-actions { justify-content: stretch; }
  .compose-actions .btn { width: 100%; }
}

/* --- focus & a11y ------------------------------------------------------------------- */
:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.hidden { display: none !important; }
`;
}
