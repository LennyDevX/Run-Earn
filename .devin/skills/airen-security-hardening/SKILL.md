---
name: airen-security-hardening
description: Harden Airen's web surface — security headers and the report-only CSP workflow, the Redis-backed rate limiter and its in-memory fallback, the daily AI spend budget, and the header/route conventions new endpoints must follow. Use when touching next.config.ts, src/lib/rate-limit.ts, any src/app/api/* route, or when adding a new endpoint that costs money or needs a rate limit.
---

# Airen Security Hardening

Use this skill for anything protecting the **web** surface: response headers,
Content Security Policy, rate limiting, spend budgets, and the conventions a new
API route has to follow. Contract-level security lives in the `polygon-security`
skill — this one is the browser and edge layer.

## Architecture at a glance

```
next.config.ts          → response headers for every route + a stricter set for /api
src/lib/rate-limit.ts   → rateLimit() + consumeDailyBudget(), Redis or in-memory
src/app/api/*/route.ts  → call the limiter before doing any paid or expensive work
```

## Response headers (`next.config.ts`)

Everything is served from a single `headers()` rule, with a second stricter rule
for `/api/*`.

### Enforced now

| Header | Value | Why |
| --- | --- | --- |
| `X-Frame-Options` | `DENY` | Nothing legitimately embeds Airen, so there is no migration risk. |
| `X-Content-Type-Options` | `nosniff` | Stops MIME confusion on user-uploaded artwork. |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Keeps wallet addresses out of referrers. |
| `Permissions-Policy` | camera/mic/geo/payment/usb off | The app needs none of them. |
| `Cross-Origin-Opener-Policy` | `same-origin-allow-popups` | Wallet popups must keep an opener handle. Do **not** tighten this to `same-origin`. |
| `Strict-Transport-Security` | 2 years + preload | Production only — HSTS on localhost pins a dev origin. |
| `poweredByHeader` | `false` | Drops the `X-Powered-By: Next.js` fingerprint. |

### CSP is ENFORCED

`Content-Security-Policy` ships live and blocks violations.

It started as `-Report-Only` so the wallet flows could be observed safely. It is
now enforcing, which changes the failure mode: **an origin missing from
`buildCsp()` breaks silently in the browser** — usually a wallet that refuses to
connect with nothing in the app's own error handling.

**Fastest recovery:** rename the header back to
`Content-Security-Policy-Report-Only`. That restores the previous behaviour
without a revert while you find the missing origin.

**`'unsafe-eval'` is development-only.** The dev server's HMR runtime evaluates
code at runtime; production does not need it. Keeping it out of the shipped
policy is the single most valuable thing here — verify with
`curl -sI http://127.0.0.1:3000/ | grep -i script-src` against a production build.

**The policy is built from the environment, not hardcoded.** `buildCsp()` reads
`NEXT_PUBLIC_POLYGON_RPC_URL` and `POLYGON_RPC_URL` and adds their origins to
`connect-src`, so switching RPC providers does not silently break the app. The
list is deduped — the configured RPC is often the same origin as a fallback.

Directives worth knowing:

- `script-src 'self' 'unsafe-inline'` — Next injects inline bootstrap/flight
  scripts. Removing `'unsafe-inline'` needs a nonce, which needs middleware.
  `'unsafe-eval'` is appended **only when `NODE_ENV=development`**.
- `img-src 'self' data: blob:` — AI artwork arrives as `data:` URLs and uploaded
  photos as `blob:`.
- `connect-src` — RPC fallbacks (see `Providers.tsx`), wallet relay/origins, and
  the Uniswap gateway.
- `frame-ancestors 'none'` — the CSP-level twin of `X-Frame-Options`.
- `upgrade-insecure-requests` — no plaintext subresources.

**When adding a new external origin** (a provider, an RPC, an indexer), add it to
`WALLET_ORIGINS`, `RPC_ORIGINS`, or the `connect` list in `buildCsp()`. Because
the policy is enforced, a missing origin **breaks at runtime** — and the symptom
is usually a wallet that silently refuses to connect.

## Rate limiting (`src/lib/rate-limit.ts`)

Two backends behind one async interface:

| Backend | When | Guarantee |
| --- | --- | --- |
| **Redis** (`@upstash/ratelimit`) | Credentials present | Window shared across every serverless instance |
| **In-process memory** | No Redis, or Redis errored | Per-instance only — local dev and a last-resort layer |

`Redis.fromEnv()` reads `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`
**and** the Vercel KV integration's `KV_REST_API_URL` / `KV_REST_API_TOKEN`, so
either integration works with no code change.

**`@vercel/kv` is EOL.** Do not reintroduce it — `@upstash/redis` is the
supported client and is what `@vercel/kv` wrapped.

### Why a sliding window

A fixed window lets a caller burst 2× the limit across a boundary: all of window
A's budget at the end, then all of window B's at the start. Upstash's
`slidingWindow` removes that hole and does the bookkeeping in one atomic Lua
call, so concurrent requests cannot both slip through.

### Failure policy: fail open

If Redis is unreachable the limiter **logs and falls back to the in-process
window** rather than blocking every user because a dependency is down. That is
right for a throttle, but be explicit about the consequence: a Redis outage
degrades the limit to per-instance. `consumeDailyBudget` is the backstop for the
endpoints that cost money.

### Current limits

| Route | Limit | Rationale |
| --- | --- | --- |
| `/api/generate-sneaker` | 5 / 10 min | Two paid Gemini passes per call |
| `/api/subgraph` | 30 / min | Proxies a paid Graph query |
| `/api/tab-session` | 10 / min | Public signing endpoint |
| `/api/pol-price` | 30 / min | Outbound Uniswap call |

## Daily spend budget

`consumeDailyBudget(name, limit)` is a **global** ceiling, independent of per-IP
limits. Per-IP throttling cannot stop a botnet spreading requests across
thousands of addresses; a shared daily cap can, because it does not care who is
asking.

It uses Redis `INCR`, which is atomic — two instances cannot both read the same
count and each decide they are under budget. The TTL is set **only on the first
hit of the day**; a second `expire` would keep extending it and the key would
never roll over.

`GENERATION_DAILY_BUDGET` defaults to 300.

## Conventions for a new API route

1. **Call the limiter before any paid or expensive work.** On
   `/api/generate-sneaker` the throttle runs before form parsing and before
   Gemini — verified by posting seven bodyless requests: five returned 400 (bad
   form) with zero tokens spent, the next two returned 429.
2. **Use `clientKey(request, scope)`** for the key. `x-forwarded-for` is
   client-controllable unless a proxy rewrites it, so it is a throttle key,
   **never** an authorization decision.
3. **Return `tooManyRequests(result, message)`** so the response carries a real
   `Retry-After`.
4. **Validate input before use** — `isAddress` for addresses, explicit type
   checks for numbers, size caps for uploads.
5. **Declare your own `Cache-Control`.** There is deliberately no blanket rule
   for `/api/*` in `next.config.ts`: a global `no-store` there silently overrides
   whatever a handler sets, which made it impossible for `/api/pol-price` to
   cache. Use `no-store` for anything user-specific or paid (generations,
   per-wallet activity); use a short public cache for shared, slow-moving data.
6. **Never read a secret outside a route.** `GEMINI_API_KEY`,
   `ARENA_SIGNER_PRIVATE_KEY`, `UNISWAP_API_KEY`, and the Graph query key are
   server-only. Only addresses and network config belong in `NEXT_PUBLIC_*`.

## Known gaps

- **24 `npm audit` findings remain, none critical.** Five are `high`:
  `adm-zip`, `brace-expansion`, `js-yaml`, `serialize-javascript` (all Hardhat /
  Mocha tooling) and `undici` (Next's server tree). None reach the browser.
- **TypeScript 7 cannot be adopted yet.** 7.0 ships no programmatic compiler API
  and `typescript-eslint` hard-crashes on it. Blocked until 7.1. The
  `tsconfig.json` is already 7-ready if you want to verify with
  `npx -y @typescript/native-preview`.

## Next.js advisories

Two rounds cleared `next`:

- **GHSA-vcvr-r3jv-pc5j** (RCE in `next/og`, 16.2.0–16.3.5) — not reachable, Airen
  has no `next/og` and no `opengraph-image`.
- **The September 2026 security release** (nine advisories in 16.3.8) — none
  apply. No `images.remotePatterns`, App Router not Pages, no root catch-all, no
  metadata image routes, no Cache Components.

**Rule:** when `npm audit` flags `next`, check **both** the advisory range and
whether the vulnerable surface is actually used. Most Next advisories are
conditional on a feature you may not use — that is the difference between a
same-day patch and a scheduled bump.

**Then upgrade to the newest release at least 7 days old — except security
releases.** v16.3.8 was 2 days old when adopted; a patch with no API change is
worth the freshness risk.

Current state: `next` 16.3.8, `react` / `react-dom` 19.3.0, 24 audit findings,
0 critical.
