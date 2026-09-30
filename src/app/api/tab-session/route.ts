import { NextRequest, NextResponse } from "next/server";
import { isAddress, keccak256, encodePacked, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getAddress } from "viem";

export const runtime = "nodejs";

/// ─────────────────────────── Tab session signer ────────────────────────────
///
/// The daily tab challenge runs off-chain: taps happen in the browser, and the
/// contract only sees a signed score. This route is the only place that can
/// produce that signature.
///
/// **What the server is trusted for:** the tap count. Nothing else. The contract
/// recomputes the runner's power, the points-per-tap multiplier, the cleared
/// level, and the boost — then clamps the score to `multiplier × 600`. A leaked
/// signer key therefore cannot mint an unbounded boost.
///
/// **Replay protection:** every session carries a nonce that the arena consumes
/// on completion. The signature binds `(arena, player, nonce, points, deadline)`
/// and expires, so it cannot be reused.
///
/// The key never leaves the server; the browser only talks to this route.

const SIGNER_KEY = process.env.ARENA_SIGNER_PRIVATE_KEY;
const ARENA_ADDRESS = process.env.NEXT_PUBLIC_SNEAKER_TAB_ARENA_ADDRESS;

/// Signature lifetime — long enough to cover a slow wallet confirmation.
const SIGNATURE_TTL_SECONDS = 600;

/// Taps a player can physically land in one session. The client posts a score,
/// so this is the cheap sanity gate before signing.
const MAX_TAPS_PER_SESSION = 600;
/// Minimum gap between two taps, in milliseconds. Guards against a script that
/// posts a full session instantly.
const MIN_TAP_INTERVAL_MS = 35;

type SessionRequest = {
  player?: unknown;
  runnerId?: unknown;
  nonce?: unknown;
  points?: unknown;
  taps?: unknown;
  startedAt?: unknown;
};

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(request: NextRequest) {
  if (!SIGNER_KEY) {
    return NextResponse.json(
      { error: "Tab arena signing is not configured on this deployment." },
      { status: 503 },
    );
  }
  if (!ARENA_ADDRESS || !isAddress(ARENA_ADDRESS)) {
    return NextResponse.json(
      { error: "NEXT_PUBLIC_SNEAKER_TAB_ARENA_ADDRESS is not configured." },
      { status: 503 },
    );
  }

  let body: SessionRequest;
  try {
    body = (await request.json()) as SessionRequest;
  } catch {
    return badRequest("Expected a JSON body.");
  }

  const { player, runnerId, nonce, points, taps, startedAt } = body;

  if (typeof player !== "string" || !isAddress(player)) {
    return badRequest("player must be a valid EVM address.");
  }
  if (typeof nonce !== "string" && typeof nonce !== "number") {
    return badRequest("nonce is required.");
  }
  if (typeof points !== "number" || !Number.isInteger(points) || points < 0) {
    return badRequest("points must be a non-negative integer.");
  }
  if (typeof taps !== "number" || !Number.isInteger(taps) || taps < 0) {
    return badRequest("taps must be a non-negative integer.");
  }
  if (taps > MAX_TAPS_PER_SESSION) {
    return badRequest(`taps exceeds the ${MAX_TAPS_PER_SESSION} cap.`);
  }
  if (points > taps * 4) {
    // No runner earns more than x4, so a score above that is impossible.
    return badRequest("points exceed the maximum multiplier for the submitted taps.");
  }
  if (typeof startedAt === "number" && startedAt > 0) {
    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs < taps * MIN_TAP_INTERVAL_MS) {
      return badRequest("Session completed faster than humanly possible.");
    }
  }

  let nonceValue: bigint;
  try {
    nonceValue = BigInt(nonce as string | number);
  } catch {
    return badRequest("nonce must be an integer.");
  }
  if (nonceValue <= 0n) return badRequest("nonce must be positive.");

  let runnerIdValue: bigint;
  try {
    runnerIdValue = BigInt(runnerId as string | number);
  } catch {
    return badRequest("runnerId must be an integer.");
  }
  if (runnerIdValue <= 0n) return badRequest("runnerId must be positive.");

  const account = privateKeyToAccount(SIGNER_KEY as Hex);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + SIGNATURE_TTL_SECONDS);

  // Must match `SneakerTabArena.completeSession` exactly.
  const digest = keccak256(
    encodePacked(
      ["address", "address", "uint256", "uint32", "uint64"],
      [getAddress(ARENA_ADDRESS) as Address, getAddress(player) as Address, nonceValue, points, deadline],
    ),
  );

  const signature = await account.signMessage({ message: { raw: digest } });

  return NextResponse.json(
    { points, deadline: deadline.toString(), signature, signer: account.address },
    { headers: { "Cache-Control": "no-store" } },
  );
}
