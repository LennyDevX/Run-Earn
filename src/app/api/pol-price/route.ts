import { NextRequest, NextResponse } from "next/server";
import { getPolUsdPrice } from "@/lib/uniswap";

export const runtime = "nodejs";

/// POL/USD reference price for the veSneaker storefront.
///
/// The Uniswap Trading API key never leaves the server; the browser only talks
/// to this route. Falls back to `POL_USD_PRICE` when Uniswap is unavailable.
export async function GET(request: NextRequest) {
  const force = request.nextUrl.searchParams.get("refresh") === "1";
  const price = await getPolUsdPrice(force);
  return NextResponse.json(price, {
    headers: { "Cache-Control": "no-store" },
  });
}
