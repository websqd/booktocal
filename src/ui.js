// bookingtocal UI. appPage() renders the whole single-page app shell: token
// CSS, markup, and the inline client script. All file reading, parsing and
// calendar export happens client-side (public/vendor/*.js); the Worker never
// sees user content.
//
// The client script lives inside a template literal: no backticks in client
// code, backslashes doubled, and no "${" other than the two interpolations.

export function appPage(nonce, payLink) {
  return `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>BookToCal — bookings to calendar events</title>
<meta name="description" content="Drop flight, train, hotel or ticket confirmations — PDFs, screenshots, emails or pasted text — and get Google / Apple / Outlook calendar events with the right local times. Everything is read in your browser.">
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

  <!-- Composer: pasted text and any number of files, converted together -->
  <section id="compose" class="card hero-card">
    <h1 class="headline-lg">Drop your bookings.<br><span class="grad">Get calendar events.</span></h1>
    <p class="sub">Flights, trains, buses, hotels, show tickets, visas. Add as many confirmations as you like &mdash; each booking becomes its own event, in the local time of where it happens.</p>

    <div id="append-note" class="append-note hidden">
      <span id="append-text"></span>
      <button type="button" id="append-cancel" class="link-btn">Back to events</button>
    </div>

    <div id="dropzone" class="composer">
      <label for="text-input" class="visually-hidden">Booking text</label>
      <textarea id="text-input" class="input mono" rows="7" placeholder="Paste a confirmation email or itinerary here&hellip;

Several bookings? Paste them one after another, separated by a line of ---"></textarea>
      <ul id="file-list" class="file-list hidden" aria-label="Files to convert"></ul>
      <div class="composer-bar">
        <button type="button" id="add-files" class="btn secondary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
          Add files
        </button>
        <span class="composer-hint">PDFs, screenshots, emails (<span class="mono">.eml</span>), wallet passes &mdash; or drop them anywhere here</span>
      </div>
      <div class="drop-veil" aria-hidden="true">Drop to add</div>
    </div>
    <input type="file" id="file-input" multiple class="visually-hidden" tabindex="-1" aria-hidden="true">

    <div class="compose-actions">
      <label class="check-row inline"><input type="checkbox" id="emoji-compose" checked> <span>Add emojis to titles <span class="hint-inline">&#9992;&#65039; &#128646; &#127976;</span></span></label>
      <button type="button" id="convert-btn" class="btn primary big">
        <span id="convert-label">Convert to events</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
      </button>
    </div>

    <p class="privacy-note">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      100% private: files are read and parsed in your browser. Nothing is uploaded.
    </p>
  </section>

  <!-- Results -->
  <section id="results" class="hidden">
    <div class="results-toolbar">
      <div>
        <p class="overline">Your events</p>
        <p id="results-meta" class="results-meta"></p>
      </div>
      <div class="results-actions">
        <label class="check-row inline"><input type="checkbox" id="emoji-toggle" checked> <span>Emojis in titles</span></label>
        <button type="button" id="download-all" class="btn primary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
          <span id="download-all-label">All events (.ics)</span>
        </button>
      </div>
    </div>
    <div id="notices" class="notices hidden" role="status"></div>
    <div id="event-list" class="event-list"></div>
    <div class="results-foot">
      <button type="button" id="add-more" class="btn secondary">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
        Add more bookings
      </button>
      <button type="button" id="add-event" class="btn secondary">Blank event</button>
      <button type="button" id="start-over" class="btn secondary">Start over</button>
    </div>
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
    <p class="hint">Which buttons appear on each event.</p>
    <label class="check-row"><input type="checkbox" data-target="google" checked> <span>Google Calendar <span class="tag">default</span></span></label>
    <label class="check-row"><input type="checkbox" data-target="apple"> <span>Apple Calendar <span class="hint-inline">(.ics file)</span></span></label>
    <label class="check-row"><input type="checkbox" data-target="outlook"> <span>Outlook</span></label>
    <label class="check-row"><input type="checkbox" data-target="yahoo"> <span>Yahoo</span></label>
    <label class="check-row"><input type="checkbox" data-target="ics" checked> <span>.ics file</span></label>
  </div>

  <div class="settings-group">
    <p class="overline">Event style</p>
    <label class="check-row"><input type="checkbox" id="set-emoji" checked> <span>Emojis in titles <span class="hint-inline">&#9992;&#65039; flights, &#128646; trains, &#127976; hotels&hellip;</span></span></label>
    <label class="check-row"><input type="checkbox" id="set-hotel-allday" checked> <span>Hotel stays as all-day banners</span></label>
    <p class="hint">Off: one timed block from check-in to check-out. Applies to the next conversion.</p>
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
    <p>You&rsquo;ve converted 3 times for free. A one-time payment of <strong>$5 or more</strong> unlocks unlimited conversions.</p>
    <button type="button" id="pay-now-gate" class="btn primary big">Unlock unlimited &mdash; $5+</button>
    <p class="gate-alt">Already paid? <button type="button" id="show-code-entry" class="link-btn">Enter your unlock code</button></p>
    <div id="code-entry" class="code-entry hidden">
      <input type="text" id="code" class="input mono" placeholder="Unlock code" autocomplete="off" spellcheck="false" aria-label="Unlock code">
      <button type="button" id="verify-code-btn" class="btn secondary">Activate</button>
      <p id="code-error" class="code-error" role="alert"></p>
    </div>
  </div>
</div>

<div id="toasts" class="toasts" aria-live="polite"></div>

<script src="/vendor/airports.js"></script>
<script src="/vendor/geo.js"></script>
<script src="/vendor/tz.js"></script>
<script src="/vendor/parser.js"></script>
<script src="/vendor/ics.js"></script>
<script src="/vendor/extract.js"></script>
<script src="/vendor/intake.js"></script>
<script nonce="${nonce}">
'use strict';
var PAY_LINK = ${JSON.stringify(payLink)};
var UPLOADS_KEY = 'btcConversions';
var ACTIVATED_KEY = 'btcActivated';
var SETTINGS_KEY = 'btcSettings';
var THEME_KEY = 'btcTheme';
var FREE_LIMIT = 3;

var SETTING_DEFAULTS = {
  targets: { google: true, apple: true, outlook: false, yahoo: false, ics: true },
  defaultTime: '12:00',
  defaultDuration: 30,
  noTimeAllDay: false,
  emoji: true,
  hotelAllDay: true
};

var activated = false;
var convertCount = 0;
var settings = loadSettings();
var currentEvents = [];   // events on screen
var pendingFiles = [];    // { id, file, kind, status: 'ready'|'working'|'done'|'error', note }
var notices = [];         // { kind: 'warning'|'danger', text }
var openEdits = {};       // event uid -> true while its edit form is open
var appendMode = false;   // composer opened via "Add more bookings"
var nextId = 1;

function qs(s){ return document.querySelector(s); }
function qsa(s){ return Array.prototype.slice.call(document.querySelectorAll(s)); }

// --- settings -------------------------------------------------------------
function loadSettings(){
  var s = JSON.parse(JSON.stringify(SETTING_DEFAULTS));
  try {
    var raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    if (raw && typeof raw === 'object') {
      for (var k in SETTING_DEFAULTS.targets) {
        if (raw.targets && typeof raw.targets[k] === 'boolean') s.targets[k] = raw.targets[k];
      }
      if (typeof raw.defaultTime === 'string' && /^\\d{2}:\\d{2}$/.test(raw.defaultTime)) s.defaultTime = raw.defaultTime;
      if (typeof raw.defaultDuration === 'number' && raw.defaultDuration >= 5 && raw.defaultDuration <= 720) s.defaultDuration = raw.defaultDuration;
      s.noTimeAllDay = !!raw.noTimeAllDay;
      if (typeof raw.emoji === 'boolean') s.emoji = raw.emoji;
      if (typeof raw.hotelAllDay === 'boolean') s.hotelAllDay = raw.hotelAllDay;
    }
  } catch(e){}
  return s;
}
function saveSettings(){
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch(e){}
}

// The emoji choice has three checkboxes (composer, results, settings): one setter.
function setEmoji(on){
  settings.emoji = !!on;
  saveSettings();
  ['#emoji-compose', '#emoji-toggle', '#set-emoji'].forEach(function(id){ qs(id).checked = settings.emoji; });
  if (!qs('#results').classList.contains('hidden')) renderEvents();
}
['#emoji-compose', '#emoji-toggle', '#set-emoji'].forEach(function(id){
  qs(id).addEventListener('change', function(){ setEmoji(this.checked); });
});

// --- theme ---------------------------------------------------------------
(function initTheme(){
  var t = 'dark';
  try { t = localStorage.getItem(THEME_KEY) || 'dark'; } catch(e){}
  document.documentElement.setAttribute('data-theme', t);
})();
qs('#theme-btn').addEventListener('click', function(){
  var t = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem(THEME_KEY, t); } catch(e){}
});

// --- toasts --------------------------------------------------------------
function toast(msg, kind){
  var el = document.createElement('div');
  el.className = 'toast' + (kind ? ' ' + kind : '');
  el.textContent = msg;
  qs('#toasts').appendChild(el);
  setTimeout(function(){ el.classList.add('out'); }, 3200);
  setTimeout(function(){ el.remove(); }, 3600);
}

function esc(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
    return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
  });
}

// --- composer: files -------------------------------------------------------
var KIND_LABEL = { pdf: 'PDF', image: 'Image', eml: 'Email', html: 'HTML', pkpass: 'Wallet pass', text: 'Text' };

qs('#file-input').setAttribute('accept', BTCIntake.ACCEPT);
qs('#add-files').addEventListener('click', function(){ qs('#file-input').click(); });
qs('#file-input').addEventListener('change', function(){
  addFiles(this.files);
  this.value = '';
});

function addFiles(list){
  var rejected = 0;
  Array.prototype.forEach.call(list || [], function(f){
    var kind = BTCIntake.kindOf(f);
    if (!kind){ rejected++; return; }
    var dup = pendingFiles.some(function(p){ return p.file.name === f.name && p.file.size === f.size; });
    if (!dup) pendingFiles.push({ id: nextId++, file: f, kind: kind, status: 'ready', note: '' });
  });
  if (rejected) toast(rejected === 1 ? 'That file type is not supported' : rejected + ' files skipped (unsupported type)', 'warning');
  renderFiles();
}

function renderFiles(){
  var list = qs('#file-list');
  list.classList.toggle('hidden', !pendingFiles.length);
  list.innerHTML = pendingFiles.map(function(p){
    var busy = p.status === 'working';
    return '<li class="file-chip ' + esc(p.status) + '" data-file="' + p.id + '">'
      + '<span class="file-kind">' + esc(KIND_LABEL[p.kind] || 'File') + '</span>'
      + '<span class="file-name" title="' + esc(p.file.name) + '">' + esc(p.file.name) + '</span>'
      + (p.note ? '<span class="file-note">' + esc(p.note) + '</span>' : '')
      + (busy ? '<span class="spinner" aria-hidden="true"></span>'
        : '<button type="button" class="icon-btn file-remove" data-remove="' + p.id + '" aria-label="Remove ' + esc(p.file.name) + '">'
          + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>')
      + '</li>';
  }).join('');
}
qs('#file-list').addEventListener('click', function(e){
  var btn = e.target.closest('[data-remove]');
  if (!btn || converting) return;
  var id = Number(btn.getAttribute('data-remove'));
  pendingFiles = pendingFiles.filter(function(p){ return p.id !== id; });
  renderFiles();
});

// Drag & drop over the whole composer; pasted screenshots count as files too.
var zone = qs('#dropzone');
var dragDepth = 0;
function hasFiles(e){ return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') > -1; }
zone.addEventListener('dragenter', function(e){ if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; zone.classList.add('over'); });
zone.addEventListener('dragover', function(e){ if (hasFiles(e)) e.preventDefault(); });
zone.addEventListener('dragleave', function(e){ if (!hasFiles(e)) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) zone.classList.remove('over'); });
zone.addEventListener('drop', function(e){
  if (!hasFiles(e)) return;
  e.preventDefault(); dragDepth = 0; zone.classList.remove('over');
  addFiles(e.dataTransfer.files);
});
// Dropping a file outside the composer must not navigate away from the page.
window.addEventListener('dragover', function(e){ if (hasFiles(e)) e.preventDefault(); });
window.addEventListener('drop', function(e){ if (hasFiles(e)) e.preventDefault(); });
qs('#text-input').addEventListener('paste', function(e){
  var files = e.clipboardData && e.clipboardData.files;
  if (files && files.length){ e.preventDefault(); addFiles(files); }
});

// --- settings drawer ------------------------------------------------------
qs('#settings-btn').addEventListener('click', openSettings);
qs('#settings-close').addEventListener('click', closeSettings);
qs('#overlay').addEventListener('click', closeSettings);
document.addEventListener('keydown', function(e){ if (e.key === 'Escape' && !qs('#settings').classList.contains('hidden')) closeSettings(); });
function openSettings(){
  qsa('[data-target]').forEach(function(cb){ cb.checked = !!settings.targets[cb.getAttribute('data-target')]; });
  qs('#set-time').value = settings.defaultTime;
  qs('#set-duration').value = String(settings.defaultDuration);
  qs('#set-allday').checked = !!settings.noTimeAllDay;
  qs('#set-emoji').checked = !!settings.emoji;
  qs('#set-hotel-allday').checked = !!settings.hotelAllDay;
  qs('#overlay').classList.remove('hidden');
  qs('#settings').classList.remove('hidden');
  qs('#settings-close').focus();
}
function closeSettings(){
  qsa('[data-target]').forEach(function(cb){ settings.targets[cb.getAttribute('data-target')] = cb.checked; });
  var t = qs('#set-time').value;
  if (/^\\d{2}:\\d{2}$/.test(t)) settings.defaultTime = t;
  var d = parseInt(qs('#set-duration').value, 10);
  if (d >= 5 && d <= 720) settings.defaultDuration = d;
  settings.noTimeAllDay = qs('#set-allday').checked;
  settings.hotelAllDay = qs('#set-hotel-allday').checked;
  saveSettings();
  if (!qs('#results').classList.contains('hidden')) renderEvents();
  qs('#overlay').classList.add('hidden');
  qs('#settings').classList.add('hidden');
}

// --- counter & freemium gate ----------------------------------------------
function updateCounter(){
  var el = qs('#counter');
  if (activated){ el.className = 'counter unlimited'; el.textContent = '\\u221e'; return; }
  el.className = 'counter' + (convertCount >= FREE_LIMIT - 1 ? ' low' : '');
  el.textContent = convertCount + '/' + FREE_LIMIT + ' free';
}
// Show the composer (or the gate when the free conversions are used up).
function renderEntryView(){
  var banner = qs('#payment-banner'), gate = qs('#gate'), compose = qs('#compose');
  updateCounter();
  qs('#append-note').classList.toggle('hidden', !appendMode);
  if (appendMode) qs('#append-text').textContent = 'Adding to your ' + currentEvents.length + ' event' + (currentEvents.length === 1 ? '' : 's') + '.';
  if (activated){
    gate.classList.add('hidden');
    banner.classList.add('hidden');
    compose.classList.remove('hidden');
  } else if (convertCount >= FREE_LIMIT){
    compose.classList.add('hidden');
    banner.classList.add('hidden');
    gate.classList.remove('hidden');
  } else {
    gate.classList.add('hidden');
    compose.classList.remove('hidden');
    banner.classList.toggle('hidden', convertCount < FREE_LIMIT - 1);
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
  if (qs('#results').classList.contains('hidden')) renderEntryView(); else { qs('#gate').classList.add('hidden'); updateCounter(); }
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

// --- convert: text + files -> documents -> events ---------------------------
var pdfjsModule = null;
var converting = false;

function loadPdfjs(){
  if (!pdfjsModule) pdfjsModule = import('/vendor/pdf.min.mjs');
  return pdfjsModule;
}

function setBusy(on, label){
  converting = on;
  qs('#convert-btn').disabled = on;
  qs('#add-files').disabled = on;
  qs('#convert-label').textContent = on ? (label || 'Converting\\u2026') : 'Convert to events';
}

qs('#convert-btn').addEventListener('click', function(){ convertNow(); });
qs('#text-input').addEventListener('keydown', function(e){
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) convertNow();
});

async function convertNow(){
  if (converting) return;
  if (!activated && convertCount >= FREE_LIMIT){ renderEntryView(); return; }
  var text = qs('#text-input').value;
  if (!text.trim() && !pendingFiles.length){ toast('Paste a booking or add a file first', 'warning'); return; }

  setBusy(true);
  var docs = [];
  var problems = [];
  if (text.trim()) docs.push({ name: pendingFiles.length ? 'Pasted text' : '', text: text });

  for (var i = 0; i < pendingFiles.length; i++){
    var p = pendingFiles[i];
    p.status = 'working'; p.note = 'Reading\\u2026';
    renderFiles();
    setBusy(true, pendingFiles.length > 1 ? 'Reading ' + (i + 1) + ' of ' + pendingFiles.length + '\\u2026' : 'Reading\\u2026');
    try {
      var out = await BTCIntake.read(p.file, {
        pdfjs: loadPdfjs,
        onProgress: (function(item){ return function(msg){ item.note = msg; var el = qs('[data-file="' + item.id + '"] .file-note'); if (el) el.textContent = msg; }; })(p)
      });
      docs = docs.concat(out);
      p.status = 'done'; p.note = '';
    } catch(e){
      p.status = 'error';
      p.note = 'Could not read this file';
      problems.push({ kind: 'danger', text: 'Could not read ' + p.file.name + (e && e.message ? ' (' + e.message + ')' : '') });
    }
    renderFiles();
  }
  BTCIntake.releaseOcr();

  setBusy(true, 'Finding bookings\\u2026');
  await new Promise(function(r){ setTimeout(r, 30); }); // let the label paint
  var result = { events: [] };
  try {
    result = BTCParser.parseDocuments(docs, {
      defaultTime: settings.defaultTime,
      defaultDurationMin: settings.defaultDuration,
      noTimeAllDay: settings.noTimeAllDay,
      hotelAllDay: settings.hotelAllDay
    });
  } catch(e){
    setBusy(false);
    toast('Something went wrong while reading that booking', 'danger');
    return;
  }
  setBusy(false);

  // Tell the user which documents produced nothing.
  var named = docs.filter(function(d){ return d.name; });
  named.forEach(function(d){
    var used = result.events.some(function(ev){ return ev.sources.indexOf(d.name) > -1; });
    if (!used) problems.push({ kind: 'warning', text: 'No booking found in ' + d.name });
  });

  if (!result.events.length){
    toast(problems.length && problems[0].kind === 'danger' ? problems[0].text : 'No dates found \\u2014 nothing to add to a calendar', 'warning');
    return;
  }

  result.events.forEach(function(ev){ ev.uid = nextId++; });
  var added = result.events.length;
  var wasAppend = appendMode;
  if (appendMode){
    var fresh = result.events.filter(function(ev){ return !currentEvents.some(function(old){ return eventKey(old) === eventKey(ev); }); });
    added = fresh.length;
    if (fresh.length < result.events.length){
      problems.push({ kind: 'warning', text: (result.events.length - fresh.length) + ' booking(s) were already in your list and were skipped' });
    }
    currentEvents = currentEvents.concat(fresh).sort(byStart);
  } else {
    currentEvents = result.events;
    openEdits = {};
  }
  notices = problems;
  appendMode = false;
  incrementCounter();
  qs('#text-input').value = '';
  pendingFiles = [];
  renderFiles();
  renderEvents();
  qs('#compose').classList.add('hidden');
  qs('#payment-banner').classList.add('hidden');
  qs('#results').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  toast(added + ' event' + (added === 1 ? '' : 's') + (wasAppend ? ' added' : ' found'), 'success');
}

function eventKey(ev){
  var m = ev.meta || {};
  return ev.type + '|' + String(m.number || ev.title).toLowerCase().replace(/\\s+/g, '') + '|' + ev.start.date;
}
function byStart(a, b){
  var x = a.start.date + 'T' + (a.start.time || '00:00'), y = b.start.date + 'T' + (b.start.time || '00:00');
  return x < y ? -1 : x > y ? 1 : 0;
}

qs('#start-over').addEventListener('click', function(){
  currentEvents = []; notices = []; openEdits = {}; appendMode = false;
  qs('#results').classList.add('hidden');
  renderEntryView();
  qs('#text-input').focus();
});
qs('#add-more').addEventListener('click', function(){
  appendMode = true;
  qs('#results').classList.add('hidden');
  renderEntryView();
  if (activated || convertCount < FREE_LIMIT) qs('#text-input').focus();
});
qs('#append-cancel').addEventListener('click', function(){
  appendMode = false;
  qs('#compose').classList.add('hidden');
  qs('#gate').classList.add('hidden');
  qs('#results').classList.remove('hidden');
});

// --- results: rendering ------------------------------------------------------
var TYPE_LABELS = { flight: 'Flight', train: 'Train', bus: 'Bus', ferry: 'Ferry', hotel: 'Stay', deadline: 'Deadline', event: 'Event' };

function renderEvents(){
  qs('#event-list').innerHTML = currentEvents.map(eventCard).join('');
  qs('#results-meta').textContent = metaLine();
  qs('#download-all-label').textContent = currentEvents.length === 1 ? 'Download .ics' : 'All ' + currentEvents.length + ' events (.ics)';
  var box = qs('#notices');
  box.classList.toggle('hidden', !notices.length);
  box.innerHTML = notices.map(function(n){ return '<p class="notice ' + esc(n.kind) + '">' + esc(n.text) + '</p>'; }).join('');
}

function metaLine(){
  var n = currentEvents.length;
  if (!n) return '';
  var dates = currentEvents.map(function(e){ return e.start.date; }).sort();
  var first = shortDate(dates[0]), last = shortDate(dates[dates.length - 1]);
  return n + (n === 1 ? ' event \\u00b7 ' : ' events \\u00b7 ') + (first === last ? first : first + ' \\u2013 ' + last);
}

// "Wed 25 Nov 2026" -> "25 Nov 2026"
function shortDate(iso){ return BTCCal.niceDate(iso).replace(/^\\S+ /, ''); }

function zoneLabel(tz, date, time){
  return tz ? (BTCTz.offsetLabel(tz, date, time || '12:00') || '') : '';
}

function placeHtml(p){
  if (!p) return '';
  var name = p.city || p.name || p.code || '';
  return esc(name) + (p.code && name !== p.code ? ' <span class="code">' + esc(p.code) + '</span>' : '');
}

// The "when" block: a two-ended journey for transport, a date range for
// all-day events, one line for everything else.
function whenBlock(ev){
  var m = ev.meta || {};
  var r = BTCCal.resolve(ev, settings);
  var transport = ev.type === 'flight' || ev.type === 'train' || ev.type === 'bus' || ev.type === 'ferry';
  if (r.allDay){
    var lastDay = ev.end && ev.end.date && ev.end.date > ev.start.date ? ev.end.date : null;
    var line = BTCCal.niceDate(ev.start.date) + (lastDay ? ' \\u2192 ' + BTCCal.niceDate(lastDay) : '');
    var extra = [];
    if (ev.type === 'hotel' && lastDay){
      var nights = Math.round((Date.parse(lastDay) - Date.parse(ev.start.date)) / 86400000);
      extra.push(nights + (nights === 1 ? ' night' : ' nights'));
    } else {
      extra.push('all day');
    }
    return '<p class="when-line">' + esc(line) + ' <span class="muted">\\u00b7 ' + esc(extra.join(' \\u00b7 ')) + '</span></p>'
      + (transport && (m.from || m.to) ? '<p class="where-line">' + placeHtml(m.from) + ' \\u2192 ' + placeHtml(m.to) + '</p>' : '')
      + (!transport && ev.location ? '<p class="where-line">' + esc(ev.location) + '</p>' : '');
  }
  if (transport){
    var hasEnd = !!(ev.end && ev.end.time);
    var dur = hasEnd && r.minutes > 0 ? BTCCal.niceDuration(r.minutes) : '';
    var depZone = zoneLabel(ev.tz, r.start.date, r.start.time);
    var arrZone = zoneLabel(ev.tzEnd || ev.tz, r.end.date, r.end.time);
    return '<div class="journey">'
      + '<div class="leg">'
      + '<span class="leg-time">' + esc(r.start.time) + '</span>'
      + '<span class="leg-place">' + (placeHtml(m.from) || '<span class="muted">Departure</span>') + '</span>'
      + '<span class="leg-date">' + esc(BTCCal.niceDate(r.start.date)) + (depZone ? ' \\u00b7 ' + esc(depZone) : '') + '</span>'
      + '</div>'
      + '<div class="leg-mid" aria-hidden="true"><span class="leg-rule"></span>' + (dur ? '<span class="leg-dur">' + esc(dur) + '</span>' : '') + '<span class="leg-rule"></span></div>'
      + '<div class="leg end">'
      + '<span class="leg-time' + (ev.flags && ev.flags.endEstimated ? ' approx' : '') + '">' + (hasEnd ? (ev.flags && ev.flags.endEstimated ? '~' : '') + esc(r.end.time) : '\\u2014') + '</span>'
      + '<span class="leg-place">' + (placeHtml(m.to) || '<span class="muted">Arrival</span>') + '</span>'
      + '<span class="leg-date">' + (hasEnd ? esc(BTCCal.niceDate(r.end.date)) + (arrZone ? ' \\u00b7 ' + esc(arrZone) : '') : '') + '</span>'
      + '</div>'
      + '</div>';
  }
  var sameDay = r.end.date === r.start.date;
  var zone = zoneLabel(ev.tz, r.start.date, r.start.time);
  var when = BTCCal.niceDate(r.start.date) + ' \\u00b7 ' + r.start.time
    + (r.minutes > 0 ? ' \\u2013 ' + (sameDay ? '' : BTCCal.niceDate(r.end.date) + ' ') + r.end.time : '');
  return '<p class="when-line">' + esc(when) + (zone ? ' <span class="muted">\\u00b7 ' + esc(zone) + '</span>' : ' <span class="muted">\\u00b7 your local time</span>') + '</p>'
    + (ev.location ? '<p class="where-line">' + esc(ev.location) + '</p>' : '');
}

function chipsFor(ev){
  var m = ev.meta || {}, f = ev.flags || {};
  var out = [];
  var chip = function(label, value){ if (value) out.push('<li class="chip"><span class="chip-label">' + esc(label) + '</span> ' + esc(value) + '</li>'); };
  var warn = function(text, title){ out.push('<li class="chip warn" title="' + esc(title || '') + '">' + esc(text) + '</li>'); };
  if (m.airline) chip('Airline', m.airline);
  if (m.via && m.via.length) chip('Connecting', m.via.join(', '));
  chip('Boarding', m.boarding);
  chip('Gate', m.gate);
  chip('Coach', m.coach);
  chip('Seat', m.seat);
  if (ev.type === 'hotel'){
    chip('Check-in', m.checkIn ? 'from ' + m.checkIn : '');
    chip('Check-out', m.checkOut ? 'until ' + m.checkOut : '');
    chip('Room', m.room);
  }
  chip(m.refLabel || 'Ref', m.ref);
  if (f.endEstimated) warn('Arrival estimated', 'No arrival time in the document: estimated from the flight distance. Edit it if you know better.');
  if (f.startIsBoarding) warn('Starts at boarding time', 'The document has no departure time, only a boarding time.');
  if (f.yearAssumed) warn('Year assumed', 'The document has no year. Check the date.');
  if (f.timeAssumed && !ev.allDay) warn('Time assumed', 'No time in the document: your default start time is used.');
  if (ev.confidence === 'low' && !f.timeAssumed) warn('Check details', 'This one was hard to read. Check the details before adding it.');
  (ev.notes || []).forEach(function(n){ if (/Another source/.test(n)) warn('Sources disagree', n); });
  if (ev.sources && ev.sources.length) out.push('<li class="chip src" title="' + esc(ev.sources.join('\\n')) + '">' + esc(ev.sources.length === 1 ? ev.sources[0] : ev.sources.length + ' sources') + '</li>');
  return out.length ? '<ul class="chips">' + out.join('') + '</ul>' : '';
}

function eventCard(ev, i){
  var open = !!openEdits[ev.uid];
  var html = ''
    + '<article class="event-card card type-' + esc(ev.type) + '" data-idx="' + i + '">'
    + '<header class="ev-top">'
    + '<div class="ev-heading">'
    + '<span class="badge type-' + esc(ev.type) + '">' + esc(TYPE_LABELS[ev.type] || 'Event') + '</span>'
    + '<h2 class="ev-title" data-title>' + esc(BTCCal.titleOf(ev, settings)) + '</h2>'
    + '</div>'
    + '<div class="ev-tools">'
    + '<button type="button" class="icon-btn" data-act="edit" aria-expanded="' + open + '" aria-label="Edit event" title="Edit">'
    + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>'
    + '</button>'
    + '<button type="button" class="icon-btn ev-del" data-act="del" aria-label="Remove event" title="Remove">'
    + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>'
    + '</button>'
    + '</div>'
    + '</header>'
    + '<div class="ev-when">' + whenBlock(ev) + '</div>'
    + chipsFor(ev)
    + '<div class="event-actions">' + cardButtons() + '</div>';
  if (open) html += editForm(ev);
  return html + '</article>';
}

// Per-event target buttons, driven by the settings. Apple has no web prefill —
// it gets an .ics download. Google gets an extra copy-link button so the
// prefilled link can be shared.
function cardButtons(){
  var defs = { google: 'Google', apple: 'Apple', outlook: 'Outlook', yahoo: 'Yahoo', ics: '.ics file' };
  var out = '<span class="field-label">Add to</span>';
  var any = false;
  for (var t in defs){
    if (!settings.targets[t]) continue;
    any = true;
    out += '<button type="button" class="btn secondary" data-act="export" data-target-name="' + t + '">' + defs[t] + '</button>';
    if (t === 'google'){
      out += '<button type="button" class="btn secondary icon-only" data-act="copy" title="Copy shareable Google Calendar link" aria-label="Copy Google Calendar link">'
        + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>'
        + '</button>';
    }
  }
  if (!any) out += '<span class="muted">No calendar targets selected \\u2014 pick some in Settings.</span>';
  return out;
}

function editForm(ev){
  var html = '<div class="ev-edit">'
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
  var zones = ev.tz ? ev.tz + (ev.tzEnd && ev.tzEnd !== ev.tz ? ' \\u2192 ' + ev.tzEnd : '') : '';
  html += '</div>'
    + '<label class="check-row allday-row"><input type="checkbox" data-field="allDay" ' + (ev.allDay ? 'checked' : '') + '> <span>All-day event</span></label>'
    + '<p class="hint tz-hint">' + (ev.allDay ? 'All-day events have no timezone.'
      : zones ? 'Times are local to ' + esc(zones) + ' and convert to your calendar\\u2019s timezone automatically.'
        : 'No timezone detected \\u2014 times are added as-is in your calendar\\u2019s timezone.') + '</p>'
    + '</div>';
  return html;
}

// --- results: interaction (delegated) -----------------------------------------
function cardEvent(target){
  var card = target.closest('.event-card');
  if (!card) return null;
  var idx = Number(card.getAttribute('data-idx'));
  return { card: card, idx: idx, ev: currentEvents[idx] };
}

qs('#event-list').addEventListener('click', function(e){
  var btn = e.target.closest('[data-act]');
  if (!btn) return;
  var c = cardEvent(btn);
  if (!c || !c.ev) return;
  var act = btn.getAttribute('data-act');
  if (act === 'edit'){
    if (openEdits[c.ev.uid]) delete openEdits[c.ev.uid]; else openEdits[c.ev.uid] = true;
    renderEvents();
    var again = qs('.event-card[data-idx="' + c.idx + '"] ' + (openEdits[c.ev.uid] ? '[data-field="title"]' : '[data-act="edit"]'));
    if (again) again.focus();
  } else if (act === 'del'){
    currentEvents.splice(c.idx, 1);
    delete openEdits[c.ev.uid];
    if (!currentEvents.length){ notices = []; qs('#results').classList.add('hidden'); renderEntryView(); }
    else renderEvents();
  } else if (act === 'export'){
    exportEvent(btn.getAttribute('data-target-name'), c.ev);
  } else if (act === 'copy'){
    navigator.clipboard.writeText(BTCCal.googleUrl(c.ev, settings)).then(
      function(){ toast('Google Calendar link copied \\u2014 paste it anywhere', 'success'); },
      function(){ toast('Clipboard access denied', 'danger'); }
    );
  }
});

// Typing in the title updates the heading live; other fields re-render the
// card once the value is committed.
qs('#event-list').addEventListener('input', function(e){
  var inp = e.target.closest('[data-field="title"], [data-field="location"]');
  if (!inp) return;
  var c = cardEvent(inp);
  if (!c || !c.ev) return;
  c.ev[inp.getAttribute('data-field')] = inp.value;
  if (inp.getAttribute('data-field') === 'title') c.card.querySelector('[data-title]').textContent = BTCCal.titleOf(c.ev, settings);
});
qs('#event-list').addEventListener('change', function(e){
  var inp = e.target.closest('[data-field]');
  if (!inp) return;
  var c = cardEvent(inp);
  if (!c || !c.ev) return;
  var field = inp.getAttribute('data-field');
  if (field === 'title' || field === 'location') return; // handled on input
  applyField(c.ev, field, inp);
  renderEvents();
});

function dropNote(ev, re){
  ev.notes = (ev.notes || []).filter(function(n){ return !re.test(n); });
}

function applyField(ev, field, inp){
  var f = ev.flags || (ev.flags = {});
  var m = ev.meta || {};
  if (field === 'allDay'){
    ev.allDay = inp.checked;
    if (ev.allDay){
      if (!ev.end) ev.end = { date: ev.start.date, time: null };
      ev.end.time = null;
      ev.start.time = null;
    } else {
      // Hotels fall back to their check-in / check-out times.
      ev.start.time = (ev.type === 'hotel' && m.checkIn) || settings.defaultTime;
      if (!ev.end) ev.end = { date: ev.start.date, time: null };
      ev.end.time = (ev.type === 'hotel' && m.checkOut) || (ev.end.date > ev.start.date ? settings.defaultTime : plusMinutes(ev.start.time, settings.defaultDuration));
    }
    return;
  }
  var parts = field.split('.');
  if (!ev[parts[0]]) ev[parts[0]] = { date: ev.start.date, time: null };
  ev[parts[0]][parts[1]] = inp.value || null;
  // A hand-edited value is no longer an assumption or an estimate.
  if (field === 'start.date'){
    if (!inp.value){ ev.start.date = todayIso(); }
    if (ev.end && (!ev.end.date || ev.end.date < ev.start.date)) ev.end.date = ev.start.date;
    delete f.yearAssumed; dropNote(ev, /no year/);
  }
  if (field === 'start.time'){ delete f.timeAssumed; delete f.startIsBoarding; dropNote(ev, /boarding time/); }
  if (field === 'end.time' || field === 'end.date'){ delete f.endEstimated; delete f.endAssumed; dropNote(ev, /estimated/); }
  if (field === 'end.date' && !inp.value) ev.end.date = ev.start.date;
}

function todayIso(){
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function plusMinutes(hhmm, mins){
  var p = (hhmm || '12:00').split(':').map(Number);
  var total = ((p[0] * 60 + p[1] + mins) % 1440 + 1440) % 1440;
  return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
}

// --- export -----------------------------------------------------------------
function exportEvent(target, ev){
  if (target === 'google'){ window.open(BTCCal.googleUrl(ev, settings), '_blank', 'noopener'); return; }
  if (target === 'outlook'){ window.open(BTCCal.outlookUrl(ev, settings), '_blank', 'noopener'); return; }
  if (target === 'yahoo'){ window.open(BTCCal.yahooUrl(ev, settings), '_blank', 'noopener'); return; }
  // apple + ics both download .ics (Apple Calendar has no web prefill URL).
  BTCCal.downloadIcs([ev], settings, slug(ev.title) + '.ics');
  toast('.ics downloaded \\u2014 open it to add the event', 'success');
}

function slug(s){
  return String(s || 'event').toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'event';
}

qs('#download-all').addEventListener('click', function(){
  if (!currentEvents.length){ toast('No events to export', 'warning'); return; }
  var name = currentEvents.length === 1 ? slug(currentEvents[0].title) : 'booktocal-' + currentEvents.length + '-events';
  BTCCal.downloadIcs(currentEvents, settings, name + '.ics');
  toast('.ics downloaded \\u2014 open it to import ' + (currentEvents.length === 1 ? 'the event' : 'all ' + currentEvents.length + ' events'), 'success');
});

qs('#add-event').addEventListener('click', function(){
  var today = todayIso();
  var localTz = null;
  try { localTz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e){}
  var ev = {
    uid: nextId++, type: 'event', icon: '\\ud83d\\udcc5', title: 'New event', location: '',
    tz: localTz, tzEnd: localTz, allDay: false,
    start: { date: today, time: settings.defaultTime },
    end: { date: today, time: plusMinutes(settings.defaultTime, settings.defaultDuration) },
    confidence: 'high', meta: { kind: 'event' }, notes: [], flags: {}, sources: []
  };
  currentEvents.push(ev);
  openEdits[ev.uid] = true;
  renderEvents();
  var cards = document.querySelectorAll('.event-card');
  var last = cards[cards.length - 1];
  if (last){
    last.scrollIntoView({ behavior: 'smooth', block: 'center' });
    var title = last.querySelector('[data-field="title"]');
    if (title){ title.focus(); title.select(); }
  }
});

// --- app init ---------------------------------------------------------------
(function initApp(){
  qs('#emoji-compose').checked = qs('#emoji-toggle').checked = qs('#set-emoji').checked = settings.emoji;
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
.muted { color: var(--text-muted); }

/* ambient backdrop: two slow-drifting accent glows */
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
  .aurora::before, .aurora::after, .spinner { animation: none; }
  html { scroll-behavior: auto; }
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

.counter {
  display: inline-block; margin-right: 4px; font-size: 12px; font-weight: 500;
  padding: 3px 10px; border-radius: 9999px;
  background: var(--surface-hover); color: var(--text-secondary);
  border: 1px solid var(--border-default); white-space: nowrap;
}
.counter.low { background: color-mix(in srgb, var(--warning) 14%, transparent); color: var(--warning); border-color: transparent; }
.counter.unlimited { background: color-mix(in srgb, var(--success) 14%, transparent); color: var(--success); border-color: transparent; font-size: 15px; }

.icon-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 44px; height: 44px; border-radius: 8px; flex: none;
  background: transparent; border: 1px solid transparent; color: var(--text-secondary);
  cursor: pointer; transition: background 150ms ease-out, color 150ms ease-out;
}
.icon-btn:hover { background: var(--surface-hover); color: var(--text-primary); }
.icon-btn[aria-expanded="true"] { background: var(--surface-hover); color: var(--accent); }

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
.headline-lg { font-size: 32px; font-weight: 600; letter-spacing: -0.025em; line-height: 1.15; margin: 0 0 12px; text-wrap: balance; }
.headline-sm { font-size: 20px; font-weight: 600; letter-spacing: -0.025em; margin: 0 0 12px; }
.grad {
  background: linear-gradient(92deg, var(--accent), var(--info));
  -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent; color: transparent;
}
.sub { color: var(--text-secondary); margin: 0 0 32px; max-width: 60ch; }
.overline {
  font-size: 12px; font-weight: 600; letter-spacing: 0.05em;
  text-transform: uppercase; color: var(--text-secondary); margin: 0 0 4px;
}
.hint { font-size: 13px; color: var(--text-muted); margin: 0 0 12px; }
.hint-inline { font-size: 12px; color: var(--text-muted); }

/* --- inputs ---------------------------------------------------------------- */
.input {
  width: 100%; border-radius: 8px; border: 1px solid var(--border-strong);
  background: var(--surface-input); color: var(--text-primary);
  font: inherit; padding: 12px 14px;
  transition: border-color 150ms ease-out;
}
.input::placeholder { color: var(--text-muted); }
.input:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

/* --- composer --------------------------------------------------------------- */
.composer {
  position: relative; border-radius: 16px;
  border: 1.5px dashed var(--border-strong);
  background: var(--surface-input);
  transition: border-color 150ms ease-out, background 150ms ease-out;
}
.composer:focus-within { border-color: var(--accent); border-style: solid; }
.composer.over { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, var(--surface)); }
.composer textarea.input {
  display: block; border: 0; background: transparent; border-radius: 16px 16px 0 0;
  resize: vertical; min-height: 168px; line-height: 1.6; padding: 16px;
  font-family: 'SF Mono', Menlo, Consolas, monospace; font-size: 13px;
}
.composer textarea.input:focus-visible { outline: none; }
.composer-bar {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  padding: 12px 16px; border-top: 1px solid var(--border-default);
}
.composer-hint { font-size: 13px; color: var(--text-muted); flex: 1 1 220px; }
.drop-veil {
  position: absolute; inset: 0; display: none; align-items: center; justify-content: center;
  border-radius: 16px; font-weight: 600; color: var(--accent); pointer-events: none;
  background: color-mix(in srgb, var(--surface) 86%, transparent);
}
.composer.over .drop-veil { display: flex; }

.file-list {
  list-style: none; margin: 0; padding: 4px 16px 12px;
  display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 8px;
  max-height: 248px; overflow-y: auto;
}
.file-chip {
  display: flex; align-items: center; gap: 10px; min-width: 0;
  padding: 4px 4px 4px 12px; border-radius: 8px;
  background: var(--surface); border: 1px solid var(--border-default);
}
.file-kind {
  flex: none; font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase;
  padding: 2px 8px; border-radius: 9999px;
  background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent);
}
.file-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; }
.file-note { flex: none; font-size: 12px; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.file-chip.error { border-color: color-mix(in srgb, var(--danger) 45%, transparent); }
.file-chip.error .file-note { color: var(--danger); }
.file-remove { width: 36px; height: 36px; }
.spinner {
  flex: none; width: 16px; height: 16px; margin: 10px; border-radius: 50%;
  border: 2px solid var(--border-strong); border-top-color: var(--accent);
  animation: spin 800ms linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.append-note {
  display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
  margin: -8px 0 16px; padding: 10px 14px; border-radius: 8px; font-size: 14px;
  background: color-mix(in srgb, var(--info) 10%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--info) 30%, transparent);
}
.compose-actions {
  display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;
  margin-top: 20px;
}
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
  display: flex; align-items: flex-end; justify-content: space-between;
  gap: 12px 24px; flex-wrap: wrap; margin-bottom: 16px;
}
.results-meta { margin: 0; color: var(--text-primary); font-size: 20px; font-weight: 600; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.results-actions { display: flex; align-items: center; gap: 8px 16px; flex-wrap: wrap; }
.results-foot { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 24px; }
.notices { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
.notice {
  margin: 0; padding: 10px 14px; border-radius: 8px; font-size: 14px;
  background: var(--surface); border: 1px solid var(--border-default); border-left: 4px solid var(--warning);
  overflow-wrap: anywhere;
}
.notice.danger { border-left-color: var(--danger); }

.event-list { display: flex; flex-direction: column; gap: 12px; }
.event-card { padding: 20px; border-left: 4px solid var(--accent); }
.event-card.type-flight { border-left-color: var(--info); }
.event-card.type-hotel { border-left-color: var(--success); }
.event-card.type-train, .event-card.type-bus, .event-card.type-ferry { border-left-color: var(--warning); }
.event-card.type-deadline { border-left-color: var(--danger); }
.ev-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.ev-heading { min-width: 0; }
.ev-title {
  margin: 6px 0 0; font-size: 20px; font-weight: 600; letter-spacing: -0.02em; line-height: 1.25;
  overflow-wrap: anywhere;
}
.ev-tools { display: flex; gap: 2px; margin: -8px -8px 0 0; }
.ev-del:hover { color: var(--danger); background: color-mix(in srgb, var(--danger) 10%, transparent); }
.badge {
  display: inline-block; font-size: 12px; font-weight: 500; padding: 2px 8px;
  border-radius: 9999px; white-space: nowrap;
}
.badge.type-flight { background: color-mix(in srgb, var(--info) 13%, transparent); color: var(--info); }
.badge.type-hotel { background: color-mix(in srgb, var(--success) 13%, transparent); color: var(--success); }
.badge.type-train, .badge.type-bus, .badge.type-ferry { background: color-mix(in srgb, var(--warning) 15%, transparent); color: var(--warning); }
.badge.type-deadline { background: color-mix(in srgb, var(--danger) 12%, transparent); color: var(--danger); }
.badge.type-event { background: color-mix(in srgb, var(--accent) 13%, transparent); color: var(--accent); }

.ev-when { margin-top: 16px; }
.when-line { margin: 0; font-size: 16px; font-variant-numeric: tabular-nums; }
.where-line { margin: 4px 0 0; font-size: 14px; color: var(--text-secondary); overflow-wrap: anywhere; }
.journey {
  display: grid; grid-template-columns: minmax(0, 1fr) minmax(72px, auto) minmax(0, 1fr);
  align-items: center; gap: 16px;
}
.leg { display: flex; flex-direction: column; min-width: 0; }
.leg.end { text-align: right; align-items: flex-end; }
.leg-time { font-size: 24px; font-weight: 600; letter-spacing: -0.02em; line-height: 1.2; font-variant-numeric: tabular-nums; }
.leg-time.approx { color: var(--text-secondary); }
.leg-place { font-size: 14px; overflow-wrap: anywhere; }
.leg-place .code {
  font-family: 'SF Mono', Menlo, Consolas, monospace; font-size: 12px; color: var(--text-secondary);
  padding: 1px 6px; border-radius: 4px; background: var(--surface-hover); white-space: nowrap;
}
.leg-date { font-size: 12px; color: var(--text-muted); font-variant-numeric: tabular-nums; }
.leg-mid { display: flex; align-items: center; gap: 8px; color: var(--text-muted); }
.leg-rule { flex: 1 1 16px; height: 1px; background: var(--border-strong); }
.leg-dur { font-size: 12px; white-space: nowrap; font-variant-numeric: tabular-nums; }

.chips { list-style: none; margin: 16px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; }
.chip {
  font-size: 12px; padding: 2px 8px; border-radius: 9999px; max-width: 100%;
  background: var(--surface-hover); color: var(--text-primary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.chip-label { color: var(--text-muted); }
.chip.warn { background: color-mix(in srgb, var(--warning) 14%, transparent); color: var(--warning); cursor: help; }
.chip.src { background: transparent; border: 1px solid var(--border-default); color: var(--text-muted); max-width: 240px; }

.event-actions {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border-default);
}
.field-label { font-size: 12px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--text-secondary); }
.event-actions .field-label { margin-right: 4px; }
.event-actions .btn.icon-only { padding: 10px; width: 44px; }

.ev-edit { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border-default); }
.event-grid {
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px;
}
.event-grid label { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.event-grid .span2 { grid-column: span 2; }
.event-grid .input { padding: 9px 12px; }
.allday-row { margin-top: 8px; }
.tz-hint { margin: 0; overflow-wrap: anywhere; }

/* --- settings slide-over ------------------------------------------------------- */
.overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 100; }
.slideover {
  position: fixed; top: 0; right: 0; bottom: 0; width: 400px; max-width: 100vw;
  background: var(--surface-raised); border-left: 1px solid var(--border-default);
  box-shadow: var(--shadow-3); z-index: 101; padding: 24px; overflow-y: auto;
  animation: slide-in 250ms ease-out;
}
@keyframes slide-in { from { transform: translateX(24px); opacity: 0; } to { transform: none; opacity: 1; } }
.slideover-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.slideover-head .headline-sm { margin: 0; }
.settings-group { border-top: 1px solid var(--border-default); padding: 16px 0; }
.check-row {
  display: flex; align-items: center; gap: 10px; padding: 8px 0;
  cursor: pointer; min-height: 44px; color: var(--text-primary);
}
.check-row.inline { padding: 0; font-size: 14px; color: var(--text-secondary); }
.check-row input { accent-color: var(--accent); width: 16px; height: 16px; flex: none; }
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
  position: fixed; right: 16px; bottom: 16px; left: 16px; z-index: 120;
  display: flex; flex-direction: column; align-items: flex-end; gap: 8px; pointer-events: none;
}
.toast {
  max-width: min(420px, 100%);
  background: var(--surface-raised); border: 1px solid var(--border-default);
  border-left: 4px solid var(--info);
  border-radius: 8px; box-shadow: var(--shadow-2);
  padding: 10px 16px; font-size: 14px; color: var(--text-primary); overflow-wrap: anywhere;
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
  .foot { padding: 24px 16px 48px; }
  .hero-card { padding: 24px 16px; }
  .headline-lg { font-size: 26px; }
  .sub { margin-bottom: 24px; }
  .compose-actions { flex-direction: column; align-items: stretch; }
  .compose-actions .btn { width: 100%; }
  .slideover { width: 100vw; border-left: 0; }
  .event-card { padding: 16px; }
  .ev-title { font-size: 18px; }
  .event-grid { grid-template-columns: 1fr; }
  .event-grid .span2 { grid-column: auto; }
  .journey { gap: 8px; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); }
  .leg-time { font-size: 20px; }
  .leg-mid .leg-rule:last-child { display: none; }
  .results-actions { width: 100%; justify-content: space-between; }
  .results-foot .btn { flex: 1 1 auto; }
}

/* --- focus & a11y ------------------------------------------------------------------- */
:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.hidden { display: none !important; }
`;
}
