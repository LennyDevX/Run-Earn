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

## Paid endpoints (x402)

`/api/generate-sneaker` can charge the caller in USDC through x402. The wiring
lives in `src/lib/x402.ts` and is **off unless `X402_PAY_TO` is set**.

- **Payment is never the only gate.** The rate limit and the daily budget still
  run inside the handler. Payment raises the cost of abuse; it does not replace
  the throttle, because a stolen wallet would otherwise buy unlimited
  generations.
- **Settlement follows success.** The wrapper settles only when the handler
  returns a status below 400, so a rejected photo (400), a spent budget (429) or
  a model failure (502) never charges the caller.
- **Pass the asset explicitly.** `price` is `{ asset, amount }`, not a `"$0.75"`
  money string: the scheme's built-in asset table does not cover Amoy and throws
  `No default asset configured for network eip155:80002`. An unknown network
  therefore has no asset, and x402 stays disabled rather than guessing an
  address for a payment.
- **The route path in the config must equal the served path exactly**, or the
  handler runs unprotected and the SDK only logs a warning.
  `X402_ROUTE_PATH` is the single source for both sides.
- **The middleware does not consume the request body.** `NextAdapter.getBody()`
  is defined but never called, and it clones the request first — the multipart
  photo still reaches `request.formData()`.
- **The settlement asset needs its EIP-712 domain.** The client ships the domain
  for the SDK's default assets and cannot know it for anything else; without it
  the payer cannot build a payload at all. `ASSET_DOMAINS` in `src/lib/x402.ts`
  carries the verified entry for native USDC (`name = "USD Coin"`,
  `version = "2"` — hashing that domain reproduces the token's own
  `DOMAIN_SEPARATOR()`). Any other asset needs `X402_ASSET_NAME` /
  `X402_ASSET_VERSION`, verified the same way.

### Paying with USDC.e does not work

**The bridged USDC.e (`0x2791Bca1…4174`) cannot settle an x402 payment.** It
reports `name() = "USD Coin (PoS)"` but exposes no `version()`, and none of 30
plausible name/version combinations hash to its `DOMAIN_SEPARATOR()`. The client
rejects it first on `spendControls` ("only default assets or entries in
spendControls.allowedAssets"), and once that is disabled the facilitator answers
`unexpected_error`.

Use native USDC (`0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359`). To confirm a
token is usable, don't trust `name()` — hash the candidate domain and compare it
to the contract's `DOMAIN_SEPARATOR()`:

```js
keccak256(abi.encode(TYPE_HASH, keccak256(name), keccak256(version), chainId, token))
```

`scripts/x402-smoke-test.mjs` runs the whole paid flow end to end against a
running server.

### Verifying a token supports EIP-3009

Both Polygon USDC contracts are upgradeable proxies, so the explorer returns the
*proxy* ABI and a `name`/`transferWithAuthorization` lookup proves nothing. Probe
the function through the proxy instead and compare against a selector that
certainly does not exist (`0xdeadbeef`): if `authorizationState(address,bytes32)`
returns data while the control reverts, the implementation has it.

**Note: this test shows USDC.e *does* implement EIP-3009.** The blocker is the
domain, not the standard — an easy wrong conclusion to reach from the ABI alone.

## Cross-chain funding (Trails)

`TrailsFundButton` mounts the `0xtrails` widget on `/collection` and `/staking`.
Two rules, both load-bearing:

- **It renders nothing unless `NEXT_PUBLIC_TRAILS_API_KEY` is set.** An
  unconfigured widget must not change the page at all.
- **The SDK is fetched on click, never on mount.** It is ~2.3 MB across three
  chunks. Verify with the production build that `/collection` and `/staking`
  do not reference them in the initial HTML — `next/dynamic` alone is not
  enough if the component renders the widget eagerly.

The key is intentionally browser-visible: the widget is a client component.

## Gas sponsorship (thirdweb)

The in-app wallet runs with `sponsorGas: true`. **On its own that sponsors every
transaction from every in-app wallet** — the in-app wallet is created by anyone
with an email address, so an unconstrained paymaster is an unbounded,
unauthenticated gas budget.

`/api/verify-sponsorship` is the control. thirdweb calls it before sponsoring and
reads `{ isAllowed }` from the body.

- **HTTP 200 either way.** A non-200 is read as a verifier outage, not a decision.
- **Fail closed.** No configured contract addresses means every request is
  refused. An unconfigured deployment must never sponsor for the whole network.
- **Read both target shapes.** A single call arrives under `userOp.targets`, a
  batched one under `userOp.data.targets`. Checking only one silently stops
  sponsoring either the single-call or the batched path.
- **A mixed batch is refused whole.** Sponsoring it would pay for the foreign call
  too.
- **`Referer: https://api.thirdweb.com` is not authentication.** It is a
  client-supplied header. The route is safe public because it holds no secret and
  changes no state.
- **Do not rate limit it by IP.** thirdweb calls it per user transaction from its
  own addresses, so an IP limit throttles every user at once. It costs nothing and
  proxies nothing, so the usual "limit before paid work" rule does not apply.
- **No sender or calldata in the logs.** This runs per user transaction and the
  wallet address is personal data.

The full policy, dashboard steps, and verification method are in
`docs/thirdweb-gas-sponsorship.md`.

## Known gaps

- **39 `npm audit` findings remain, none critical; 14 are `high`.** Five are the
  pre-existing tooling findings (`adm-zip`, `brace-expansion`, `js-yaml`,
  `serialize-javascript`, `undici`) that never reach the browser. The rest
  arrived with `0xtrails`, which is itself flagged `high` through
  `@meshconnect/web-link-sdk` → `@meshconnect/node-api` → `axios` (prototype
  pollution in the fetch adapter that "can alter outbound requests"). The widget
  is client-side and click-gated, so the code only runs when a visitor opens the
  funding flow — but this is the dependency to re-check on every bump, and the
  first candidate to drop if the exchange-connection feature is not needed.
- **TypeScript 7 cannot be adopted yet.** 7.0 ships no programmatic compiler API
  and `typescript-eslint` hard-crashes on it. Blocked until 7.1. The
  `tsconfig.json` is already 7-ready if you want to verify with
  `npx -y @typescript/native-preview`.
- **x402's paid path has never been exercised end to end.** The 402 challenge
  and the free path are both verified against a production build, but no real
  payer has settled a generation. Test with a funded Amoy wallet before
  enabling it on mainnet.

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

Current state: `next` 16.3.8, `react` / `react-dom` 19.3.0, 39 audit findings,
0 critical.
