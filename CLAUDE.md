# bookingtocal — project context

Convert booking emails (pasted text) or booking PDFs into calendar events
(Google/Outlook/Yahoo links, .ics downloads). Cloudflare Worker, vanilla JS,
no build step, no runtime deps — same architecture as ~/projects/ai-safegeon.

## Commands

```sh
npm run dev                    # wrangler dev on :8787 (dev vars in .dev.vars)
npm run deploy                 # wrangler deploy
node tests/parse.test.mjs      # parser unit fixtures (14)
node tests/fixtures.test.mjs   # real booking fixtures from ~/Downloads/booking-ex (7)
node tests/extract.test.mjs    # PDF extraction e2e (generates its own PDF)
node tests/debug-pdfs.mjs      # print parse output for every PDF in tests/fixtures
```

## Structure

- `src/index.js` — Worker: `GET /` (nonce'd HTML), `POST /api/verify-code`
  (rate-limited, constant-time), canonical 302 to booktocal.com (localhost
  exempt), `/vendor/*` static fallback.
- `src/ui.js` — the whole UI: token CSS (websquadesign.md, dark default +
  light via `data-theme`), markup, inline client script (state, freemium,
  Konami, settings drawer, event cards).
- `public/vendor/parser.js` — deterministic booking parser (classic script,
  global `BTCParser`). Single source of truth for parsing; node tests eval it.
- `public/vendor/extract.js` — pdf.js text extraction (global `BTCExtract`).
- `public/vendor/ics.js` — ICS generation + Google/Outlook/Yahoo URLs (global
  `BTCCal`). Floating times (no TZ) by design.
- `public/vendor/pdf*.mjs` — vendored pdfjs-dist 6.3.289 legacy build
  (Apache-2.0; refresh: `npm i -D pdfjs-dist` and copy
  `legacy/build/pdf{,.worker}.min.mjs`).
- `tests/` — plain node, no test framework. `fixtures/` holds anonymized real
  booking copies; regenerate a copy: copy from ~/Downloads/booking-ex and
  sed-replace the surname.
- `_plans/` — bigtask plan files (gitignored).

## Conventions / gotchas

- No build step: the client never imports src/*.js — shared client code lives
  in `public/vendor/*.js` as classic scripts attaching globals; node tests
  load them with `new Function(src + '; return BTCParser;')()`.
- The inline client script in ui.js lives inside a JS template literal: no
  backticks in client code, `\\u...` double-escapes, `${...}` interpolates.
- Freemium: 3 free conversions (localStorage `btcConversions`), gate at 3,
  banner at 2, unlock code vs `UNLOCK_CODE` secret, Konami = click logo then
  ↑↑↓↓←→←→BA. Same friction-not-enforcement model as safegeon.
- Settings (targets, default time, default duration, no-time→all-day) persist
  in localStorage `btcSettings`; defaults: noon + 30 minutes.
- Parser heuristics live in one file; when adding patterns, add a fixture to
  tests and run all three test files. Policy/legalese lines are junk-filtered.
- Every HTML response needs the per-response CSP nonce (see `htmlResponse`).
- Deploy: `wrangler deploy`; secrets via `wrangler secret put UNLOCK_CODE`.
  `PAYMENT_LINK` is a plain var in wrangler.jsonc (empty until Stripe exists).

## Verify

- After parser changes: run all three test files.
- After ui.js changes: syntax-check the inline script
  (`node --input-type=module` snippet in git history) and load `/` locally.
- `curl -sI localhost:8787` (HEAD) returns hardened 404 — CSP is on `GET /`.
