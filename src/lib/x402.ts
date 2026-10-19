import { HTTPFacilitatorClient, x402ResourceServer, type RouteConfig } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import type { Network } from "@x402/core/types";

/// ─────────────────────────── x402 (HTTP 402 payments) ──────────────────────
///
/// Lets `/api/generate-sneaker` charge the caller in USDC on Polygon instead of
/// the project absorbing the Gemini cost. That endpoint is the most expensive
/// thing Airen runs — two paid model passes per request — and today it is only
/// defended by a rate limit and a daily budget. Those are throttles, not
/// revenue.
///
/// **Off by default.** Nothing changes until `X402_PAY_TO` is set: the route
/// keeps serving free, rate-limited generations. Charging for the mint is a
/// product decision, not a deploy detail, so it stays behind a switch.
///
/// Settlement happens through the facilitator only *after* the handler returns
/// a success status, so a rejected photo (400), a spent budget (429) or a model
/// failure (502) never charges the caller.

const AMOY: Network = "eip155:80002";
const MAINNET: Network = "eip155:137";

/// Read explicitly rather than inferring from the public app config: a staging
/// deploy may point the widget at mainnet on purpose, and the reverse mistake
/// would take real money on a testnet build.
const NETWORK: Network =
  (process.env.X402_NETWORK as Network | undefined) ??
  (process.env.NEXT_PUBLIC_POLYGON_NETWORK === "amoy" ? AMOY : MAINNET);

const FACILITATOR_URL =
  process.env.X402_FACILITATOR_URL ??
  (NETWORK === AMOY ? "https://x402-amoy.polygon.technology" : "https://x402.polygon.technology");

/// Address that receives the USDC. Empty means x402 stays off.
export const X402_PAY_TO = process.env.X402_PAY_TO ?? "";
export const X402_ENABLED = X402_PAY_TO.length > 0;
/// The path the middleware matches on. It must equal the served route exactly,
/// or the handler runs unprotected and the SDK logs a warning instead.
export const X402_ROUTE_PATH = "/api/generate-sneaker";

/// Price in whole USD. Converted to USDC atomic units (6 decimals) below.
const PRICE_USD = Number(process.env.X402_PRICE_USD ?? 0.75);

/// The settlement asset is passed explicitly rather than as a `"$0.75"` money
/// string. The scheme's built-in asset table does not cover every network — it
/// throws `No default asset configured for network eip155:80002` on Amoy — and
/// for a payment a hard-coded, reviewable address beats a lookup table anyway.
/// Override with `X402_ASSET` if the canonical USDC ever moves.
const USDC_BY_NETWORK: Record<string, string> = {
  "eip155:137": "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", // Polygon native USDC
  "eip155:80002": "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582", // Amoy test USDC
};
const X402_ASSET = process.env.X402_ASSET ?? USDC_BY_NETWORK[NETWORK] ?? "";

/// EIP-712 domain for the settlement asset. The x402 client ships the domain for
/// its built-in default assets but cannot know it for anything else, and without
/// it the payer cannot build a payload at all — it fails with "EIP-712 domain
/// parameters (name, version) are required".
///
/// Only the entry below is verified: native USDC reports `name() = "USD Coin"`,
/// `version() = "2"`, and hashing that domain reproduces the contract's own
/// `DOMAIN_SEPARATOR()` exactly.
///
/// **USDC.e is deliberately absent.** The bridged token reports
/// `name() = "USD Coin (PoS)"` but exposes no `version()`, and none of 30
/// plausible name/version combinations hash to its `DOMAIN_SEPARATOR()`. Paying
/// with it produced `unexpected_error` from the facilitator. Use native USDC.
///
/// Any other asset needs `X402_ASSET_NAME` / `X402_ASSET_VERSION` set explicitly,
/// and those values must be verified against the token's `DOMAIN_SEPARATOR()`.
const ASSET_DOMAINS: Record<string, { name: string; version: string }> = {
  "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359": { name: "USD Coin", version: "2" },
};
const knownDomain = ASSET_DOMAINS[X402_ASSET] ?? ASSET_DOMAINS[X402_ASSET.toLowerCase()];
const ASSET_NAME = process.env.X402_ASSET_NAME ?? knownDomain?.name ?? "";
const ASSET_VERSION = process.env.X402_ASSET_VERSION ?? knownDomain?.version ?? "";

/// USDC has 6 decimals. Rounding down is the safe direction: it can never ask
/// the payer for more than the configured price.
function priceInAtomicUnits(usd: number): string {
  return BigInt(Math.floor(usd * 1_000_000)).toString();
}

let server: x402ResourceServer | null = null;

/// One resource server for the process — the constructor is not free and it
/// holds the facilitator capability handshake.
export function x402Server(): x402ResourceServer | null {
  if (!X402_ENABLED || !X402_ASSET) return null;
  server ??= new x402ResourceServer(new HTTPFacilitatorClient({ url: FACILITATOR_URL })).register(
    NETWORK,
    new ExactEvmScheme(),
  );
  return server;
}

export function x402RouteConfig(): RouteConfig {
  return {
    accepts: {
      scheme: "exact",
      price: { asset: X402_ASSET, amount: priceInAtomicUnits(PRICE_USD) },
      network: NETWORK,
      payTo: X402_PAY_TO,
      // Carried so a non-default asset can still be signed. Omitting it for an
      // asset the client does not know makes the endpoint unpayable.
      ...(ASSET_NAME && ASSET_VERSION ? { extra: { name: ASSET_NAME, version: ASSET_VERSION } } : {}),
    },
    /// `description` and `mimeType` are what the x402 Bazaar indexes, so an
    /// agent can discover this endpoint without a human reading the docs.
    description: "Airen collectible generation — one AI-graded pixel-art sneaker mint.",
    mimeType: "application/json",
  };
}
