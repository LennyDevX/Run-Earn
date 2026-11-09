import { NextResponse, type NextRequest } from "next/server";
import { isAddress } from "viem";
import { clientKey, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { fetchActivity } from "@/lib/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/// Recent on-chain activity for one address, read with `eth_getLogs`.
///
/// Replaces the hosted-subgraph proxy. The rate limit stays: this route fans out
/// to an RPC that costs money, and an open proxy would let anyone spend the quota
/// by hammering it with addresses.
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60 * 1000;

export async function GET(request: NextRequest) {
  const limited = await rateLimit(clientKey(request, "activity"), RATE_LIMIT, RATE_WINDOW_MS);
  if (!limited.ok) return tooManyRequests(limited, "Too many activity requests. Slow down.");

  const address = new URL(request.url).searchParams.get("address");
  if (!address || !isAddress(address)) {
    return NextResponse.json({ activities: [], error: "A valid address is required." }, { status: 400 });
  }

  try {
    const activities = await fetchActivity(address);
    return NextResponse.json(
      { configured: true, activities },
      { headers: { "Cache-Control": "private, max-age=30" } },
    );
  } catch (cause) {
    // A feed is a convenience — it must not surface as a broken dashboard.
    return NextResponse.json(
      { configured: true, activities: [], error: cause instanceof Error ? cause.message : "Could not read activity." },
      { status: 200 },
    );
  }
}
