// bookingtocal — turn booking emails & PDFs into calendar events. Vanilla
// Worker, no deps. All parsing happens client-side; this Worker only serves
// the UI (with per-response CSP nonces) and verifies the freemium unlock code.

import { appPage } from "./ui.js";

// The one canonical public origin. Every request that arrives on any other
// production host is redirected here so links only ever live under one domain.
const CANONICAL_HOST = "booktocal.com";

// Hosts exempt from the canonical-host redirect: only genuine local dev
// (`wrangler dev`).
function isDevHost(hostname) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "::1"
  );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    // Force the single canonical origin. 302 (temporary), not 301: host
    // canonicalization may change and permanent redirects get cached hard.
    if (url.hostname !== CANONICAL_HOST && !isDevHost(url.hostname)) {
      const target = "https://" + CANONICAL_HOST + url.pathname + url.search;
      return new Response(null, {
        status: 302,
        headers: {
          Location: target,
          "Cache-Control": "no-store",
          ...SECURITY_HEADERS,
        },
      });
    }

    if (method === "GET" && pathname === "/") {
      const nonce = makeNonce();
      const payLink = String(env.PAYMENT_LINK || "");
      return htmlResponse(appPage(nonce, payLink), 200, nonce);
    }

    // Verify the shared unlock code against the UNLOCK_CODE secret. Enforcement
    // of the freemium gate is client-side (honest-user friction); this endpoint
    // only exists so the code stays server-side and is compared in constant time.
    if (pathname === "/api/verify-code") {
      if (method !== "POST") return methodNotAllowed("POST");
      if (await rateLimited(env.VERIFY_LIMITER, clientIp(request))) return tooManyRequests();
      return handleVerifyCode(request, env);
    }

    // Any other path falls through to static assets (vendored pdf.js under
    // /vendor/). Unknown paths still get the plain hardened 404.
    if (method === "GET" && pathname.startsWith("/vendor/")) {
      return env.ASSETS.fetch(request);
    }

    return notFound();
  },
};

async function handleVerifyCode(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ valid: false }, 400);
  }
  const code = body && typeof body.code === "string" ? body.code : "";
  if (!code || code.length > 128) return jsonResponse({ valid: false }, 400);
  if (!env.UNLOCK_CODE) return jsonResponse({ valid: false }, 500);
  const ok = await tokenMatches(normalizeCode(code), normalizeCode(env.UNLOCK_CODE));
  logEvent(env, request, ok ? "unlock" : "unlock_rejected", { ip: clientIp(request) });
  return jsonResponse({ valid: ok }, ok ? 200 : 401);
}

// --- helpers ---------------------------------------------------------------

// The real client IP as seen by Cloudflare. Always present in production; the
// fallback only applies to local dev, where the limiter is a no-op anyway.
function clientIp(request) {
  return request.headers.get("CF-Connecting-IP") || "local";
}

// Consult a Workers Rate Limiting binding. Returns true when the caller is over
// the limit. Fails OPEN (returns false) if the binding is absent or errors, so
// a limiter hiccup can never take the whole endpoint down.
async function rateLimited(limiter, key) {
  if (!limiter) return false;
  try {
    const { success } = await limiter.limit({ key });
    return !success;
  } catch {
    return false;
  }
}

function tooManyRequests() {
  return new Response(JSON.stringify({ error: "rate limited" }), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Retry-After": "60",
      ...SECURITY_HEADERS,
    },
  });
}

// Two-layer telemetry: console.log feeds Workers Logs; the EVENTS Analytics
// Engine dataset is the system of record. Best-effort — telemetry must never
// break the request path. Only page loads and unlock attempts are logged;
// booking content is never transmitted to this server at all.
function logEvent(env, request, event, fields = {}) {
  const cf = (request && request.cf) || {};
  const entry = {
    event,
    ip: fields.ip || "",
    country: cf.country || "",
  };
  try {
    console.log(JSON.stringify(entry));
  } catch {}
  try {
    if (env.EVENTS) {
      env.EVENTS.writeDataPoint({
        blobs: [entry.event, entry.ip, entry.country],
        doubles: [],
        indexes: [entry.event],
      });
    }
  } catch {}
}

// Normalize a code for comparison: uppercase and drop everything that isn't
// alphanumeric, so dashes/spaces/case in what the user types are irrelevant.
function normalizeCode(s) {
  return String(s).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// Constant-time bearer-token check that never leaks length: compare SHA-256
// digests (always 32 bytes) with the runtime's timingSafeEqual.
async function tokenMatches(provided, expected) {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(provided)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

function bytesToBase64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

// Per-response CSP nonce so the inline <script> blocks can run without
// 'unsafe-inline' in script-src.
function makeNonce() {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
}

// CSP uses a per-response nonce for scripts (no 'unsafe-inline' in script-src).
// style-src keeps 'unsafe-inline' because the UI relies on inline style="" attrs
// and runtime element.style writes. connect-src 'self' only — parsed booking
// data never leaves the page; calendar links open via user-initiated navigation.
function csp(nonce) {
  return (
    "default-src 'self'; " +
    "script-src 'self' 'nonce-" + nonce + "'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data:; " +
    "connect-src 'self'; " +
    "base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
  );
}

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

function htmlResponse(html, status = 200, nonce = "") {
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": csp(nonce),
      ...SECURITY_HEADERS,
    },
  });
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...SECURITY_HEADERS,
    },
  });
}

function methodNotAllowed(allow) {
  return new Response("Method not allowed", {
    status: 405,
    headers: {
      Allow: allow,
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      ...SECURITY_HEADERS,
    },
  });
}

// Plain-text 404 that still carries the full security-header set, so every
// response the Worker emits is consistently hardened.
function notFound() {
  return new Response("Not found", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      ...SECURITY_HEADERS,
    },
  });
}
