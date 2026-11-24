# bookingtocal — project context

Convert booking confirmations (pasted text, PDFs, screenshots, emails, wallet
passes) into calendar events (Google/Outlook/Yahoo links, .ics downloads).
Cloudflare Worker, vanilla JS, no build step, no runtime deps — same
architecture as ~/projects/ai-safegeon.

## Commands

```sh
npm run dev                    # wrangler dev on :8787 (dev vars in .dev.vars)
npm run deploy                 # wrangler deploy
npm test                       # all five test files below
node tests/parse.test.mjs      # parser unit cases
node tests/fixtures.test.mjs   # real bookings: emails, PDF text, OCR, pastes, merging
node tests/ics.test.mjs        # export: UTC conversion, titles, descriptions
node tests/intake.test.mjs     # HTML / .eml / zip / .pkpass conversion
node tests/extract.test.mjs    # PDF extraction e2e (generates its own PDF)
node tests/debug-pdfs.mjs [f]  # print parse output for PDFs (default: tests/fixtures + fixtures/private)
node tests/debug-flight.mjs [f] # print parse output for a text file
npm run build:airports         # regenerate public/vendor/airports.js
```

## Structure

- `src/index.js` — Worker: `GET /` (nonce'd HTML), `POST /api/verify-code`
  (rate-limited, constant-time), canonical 302 to booktocal.com (localhost
  exempt), `/vendor/*` static fallback.
- `src/ui.js` — the whole UI: token CSS (websquadesign.md, dark default +
  light via `data-theme`), markup, inline client script (composer with file
  list, freemium, Konami, settings drawer, event cards, edit forms).
- `public/vendor/` — classic scripts, each attaching one global, loaded in
  this order:
  - `airports.js` — GENERATED table `BTC_AIRPORTS` (IATA|city|name|zone|lat|lon).
  - `geo.js` — `BTCGeo`: airport lookup by code/name, airlines, place→timezone,
    flight-time estimate. All place knowledge lives here.
  - `tz.js` — `BTCTz`: wall-clock ↔ UTC via Intl, offset labels.
  - `parser.js` — `BTCParser.parseDocuments([{name,text}], opts)` /
    `parseBooking(text, opts)`. Single source of truth for parsing.
  - `ics.js` — `BTCCal`: `titleOf` (emoji prefix), `describe` (built from
    `ev.meta` at export time), ICS, Google/Outlook/Yahoo URLs.
  - `extract.js` — `BTCExtract`: pdf.js text extraction; wide gaps become TABs.
  - `intake.js` — `BTCIntake.read(file, env)`: file → `[{name,text}]` for PDF,
    image (OCR), `.eml`, `.html`, `.txt`, `.pkpass`.
  - `pdf*.mjs` — vendored pdfjs-dist 6.3.289 legacy build (Apache-2.0;
    refresh: `npm i -D pdfjs-dist` and copy `legacy/build/pdf{,.worker}.min.mjs`).
  - `tesseract/` — vendored tesseract.js 7 (see its README for refresh steps).
- `public/_headers` — security headers for everything under `public/`
  (static files are served without running the Worker).
- `scripts/build-airports.mjs` — generates `airports.js` from the
  `airports-json` + `tz-lookup` + `countries-and-timezones` dev deps.
- `tests/` — plain node, no framework; `_load.mjs` evals the vendor scripts in
  one scope like the browser does. `fixtures/*.txt` are pasted emails,
  `fixtures/real/*.txt` are PDF extractions (tabs = table columns), OCR output
  (`ocr-*`) and pastes (`paste-*`). `fixtures/private/` is gitignored: real,
  unanonymized documents go there and nowhere else.
- `_plans/` — bigtask plan files (gitignored).

## Event shape

```
{ type: 'flight'|'train'|'bus'|'ferry'|'hotel'|'deadline'|'event',
  icon, title (no emoji), location, tz, tzEnd, allDay,
  start: {date, time}, end: {date, time},
  meta: { kind, number, airline, via, from:{code,city,name,tz,terminal}, to,
          ref, refLabel, seat, coach, gate, boarding, durationMin,
          name, city, checkIn, checkOut, room },
  flags: { endEstimated, startIsBoarding, yearAssumed, timeAssumed, endAssumed,
           dateOrderAssumed },
  notes: [strings for the description], confidence, sources: [doc names] }
```

## Conventions / gotchas

- No build step: the client never imports src/*.js — shared client code lives
  in `public/vendor/*.js` as classic scripts attaching globals.
- The inline client script in ui.js lives inside a JS template literal: no
  backticks in client code, `\\u...` / `\\d` double-escapes, `${...}` interpolates.
- Parser pipeline per document: `prepare` (dates, times, time roles from
  labels/headers, junk and bookkeeping-date marking) → collectors in order
  ground → flights → deadlines → hotels → generic, each marking lines `used`
  → `mergeEvents` across documents → `finalize` (titles, zones, estimates).
- Flights are anchored on flight numbers: one block per number; the lines a
  block keeps above its number (`leadAbove`) are measured on the first booking
  and reused for the rest. An unlabelled airline designator only counts when
  it is in `AIRLINES` (geo.js).
- A time's meaning comes from `assignRoles`: inline label, column header row,
  or a lone label line above it. Add label words to `ROLE_PATTERNS`.
- Ambiguous slash dates (`05/12/2026`): the document's own unambiguous date
  wins, then `opts.dayFirst` (ui.js `slashDayFirst()`), then US; the event
  gets `flags.dateOrderAssumed`. Dots and dashes are day-first.
- Visa deadlines: `collectDeadlines` ignores card mentions (`RE_CARD_VISA`)
  and needs `RE_VISA_STRONG` wording when the document is a booking.
- Dates preceded by a bookkeeping label (`META_SRC`: booked on, issued, born…)
  never anchor an event. Add labels there, not special cases in collectors.
- Titles and descriptions are computed, not stored: change `finalize*` in
  parser.js for titles, `detailLines` in ics.js for descriptions.
- Timezones: extend the tables in geo.js (or regenerate airports.js), never
  the exporters, when a place resolves wrong.
- Freemium: 3 free conversions (localStorage `btcConversions`; one per Convert
  click regardless of file count), gate at 3, banner at 2, unlock code vs
  `UNLOCK_CODE` secret, Konami = click logo then ↑↑↓↓←→←→BA. The gate exists
  only when `PAYMENT_LINK` is set (`GATE_ON`); test it locally with
  `npx wrangler dev --var PAYMENT_LINK:https://example.com/pay`.
- Edit form: a field change updates its card in place (`refreshCard`). Never
  call `renderEvents()` from a field handler: it replaces the input being
  typed in. Only the all-day switch rebuilds the form.
- ICS UIDs are stable (`uidOf`: type + number or title + start date).
- Settings (targets, emoji, hotel all-day, default time/duration,
  no-time→all-day) persist in localStorage `btcSettings`.
- When adding a pattern: add a fixture (anonymize names, references, emails,
  phones, passport numbers) and a check in `tests/fixtures.test.mjs`, then
  `npm test`.
- Every HTML response needs the per-response CSP nonce (see `htmlResponse`).
- New Worker header → add it to `public/_headers` too (no CSP there: the OCR
  worker compiles WebAssembly).
- Deploy: `wrangler deploy`; secrets via `wrangler secret put UNLOCK_CODE`.
  `PAYMENT_LINK` is a plain var in wrangler.jsonc (empty until Stripe exists).

## Verify

- After parser/geo/ics/intake changes: `npm test`.
- After ui.js changes: syntax-check the inline script —
  `node --input-type=module -e "import {appPage} from './src/ui.js'; new Function(appPage('n','').match(/<script nonce=\"n\">([\s\S]*?)<\/script>/)[1])"`
  — and load `/` locally (`npm run dev`), convert a PDF and a screenshot.
- `curl -sI localhost:8787` (HEAD) returns hardened 404 — CSP is on `GET /`.
