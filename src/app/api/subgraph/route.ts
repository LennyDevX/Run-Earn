import { isAddress } from "viem";
import { fetchSubgraphActivity } from "@/lib/subgraph";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get("address");
  if (!address || !isAddress(address)) {
    return Response.json({ configured: false, activities: [], error: "A valid wallet address is required." }, { status: 400 });
  }

  const result = await fetchSubgraphActivity(address);
  return Response.json(result, { status: result.error && result.configured ? 502 : 200 });
}
