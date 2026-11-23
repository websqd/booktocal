# bookingtocal

Turn booking confirmations — flights, trains, buses, hotels, show tickets,
visas, anything with a date — into calendar events: Google / Outlook / Yahoo
prefill links or `.ics` files. Paste text or drop any number of PDFs,
screenshots, saved emails and wallet passes; every booking becomes its own
event, in the local time of where it happens. Single Cloudflare Worker,
vanilla JS, no build step, no runtime dependencies.

- **Privacy-first** — files are read and parsed in the browser (PDF text
  extraction, OCR, email and wallet-pass decoding included). Nothing is
  uploaded; the Worker serves the UI and verifies unlock codes, nothing else.
- **Many inputs, converted together** — pasted text (separate several
  bookings with a line of `---`), PDFs (scanned ones fall back to OCR),
  screenshots and photos (vendored tesseract.js, loaded only when an image is
  added), `.eml` / `.html` / `.txt` emails (attachments included) and Apple
  Wallet `.pkpass` files.
- **One event per booking** — a document with two flights yields two events.
  The same trip seen in several documents (an e-ticket and its boarding pass)
  merges into one event that keeps the best of each: times from the boarding
  pass, booking reference from the ticket. Disagreements are flagged.
- **Readable events** — titles like `✈️ VN815: Ho Chi Minh City - Siem Reap`,
  `🚆 IR 1657: București Nord - Piatra Neamț`, `🏨 Koulen Hotel, Siem Reap`
  (emoji prefix is a checkbox, on by default; trains in Japan get 🚅, buses 🚌,
  shows 🎭, circus 🎪, water parks 🌊 …). Descriptions list local departure and
  arrival times with their UTC offsets, duration, seat/coach/gate and booking
  reference.
- **Right time everywhere** — departure and arrival are converted from their
  own airport/city timezones to UTC on export, so the event is correct in any
  calendar. A missing arrival time (boarding passes) is estimated from the
  distance between the airports and marked as an estimate. Unknown places
  stay floating.
- **Deterministic parser** (`public/vendor/parser.js`) — no AI, no network.
  Reads itinerary tables, boarding passes, train tickets, hotel vouchers and
  free text in the date formats real confirmations use (ISO, US, EU, month
  names in several languages, `28JAN`, `15Nov2026`, weekday prefixes,
  12h/24h/`18h05` times). Bookkeeping dates (booked on, issued, date of
  birth), policy text and office hours are ignored.
- **Editable results** — every event can be corrected before export; hotel
  stays are all-day banners by default (a timed block is one setting away).
- **Freemium** — 3 free conversions (a conversion is one click, however many
  files), then a paywall ("$5 or more", `PAYMENT_LINK` var). A shared
  `UNLOCK_CODE` (verified server-side in constant time) or the Konami easter
  egg (click the logo, then `↑ ↑ ↓ ↓ ← → ← → B A`) unlocks unlimited
  conversions. The counter is honest-user friction (localStorage), not access
  control.
- **UI** — follows the design tokens in `websquadesign.md` (dark default +
  light theme, CSS variables only).
- The canonical production origin is **booktocal.com**; every other host
  302-redirects there (localhost exempt for dev).

## How it works

```
paste text / drop files ─► intake.js ─► parser.js ─► event cards (editable)
 PDF · image · eml · pkpass   to text    to events        │
                                                           ├─► Google / Outlook / Yahoo links
                                                           └─► .ics (one event or all)
```

All of that is client-side JavaScript served from `/vendor/`:

| File | Role |
| --- | --- |
| `intake.js` | file → text: PDF (`extract.js` + pdf.js), OCR, email MIME, HTML, `.pkpass` |
| `parser.js` | text → events: collectors per booking type, cross-document merge |
| `geo.js` + `airports.js` | airports (city, zone, coordinates), airlines, place → timezone |
| `tz.js` | wall-clock ↔ UTC via `Intl` |
| `ics.js` | titles, descriptions, `.ics`, calendar links |

The Worker (`src/index.js`) has exactly two jobs:

1. `GET /` — serve the app HTML with a per-response CSP nonce.
2. `POST /api/verify-code` — constant-time compare of the unlock code against
   the `UNLOCK_CODE` secret, rate-limited per IP.

## Setup

Requires Node.js (for Wrangler) and a Cloudflare account.

```sh
npm install

# 1. Set the freemium unlock code (any string; shared with paying users)
npx wrangler secret put UNLOCK_CODE

# 2. Payment link (Stripe or any URL the paywall buttons open)
#    -> edit vars.PAYMENT_LINK in wrangler.jsonc

# 3. Deploy
npx wrangler deploy
```

### Local development

```sh
cat > .dev.vars <<'EOF'
UNLOCK_CODE=dev-code
PAYMENT_LINK=
EOF
npx wrangler dev
```

`UNLOCK_CODE` unset in production makes `/api/verify-code` fail closed (500 →
invalid). The `VERIFY_LIMITER` rate-limit binding caps code guessing at
10/min/IP.

## Tests

```sh
npm test                       # everything below
node tests/parse.test.mjs      # parser unit cases
node tests/fixtures.test.mjs   # real bookings (anonymized): emails, PDF text, OCR, pastes, merging
node tests/ics.test.mjs        # export: UTC conversion, titles, descriptions, folding
node tests/intake.test.mjs     # HTML / .eml / zip / .pkpass conversion
node tests/extract.test.mjs    # PDF extraction + parse (generates its own PDF)
node tests/debug-pdfs.mjs      # print what the parser makes of each PDF fixture
```

`public/vendor/airports.js` is generated: `npm run build:airports` (OurAirports
data, public domain, via the `airports-json` dev dependency).

## Security

- **No user data reaches the server.** Parsing is 100% client-side; there is
  no upload endpoint, no storage, no analytics on content. Telemetry records
  only unlock attempts (event, IP, country).
- **CSP**: per-response nonce for the inline script; `script-src 'self'` for
  the vendored scripts; no `unsafe-inline` scripts; `connect-src 'self'`;
  `worker-src 'self'` (pdf.js and the OCR engine run in same-origin workers);
  `base-uri 'none'; form-action 'none'; frame-ancestors 'none'`.
- **Security headers** on every response: `nosniff`, `DENY` framing,
  `no-referrer`, HSTS (2y, includeSubDomains), restrictive `Permissions-Policy`.
- **Unlock endpoint**: constant-time compare (SHA-256 + `timingSafeEqual`),
  fails closed when `UNLOCK_CODE` is unset, rate-limited 10/min/IP, input
  normalized (case/whitespace-insensitive) and length-capped.
- **XSS**: all user-derived strings (parsed titles, locations, file names)
  are HTML-escaped before insertion; ICS text is RFC 5545–escaped and lines
  are folded at 75 octets.
- **Untrusted files**: HTML and email bodies are reduced to text with string
  replacement, never inserted into the DOM; zip entries are size-capped.
- **Freemium is friction, not enforcement** — the counter is client-side; a
  determined user can clear it. The unlock code is the only server-checked
  credential.

## Trade-offs

- **Deterministic parser**: layouts it has never seen may need manual edits;
  that is the price of keeping everything in the browser. Events are editable
  before export by design, and uncertain values are flagged on the card.
- **Timezones** come from a table of ~3,200 airports plus country/city words;
  unknown places fall back to floating times (rendered in the viewer's
  calendar timezone).
- **Estimated arrivals** use great-circle distance (roughly ±15%); they are
  marked with `~` and a note in the description.
- **Year inference**: a weekday next to the date pins the year. Otherwise a
  date without a year is the next occurrence — unless it passed within the
  last 45 days, in which case it stays in the current year.
- **Slash dates**: one unambiguous date (`25/11/2026`) decides the whole
  document; otherwise they default to US (07/04 = July 4). Dotted dates are
  EU (04.07 = July 4).
- **OCR** is English-trained and tuned for screenshots; photos of paper
  tickets are hit-and-miss. The engine is a ~7 MB download the first time an
  image is added.
