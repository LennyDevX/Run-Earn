import type { NextRequest } from "next/server";
import { isAddress } from "viem";
import { fetchSubgraphActivity } from "@/lib/subgraph";
import { clientKey, rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/// The feed is polled by dashboards, so the window is generous — but this route
/// proxies a paid Graph query, and an open proxy drains the quota.
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60 * 1000;

export async function GET(request: NextRequest) {
  const limited = await rateLimit(clientKey(request, "subgraph"), RATE_LIMIT, RATE_WINDOW_MS);
  if (!limited.ok) {
    return tooManyRequests(limited, "Too many activity requests. Slow down.");
  }

  const address = new URL(request.url).searchParams.get("address");
  if (!address || !isAddress(address)) {
    return Response.json({ configured: false, activities: [], error: "A valid wallet address is required." }, { status: 400 });
  }

  const result = await fetchSubgraphActivity(address);
  // Per-wallet activity, so it must not be cached by a shared proxy.
  return Response.json(result, {
    status: result.error && result.configured ? 502 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
