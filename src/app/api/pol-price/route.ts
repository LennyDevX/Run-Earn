import { NextRequest, NextResponse } from "next/server";
import { getPolUsdPrice } from "@/lib/uniswap";
import { clientKey, rateLimit, tooManyRequests } from "@/lib/rate-limit";

/// Price polling is cheap for the user but still an outbound Uniswap call.
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60 * 1000;

export const runtime = "nodejs";

/// POL/USD reference price for the veSneaker storefront.
///
/// The Uniswap Trading API key never leaves the server; the browser only talks
/// to this route. Falls back to `POL_USD_PRICE` when Uniswap is unavailable.
export async function GET(request: NextRequest) {
  const limited = await rateLimit(clientKey(request, "pol-price"), RATE_LIMIT, RATE_WINDOW_MS);
  if (!limited.ok) {
    return tooManyRequests(limited, "Too many price requests. Slow down.");
  }

  const force = request.nextUrl.searchParams.get("refresh") === "1";
  const price = await getPolUsdPrice(force);

  // The upstream Uniswap call is already cached server-side for
  // `POL_PRICE_CACHE_SECONDS`. What was missing is the *browser* cache: with
  // `no-store` every mount re-fetched this route even though the answer was
  // sitting in memory. A short public cache removes that round trip without
  // letting the price go stale. `refresh=1` bypasses both layers.
  return NextResponse.json(price, {
    headers: {
      "Cache-Control": force
        ? "no-store"
        : "public, max-age=60, stale-while-revalidate=300",
    },
  });
}
