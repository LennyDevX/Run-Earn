import { NextResponse, type NextRequest } from "next/server";
import { X402_ENABLED, X402_ROUTE_PATH, x402RouteConfig } from "@/lib/x402";

export const runtime = "nodejs";

/// ─────────────────────── x402 discovery manifest ───────────────────────────
///
/// Served at `/.well-known/x402` (rewritten in `next.config.ts`). Directory
/// crawlers and agents read this to learn a route's price and shape without
/// making a probe request. It is also what Polygon's Agentic Services catalog
/// points at for a `catalogOnly` listing — the mode that keeps the endpoint on
/// Airen's own domain instead of behind Polygon's proxy.
///
/// **Built from `x402RouteConfig()`, the same object the payment wrapper uses.**
/// A manifest quoting a different price or `payTo` than the endpoint charges would
/// be worse than none: an agent would sign for one amount and be rejected by the
/// other, with no clue why. Deriving both from one source makes that impossible
/// rather than merely unlikely.
///
/// **On the shape.** `accepts` is the canonical x402 v2 `PaymentRequirements`.
/// The wrapper around it is ours — there is no ratified schema for the discovery
/// document — so it follows the field names Polygon's own catalog uses (`name`,
/// `description`, `payment`, `externalUrl`) so a crawler written against that
/// catalog can read it.
///
/// No rate limit: the response is computed from environment variables and holds no
/// secret. Crawlers hitting it repeatedly cost nothing beyond a few CPU cycles.

type Accepts = {
  scheme: string;
  network: string;
  payTo: string;
  price: { asset: string; amount: string };
  extra?: { name: string; version: string };
};

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;

  // A disabled deployment advertises nothing. Publishing terms for an endpoint
  // that is not actually gated would send agents at a free route and make the
  // manifest a lie.
  if (!X402_ENABLED) {
    return NextResponse.json(
      { x402Version: 2, provider: { name: "Airen", url: origin }, resources: [] },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const config = x402RouteConfig();
  const accepts = config.accepts as unknown as Accepts;
  const resource = `${origin}${X402_ROUTE_PATH}`;

  return NextResponse.json(
    {
      x402Version: 2,
      provider: {
        name: "Airen",
        description:
          "A virtual sneaker universe in pixel art on Polygon. Collect, stake, upgrade and trade veSneakers.",
        url: origin,
        payTo: accepts.payTo,
      },
      resources: [
        {
          resource,
          externalUrl: resource,
          method: "POST",
          name: "Airen sneaker generation",
          description: config.description,
          mimeType: config.mimeType,
          accepts: [
            {
              scheme: accepts.scheme,
              network: accepts.network,
              asset: accepts.price.asset,
              amount: accepts.price.amount,
              payTo: accepts.payTo,
              maxTimeoutSeconds: 300,
              ...(accepts.extra ? { extra: accepts.extra } : {}),
            },
          ],
          // Described so an agent can build a valid request without reading the
          // app. Both halves were read off the route, not guessed.
          input: {
            contentType: "multipart/form-data",
            fields: {
              photo: "image file (JPEG/PNG/WebP), max 8 MB — required",
              seed: "string — optional, makes the generation reproducible",
              minted: "integer — optional, the collector's current mint count",
            },
          },
          output: {
            contentType: "application/json",
            fields: {
              imageBase64: "string — the generated artwork, base64",
              mimeType: "string",
              suggestedName: "string",
              description: "string",
              tier: "integer — 0 Common, 1 Rare, 2 Epic, 3 Mythic. Assigned, not chosen",
              tierLabel: "string",
              rarityScore: "integer",
            },
          },
        },
      ],
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
