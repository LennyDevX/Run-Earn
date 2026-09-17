# POL/USD price feed (Uniswap Trading API)

The veSneaker storefront shows a live USD hint next to every POL price. That hint comes
from the **Uniswap Trading API**, proxied through our own server so the API key never
reaches the browser.

## Why a proxy

The Uniswap Trading API does **not** support browser CORS preflight — `OPTIONS` returns
`415 Unsupported Media Type`, so a direct `fetch()` from the browser always fails. It also
requires an `x-api-key`, and Uniswap's own guidance is explicit: store the key server-side
and proxy calls through your backend. Our proxy is `/api/pol-price`.

## Flow

```
Browser (usePolPrice)
   │  GET /api/pol-price
   ▼
Next.js route handler (server-only)
   │  POST https://trade-api.gateway.uniswap.org/v1/quote
   ▼
Uniswap Trading API  ──►  WPOL → USDC quote
   │
   ▼
price = USDC out / POL in  →  { usd, source, updatedAt }
```

## How the price is derived

`src/lib/uniswap.ts` requests an `EXACT_INPUT` quote of **1,000 WPOL → USDC** on Polygon
(chain `137`) and divides the output by the input:

- `tokenIn` — WPOL `0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270` (18 decimals)
- `tokenOut` — native USDC `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359` (6 decimals)
- `protocols: ["V2", "V3"]` — pins CLASSIC routing so the response always carries
  `quote.output.amount`. UniswapX routes use a different shape
  (`quote.orderInfo.outputs[0].startAmount`) and enforce per-chain minimum quote sizes
  that a small read-only probe would trip. The extractor handles both shapes anyway.

The probe size is deliberately small (≈ $97 at POL $0.09764) so price impact on the
WPOL/USDC pool is negligible, and large enough for a stable mid-price.

## Request headers

Every Trading API request carries:

```
Content-Type: application/json
Accept: application/json
x-api-key: <UNISWAP_API_KEY>
x-universal-router-version: 2.0
x-agent-info: {"integration_name":"swap-integration","decision_origin":"human_mediated","version":"1.5.0"}
```

`x-agent-info` is Uniswap's agent-attribution header. `decision_origin` is
`human_mediated` because this integration only reads a price — a human reviews the result
and decides whether to buy; nothing executes autonomously.

## Caching and failure handling

- Successful reads are cached in memory for `POL_PRICE_CACHE_SECONDS` (default 300s).
  The Trading API rate-limits around 10 req/s, so the cache is what keeps the page cheap.
- **Failures are never cached.** Any error (missing key, 4xx/5xx, no output amount,
  invalid price) returns the configured `POL_USD_PRICE` with `source: "fallback"`, so the
  page keeps working and retries on the next request.
- The UI shows a `(fallback)` marker whenever the live price is unavailable.

## Configuration

| Variable | Purpose |
| --- | --- |
| `UNISWAP_API_KEY` | Server-only Trading API key ([developers.uniswap.org](https://developers.uniswap.org/)) |
| `UNISWAP_TRADING_API_URL` | Override the base URL (default `https://trade-api.gateway.uniswap.org/v1`) |
| `UNISWAP_QUOTE_SWAPPER` | Read-only quote `swapper`; falls back to the store treasury, then the deploy admin |
| `POL_PRICE_CACHE_SECONDS` | Cache TTL for the display feed (default 300) |
| `POL_USD_PRICE` | Fallback display price and the pinned conversion basis |
| `VE_USE_LIVE_POL_PRICE` | `true` (default) → `mint-veSneakers.ts` converts USD targets with the live quote; `false` → pin `POL_USD_PRICE` |

## Consumer

`src/hooks/usePolPrice.ts` fetches the route and exposes `{ price, isLoading, error, refresh }`.
`VeSneakerStorefront` multiplies each on-chain POL price by `price.usd` for the `≈ $`
hint, and the header chip shows the live rate (click to force a refresh).

## Pricing implications

Store prices are stored **in POL on-chain**. The Uniswap feed does **not** re-price the
contracts — it keeps the displayed USD value honest. Two moments stay in sync with the
market:

1. **Configuration time.** `scripts/mint-veSneakers.ts` fetches the live POL/USD rate and
   converts the USD targets ($40 → $150) into POL before calling `addDesign`, logging the
   rate it used. Pin it with `VE_USE_LIVE_POL_PRICE=false` for reproducible prices.
2. **Display time.** The storefront multiplies each on-chain POL price by the live rate
   from `/api/pol-price` for the `≈ $` hint.

If POL moves materially and you want the *on-chain* prices to track the USD targets again,
re-run `scripts/mint-veSneakers.ts` (or call `updateDesign` with the new POL values).

## Verification

```bash
# With UNISWAP_API_KEY set:
curl "http://localhost:3000/api/pol-price"
# {"usd":0.09764,"source":"uniswap","updatedAt":"..."}

# Without a key (graceful fallback):
curl "http://localhost:3000/api/pol-price"
# {"usd":0.09764,"source":"fallback","note":"UNISWAP_API_KEY is not configured.",...}
```

Also confirm the key never appears in the client bundle: `grep -r "$UNISWAP_API_KEY" .next/`
should return nothing.

## Related skills

The repo has Uniswap's official agent skills installed under `.agents/skills/`:

- `swap-integration` — full Trading API / Universal Router reference (quote, swap, Permit2, UniswapX, routing types, error codes).
- `viem-integration` — EVM/viem patterns.

They are loaded automatically when a task mentions Uniswap, swaps, or viem. If we later add
real swaps (e.g. "pay with any token" for minting), follow `swap-integration`'s 3-step
flow: `/check_approval` → `/quote` → `/swap`, and never broadcast `swap.data` without
validating it is non-empty hex.
