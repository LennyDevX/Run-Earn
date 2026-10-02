# Security & performance

Record of the pre-launch hardening pass: what was measured, what was fixed, and
what is deliberately still open. Pair this with the `airen-security-hardening`
skill for the operating conventions.

## Method

Everything below came from measuring the code, not from a checklist: `next.config`,
a `"use client"` count, a keyframe inventory by animated property, RPC read
amplification per hook, the presence of lazy loading and Suspense, response
headers via `curl -I`, and a production bundle measurement.

## Baseline (before)

| Metric | Value |
| --- | --- |
| Client components | 33 of 37 (89%) |
| `next.config.ts` | empty — no headers, no config |
| Security headers | none |
| Rate limiting | none on any route |
| `transition-all` | 61 across 21 files |
| `transition-[width]` | 12 |
| Skeletons | 0 |
| `next/dynamic` / `Suspense` | 0 / 0 |
| Client JS | 2,683 KB |
| CSS | 106.5 KB |
| `npm audit` | 29 findings, **1 critical** |

## Security

### Response headers

`next.config.ts` now serves a full header set. Everything is **enforced** except
the CSP.

| Header | Status |
| --- | --- |
| `X-Frame-Options: DENY` | enforced |
| `X-Content-Type-Options: nosniff` | enforced |
| `Referrer-Policy: strict-origin-when-cross-origin` | enforced |
| `Permissions-Policy` (camera/mic/geo/payment/usb off) | enforced |
| `Cross-Origin-Opener-Policy: same-origin-allow-popups` | enforced |
| `Strict-Transport-Security` (2y, preload) | enforced, production only |
| `Content-Security-Policy` | **enforced** |

**Everything is now enforced.** The CSP started as `-Report-Only` so the wallet
flows could be observed without risk; it is live.

**The failure mode changed with it.** An origin missing from `buildCsp()` now
breaks silently in the browser — usually a wallet that refuses to connect with
nothing in the app's error handling. The fastest recovery is to rename the header
back to `Content-Security-Policy-Report-Only`.

**`'unsafe-eval'` is development-only.** Next's dev HMR runtime needs it;
production does not. Verified against a production build:
`script-src 'self' 'unsafe-inline'`.

The policy is **derived from the environment**: `buildCsp()` reads
`NEXT_PUBLIC_POLYGON_RPC_URL` and `POLYGON_RPC_URL`, adds their origins to
`connect-src`, and dedupes (the first build showed `polygon.drpc.org` twice
because the configured RPC matched a fallback).

**To roll back:** change the header name back to
`Content-Security-Policy-Report-Only`. One line.

### Rate limiting

Redis-backed, with an in-process fallback. See the
`airen-security-hardening` skill for the full architecture.

| Route | Limit | Verified |
| --- | --- | --- |
| `/api/generate-sneaker` | 5 / 10 min | 5 pass, 6th blocked, `Retry-After: 600` |
| `/api/pol-price` | 30 / min | 30 pass, 4 blocked, `Retry-After: 56` |
| `/api/subgraph` | 30 / min | — |
| `/api/tab-session` | 10 / min | — |

**The property that matters most:** on `/api/generate-sneaker` the throttle runs
**before form parsing and before Gemini**. Verified by posting seven bodyless
requests — five returned 400 with **zero tokens spent**, the next two 429.

**`@vercel/kv` is EOL.** Migrated to `@upstash/redis` + `@upstash/ratelimit`,
both pinned to versions at least 7 days old (`1.39.0`, `2.2.0`).

### Daily spend budget

A **global** daily ceiling (`GENERATION_DAILY_BUDGET`, default 300) on top of the
per-IP limits. Per-IP throttling cannot stop a botnet spreading requests across
thousands of addresses; a shared cap can, because it does not care who is asking.

Uses Redis `INCR` (atomic) with the TTL set only on the first hit of the day.

### Dependency audit

| | Before | After |
| --- | --- | --- |
| Total findings | 29 | 27 |
| Critical | **1** | **0** |

Two rounds of fixes, both driven by upstream advisories.

**Round 1 — GHSA-vcvr-r3jv-pc5j**, a Remote Code Execution in `next/og`
ImageResponse, affecting Next 16.2.0–16.3.5. Airen does not use `next/og` (icons
are static files), so it was never reachable. Moved to **16.3.6** anyway.

**Round 2 — the September 2026 Next.js security release.** v16.3.8 patches nine
advisories (1 critical, 2 high, 5 medium, 1 low). Every one was checked against
this codebase before deciding urgency, and **none apply**:

| Advisory | Requires | Airen |
| --- | --- | --- |
| SSRF in Image Optimization (High) | `images.remotePatterns` configured | none set |
| Cache poisoning of SSG/ISR (Medium) | Pages Router + SSG/ISR | App Router |
| Cross-user cache poisoning (Medium) | root-level catch-all page | no `app/[...slug]` |
| Metadata image info disclosure (Medium) | webpack + `opengraph-image` | Turbopack, no metadata routes |
| `use cache` key leak (Medium) | Cache Components enabled | not enabled |
| Draft Mode cache leak (Medium) | Cache Components + Draft Mode | neither |
| Dev server MCP (Low) | `next dev` only | dev-only, not shipped |

Moved to **16.3.8** regardless — it is a pure patch with no API change, and the
2-day age is an acceptable exception to the 7-day rule for a security release.

Also in round 2: **`react` / `react-dom` 19.2.8 -> 19.3.0** (23 days old),
`@types/react` / `@types/react-dom` -> 19.3.0, and `eslint-config-next` -> 16.3.8
to match the framework.

**React 19.3's one breaking change was checked:** `useId` now emits `_` instead
of `:` in generated IDs. `MoreSheet` is the only `useId` consumer and uses the
values purely as `aria-labelledby` / `aria-describedby` / `id` attributes — string
equality, never a CSS selector — so it is unaffected.

After both rounds: **24 findings, 0 critical**, down from 29 with 1 critical.
`next`, `react`, `react-dom`, and `sharp` are all clean. The five remaining
`high` entries (`adm-zip`, `brace-expansion`, `js-yaml`, `serialize-javascript`,
`undici`) come from the Hardhat/Mocha toolchain and Next's own tree — none ship
to the browser.

## Performance

### Progress bars → compositor

All 12 `transition-[width]` bars animated `width`, which triggers **layout and
paint on every frame**. Converted to `transform: scaleX()` with `origin-left`,
which runs entirely on the compositor:

```
width: `${pct}%`  →  w-full origin-left + transform: scaleX(pct / 100)
```

The `Math.max(3, x)` guard that kept a bar from vanishing was preserved as
`Math.max(0.03, x / 100)`.

### `transition-all` → explicit properties

61 instances across 21 files, classified by what they actually change:

| Cases | Needed | Result |
| --- | --- | --- |
| 17 | color + transform | `transition-[transform,color,background-color,border-color,fill,stroke]` |
| 11 | color + shadow | `transition-[box-shadow,color,…]` |
| 9 | transform | `transition-transform` |
| 8 | translate + shadow | `transition-[transform,box-shadow]` |
| 4 | shadow + transform | `transition-[transform,box-shadow]` |
| 2 | opacity + transform | `transition-[transform,opacity]` |
| 2 | mixed | bespoke |

**53 automated + 8 manual = 0 remaining.**

The 8 manual cases were the interesting ones:

- **4 were progress bars** → converted to `scaleX`.
- **3 changed classes conditionally** (not on hover) →
  `transition-[background-color,border-color,opacity]`.
- **1 in `defi`** used **static** widths (`w-1/4`, `w-2/5`, …) that never change.
  The `transition-all` there did nothing at all — removed rather than "fixed".

**Trap for anyone re-running this:** `hover:-translate-y-2` makes a naive regex
capture `-translate-y-` as the property name, which fails to match `transform`.
Strip the leading hyphen before classifying.

### Skeletons

`src/components/Skeleton.tsx` provides `Skeleton`, `SkeletonText`,
`SkeletonCircle`, `SkeletonArtworkCard`, `SkeletonCardGrid`, and `SkeletonRows`,
plus a `.skeleton` class in `globals.css`.

**The shimmer animates `transform: translateX()` only** — compositor-only, which
is the whole point of replacing the spinners. Under `prefers-reduced-motion` it
holds a static tint.

**The design rule:** a skeleton must have the **shape of the real content** so it
reserves the space. The old `"Loading your collection…"` collapsed to one line
and then jumped to a card grid — a layout shift on every load.

Wired into `PlayerGameProfile` (card grid + rows), `ModItemGallery` (4-card grid),
and `TabArena` (the same two-column arena shape).

### Code splitting — finding

Next.js App Router **already splits per route** (37 chunks for 13 routes). The
heavy components (`StakingVaultDashboard` 833 lines, `RoadmapTimeline` 544)
already live in their own route's chunk.

**No additional splitting was added.** The remaining win would be for
below-the-fold content, and in this app nearly everything is interactive and
above the fold. Forcing `next/dynamic` would add a load waterfall for no clear
gain.

The wallet SDKs were already correctly lazy — `OKX` (582 KB) and `MetaMask`
(322 KB) sit in their own chunks and only load when a user picks one.

### Animation inventory

Of 22 keyframes, only **2** touch a non-compositor property (`rail-flow` and
`holo-drift`, both `background-position`). They are intentional and paint-only.
The `opacity` (37) + `transform` (31) vs layout (2) ratio is healthy.

## Navigation bug fixed

**Symptom:** navigating to `/mint` scrolled the page down slightly. The only
route where it happened.

**Root cause:** `centerInScrollRow` used `scrollIntoView`, which walks **every**
scrollable ancestor including the document. Even with `block: "nearest"` it
scrolls the page when the target sits below the fold. `/mint` was the only route
calling it **on mount** — the wizard's `[step]` effect runs with `step=0` — and
its taller two-column hero pushed the step row off screen.

**Fix (root cause, not symptom):** scroll the `.scroll-x` row directly instead of
using `scrollIntoView`. It can now only ever move the row horizontally, so no
caller can move the page by accident. Plus the studio skips the mount run.

The two remaining `scrollIntoView` calls (`RoadmapTimeline` phase jump,
`WorkshopDashboard` loadout jump) are **intentional** user-initiated page scrolls.

## Second pass — data layer and the mint route

Three follow-ups from the measurement pass.

### `/mint` payload: 675 -> ~560 KiB

Every showcase frame is absolutely positioned over the same square, so **all
eight sat inside the viewport at once** and `loading="lazy"` deferred nothing.
They all downloaded on first paint.

`MintShowcase` now mounts only three frames — previous, active, next. Three and
not two because the outgoing frame has to stay mounted for the duration of the
fade; unmounting it degrades the crossfade to a fade-in from the backdrop.

### `multicall` in `useOwnedSneakers`

The hook read `traitsOf`, `tokenURI`, and `kindOf` per token, each its own round
trip. A 20-sneaker wallet meant ~60 requests for one page view.

All three fields for every token now go through a single `multicall`. Token
enumeration moved to `multicall` too. `allowFailure: true` keeps one unreadable
token — a reverting `tokenURI`, a pre-split deployment with no `kindOf` — from
sinking the batch.

### Shared ownership context

`useOwnedSneakers` was instantiated by **eight** surfaces: `useWorkshop`,
`useRunnerRoster`, `useSneakerGame`, `useStakingVault`, `useMarketplace`,
`PlayerGameProfile`, `ProfileDashboard`. A page mounting three of them read the
same wallet three times over.

`SneakerOwnershipProvider` (mounted inside the wallet context) holds one instance
and exposes `sneakers`, `playable`, `collectibles`, `isLoading`, `error`,
`refresh`.

**The derived split matters beyond performance:** every gameplay surface must
exclude AI collectibles. Deriving `playable` once means a consumer cannot forget
the filter and offer a collectible as a runner.

`useSneakerOwnership` **throws** outside the provider rather than returning an
empty list — a missing provider would otherwise look like "this wallet owns
nothing", which is a miserable bug to chase.

### `/api/pol-price` browser cache

The upstream Uniswap call was already cached server-side for
`POL_PRICE_CACHE_SECONDS`. What was missing was the *browser* cache: `no-store`
made every mount re-fetch the route even though the answer was in memory. Now
`public, max-age=60, stale-while-revalidate=300`, with `refresh=1` bypassing both
layers.

**A config bug surfaced here.** The `/api/(.*)` rule in `next.config.ts` set
`Cache-Control: no-store` for every API route, which **silently overrode** the
handler's own header — the route's cache directive never reached the client. The
blanket rule is gone; each route now declares its own policy, and the routes that
depend on `no-store` (`generate-sneaker`, `subgraph`) set it explicitly.

## After

| Metric | Before | After |
| --- | --- | --- |
| Security headers | 0 | **7, all enforced** |
| Rate limiting | per-instance only | **Redis, shared** |
| `transition-all` | 61 | **0** |
| `transition-[width]` | 12 | **0** |
| Skeletons | 0 | **4 surfaces** |
| Critical vulnerabilities | 1 | **0** |
| `useOwnedSneakers` instances | 8 | **1** |
| RPC reads per 20-NFT wallet | ~60 | **~2** |
| `/mint` payload | 675 KiB | **~560 KiB** |
| Client JS | 2,683 KB | 2,662 KB |
| CSS | 106.5 KB | 110.5 KB |
| `npm audit` findings | 29 (1 critical) | **24 (0 critical)** |

CSS grew ~3 KB from the explicit transition properties and the skeleton class.
JS is flat — this pass was about **fluidity and safety, not bundle size**.

## Deliberately still open

1. **The CSP is enforced, so it is now a live failure surface.** Any new external
   origin must be added to `buildCsp()` before it is used.
2. **Redis outage degrades the limiter** to per-instance, and the daily budget
   with it. The in-memory fallback still throttles within an instance.
3. **27 transitive audit findings** from the wallet SDKs and Hardhat. Re-check on
   each bump of those packages.
4. **No `will-change` or `content-visibility`** anywhere. Worth revisiting if
   profiling shows a specific animation or long list is the bottleneck — adding
   them speculatively costs memory.
5. **Five `high` audit entries remain** — `adm-zip`, `brace-expansion`,
   `js-yaml`, `serialize-javascript` (via mocha) and `undici`. All are tooling or
   Next's server tree, none reach the browser. Re-check on each Next bump.

6. **TypeScript 7 is blocked.** 7.0 ships **no programmatic compiler API**, and
   `typescript-eslint` peer-deps `typescript <6.1.0` and hard-crashes at module
   load (`Cannot read properties of undefined (reading 'Cjs')`). The support
   issue is closed as *not planned*; the API lands in 7.1. A transition setup
   exists (TS 7 aliased for `tsc`, TS 6 under the `typescript` name for tools)
   but costs a second compiler for a ~18 s typecheck. Wait for 7.1.

   The `tsconfig.json` is already 7-ready: it sets `strict`, `module`, `target`,
   and `types` explicitly — exactly the options whose defaults change.

## Verification commands

```bash
npm run build                     # must stay green; also the bundle measurement
npm run lint && npm run typecheck
npx hardhat test                  # 482 tests

# Headers, after `npm run start`
curl -sI http://127.0.0.1:3000/ | grep -iE "x-frame|content-security|referrer|permissions"

# Rate limit, expect 429 with Retry-After
for i in $(seq 1 34); do curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/pol-price; done
```
