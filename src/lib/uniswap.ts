import { isAddress } from "viem";

/// Server-only Uniswap Trading API client for the POL/USD reference price.
///
/// The Trading API does not support browser CORS preflight, so this module is
/// only ever imported by the `/api/pol-price` route handler — never by client
/// components. The API key stays on the server.
///
/// Price discovery works by quoting a fixed EXACT_INPUT amount of WPOL into
/// USDC and deriving USD-per-POL from the quote output. We pin `protocols` to
/// V2/V3 so the response is always a CLASSIC route with `quote.output.amount`
/// (UniswapX routes use a different response shape and have per-chain minimum
/// quote sizes that a small read-only probe would trip).

const TRADING_API_URL =
  process.env.UNISWAP_TRADING_API_URL ?? "https://trade-api.gateway.uniswap.org/v1";

const POLYGON_CHAIN_ID = "137";

/// Wrapped POL on Polygon.
const WPOL_ADDRESS = "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270";
/// Native USDC on Polygon (6 decimals).
const USDC_ADDRESS = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";

const USDC_DECIMALS = 6n;
/// Probe size for the quote: 1,000 POL. Large enough for a stable mid-price,
/// small enough that price impact on the WPOL/USDC pool is negligible.
const PROBE_AMOUNT_POL = 1_000n;

/// Agent attribution header required by the Uniswap Trading API.
/// This integration only reads prices; a human reviews the result and decides
/// whether to buy, so the decision origin is human-mediated.
const AGENT_INFO = JSON.stringify({
  integration_name: "swap-integration",
  decision_origin: "human_mediated",
  version: "1.5.0",
});

export type PolPriceResult = {
  usd: number;
  source: "uniswap" | "fallback";
  updatedAt: string;
  note?: string;
};

type CacheEntry = { result: PolPriceResult; expiresAt: number };

const CACHE_MS = Number(process.env.POL_PRICE_CACHE_SECONDS ?? 300) * 1000;
let cache: CacheEntry | null = null;

function fallbackPrice(note: string): PolPriceResult {
  const raw = process.env.POL_USD_PRICE ?? "0.09764";
  const usd = Number(raw);
  return {
    usd: Number.isFinite(usd) && usd > 0 ? usd : 0.09764,
    source: "fallback",
    updatedAt: new Date().toISOString(),
    note,
  };
}

/// The `swapper` field is required by the API but a read-only quote does not
/// spend anything. Prefer an explicit address; otherwise reuse the store
/// treasury / deploy admin if configured.
function quoteSwapper(): string {
  const candidates = [
    process.env.UNISWAP_QUOTE_SWAPPER,
    process.env.VE_STORE_TREASURY_ADDRESS,
    process.env.DEPLOY_ADMIN_ADDRESS,
    process.env.STAKING_ADMIN_ADDRESS,
  ];
  for (const candidate of candidates) {
    if (candidate && isAddress(candidate)) return candidate;
  }
  return "0x0000000000000000000000000000000000000000";
}

type ClassicQuote = {
  routing?: string;
  quote?: {
    output?: { amount?: string };
    orderInfo?: { outputs?: { startAmount?: string }[] };
  };
  detail?: string;
  errorCode?: string;
};

/// Extracts the output amount regardless of routing shape.
function quoteOutputAmount(payload: ClassicQuote): bigint | null {
  const classic = payload.quote?.output?.amount;
  if (typeof classic === "string" && classic.length > 0) return BigInt(classic);
  const uniswapX = payload.quote?.orderInfo?.outputs?.[0]?.startAmount;
  if (typeof uniswapX === "string" && uniswapX.length > 0) return BigInt(uniswapX);
  return null;
}

async function fetchFromUniswap(): Promise<PolPriceResult> {
  const apiKey = process.env.UNISWAP_API_KEY;
  if (!apiKey) return fallbackPrice("UNISWAP_API_KEY is not configured.");

  const response = await fetch(`${TRADING_API_URL}/quote`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "x-api-key": apiKey,
      "x-universal-router-version": "2.0",
      "x-agent-info": AGENT_INFO,
    },
    body: JSON.stringify({
      swapper: quoteSwapper(),
      tokenIn: WPOL_ADDRESS,
      tokenOut: USDC_ADDRESS,
      tokenInChainId: POLYGON_CHAIN_ID,
      tokenOutChainId: POLYGON_CHAIN_ID,
      amount: (PROBE_AMOUNT_POL * 10n ** 18n).toString(),
      type: "EXACT_INPUT",
      slippageTolerance: 0.5,
      protocols: ["V2", "V3"],
    }),
    cache: "no-store",
  });

  const payload = (await response.json()) as ClassicQuote;
  if (!response.ok) {
    return fallbackPrice(payload.detail ?? `Uniswap quote failed (${response.status}).`);
  }

  const usdcOut = quoteOutputAmount(payload);
  if (usdcOut === null || usdcOut === 0n) {
    return fallbackPrice("Uniswap quote did not include an output amount.");
  }

  // USD per POL, keeping 6-decimal USDC precision until the final conversion.
  const usdcPerPolScaled = (usdcOut * 10n ** 18n) / (PROBE_AMOUNT_POL * 10n ** 18n);
  const usd = Number(usdcPerPolScaled) / Number(10n ** USDC_DECIMALS);
  if (!Number.isFinite(usd) || usd <= 0) {
    return fallbackPrice("Uniswap quote produced an invalid price.");
  }

  return { usd, source: "uniswap", updatedAt: new Date().toISOString() };
}

/// Returns the POL/USD price, cached for `POL_PRICE_CACHE_SECONDS`.
/// Never throws: falls back to `POL_USD_PRICE` on any failure.
export async function getPolUsdPrice(force = false): Promise<PolPriceResult> {
  if (!force && cache && cache.expiresAt > Date.now()) return cache.result;

  let result: PolPriceResult;
  try {
    result = await fetchFromUniswap();
  } catch (cause) {
    result = fallbackPrice(cause instanceof Error ? cause.message : "Uniswap request failed.");
  }

  // Only cache successful reads; a fallback should retry on the next request.
  if (result.source === "uniswap") {
    cache = { result, expiresAt: Date.now() + CACHE_MS };
  }
  return result;
}

export const POL_PRICE_TOKENS = {
  chainId: POLYGON_CHAIN_ID,
  wpol: WPOL_ADDRESS,
  usdc: USDC_ADDRESS,
} as const;
