# bookingtocal

Turn booking emails (hotels, flights, trains, shows — anything with dates) or
booking PDFs into calendar events: Google / Outlook / Yahoo prefill links or an
`.ics` file. Single Cloudflare Worker, vanilla JS, no build step, no runtime
dependencies.

- **Privacy-first parsing** — all parsing and PDF text extraction runs in the
  browser. Booking text never leaves the page; the Worker serves UI and
  verifies unlock codes, nothing else. No database, no storage, no logs of
  user content.
- **Deterministic parser** (`public/vendor/parser.js`) — recognizes hotel
  check-in/out blocks, flight legs (numbers, routes, departure/arrival), train
  journeys, and generic dated lines in the date formats real confirmation
  emails use (ISO, US, EU, month names in EN/DE/FR/ES/IT, weekday prefixes,
  12h/24h/`18h05`/`13∶10` times). Missing details use your defaults: start
  12:00 (noon) and a 30-minute duration when the source has one date/time and
  no interval (both configurable; optionally make time-less events all-day).
- **PDF support** — vendored pdf.js (Apache-2.0, `public/vendor/`) extracts
  text locally; the file never uploads.
- **Editable results** — every detected event (title, times, location,
  all-day) can be fixed before export, with per-event export buttons for the
  calendar targets you enable in settings.
- **Freemium** — 3 free conversions, then a paywall ("$5 or more",
  `PAYMENT_LINK` var). A shared `UNLOCK_CODE` (verified server-side in
  constant time) or the Konami easter egg (click the logo, then
  `↑ ↑ ↓ ↓ ← → ← → B A`) unlocks unlimited conversions. Like safegeon, the
  counter is honest-user friction (localStorage), not access control.
- **UI** — follows the design tokens in `websquadesign.md` (dark default +
  light theme, CSS variables only). Times are written as *floating* local
  times in ICS and links: source texts rarely state a timezone, so events land
  in the user's calendar timezone instead of a guessed venue timezone.
- The canonical production origin is **booktocal.com**; every other host
  302-redirects there (localhost exempt for dev).

## How it works

```
paste text or drop PDF ──► parser (browser) ──► editable event cards
                                                    │
        Google / Outlook / Yahoo prefill links ◄────┤
        .ics download (single event or all) ◄───────┘
```

The Worker (`src/index.js`) has exactly two jobs:

1. `GET /` — serve the app HTML with a per-response CSP nonce.
2. `POST /api/verify-code` — constant-time compare of the unlock code against
   the `UNLOCK_CODE` secret, rate-limited per IP.

Everything else (parsing, PDF extraction, ICS generation, settings) is
client-side JavaScript served from `/vendor/`.

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
node tests/parse.test.mjs      # parser unit fixtures
node tests/fixtures.test.mjs   # real booking copies (anonymized)
node tests/extract.test.mjs    # PDF extraction + parse (generates its own PDF)
```

## Security

- **No user data reaches the server.** Parsing is 100% client-side; there is
  no upload endpoint, no storage, no analytics on content. Telemetry records
  only unlock attempts (event, IP, country).
- **CSP**: per-response nonce for the inline script; `script-src 'self'` for
  the vendored scripts; no `unsafe-inline` scripts; `connect-src 'self'`;
  `base-uri 'none'; form-action 'none'; frame-ancestors 'none'`.
- **Security headers** on every response: `nosniff`, `DENY` framing,
  `no-referrer`, HSTS (2y, includeSubDomains), restrictive `Permissions-Policy`.
- **Unlock endpoint**: constant-time compare (SHA-256 + `timingSafeEqual`),
  fails closed when `UNLOCK_CODE` is unset, rate-limited 10/min/IP, input
  normalized (case/whitespace-insensitive) and length-capped.
- **XSS**: all user-derived strings (parsed titles, locations, source text)
  are HTML-escaped before insertion; ICS text is RFC 5545–escaped and lines
  are folded at 75 octets.
- **Freemium is friction, not enforcement** — the counter is client-side; a
  determined user can clear it. The unlock code is the only server-checked
  credential.

## Trade-offs

- **Floating times**: events render in the viewer's calendar timezone. For a
  hotel booked in another timezone this may be off by hours — the event is
  editable before export by design.
- **Deterministic parser**: exotic formats may need manual edits; policy
  lines ("cancel before...") are deliberately ignored.
- **Year inference**: dates without a year roll to next year if they would
  otherwise be in the past (bookings are usually future).
- **Two-digit years are 20xx**; ambiguous slash dates default US (07/04 =
  July 4), dotted dates default EU (04.07 = July 4).
