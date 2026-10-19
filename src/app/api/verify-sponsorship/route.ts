import { NextResponse, type NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";

export const runtime = "nodejs";

/// ───────────────────── thirdweb sponsorship verifier ──────────────────────
///
/// thirdweb calls this before it sponsors a transaction. Answering
/// `{ isAllowed: false }` means the user pays their own gas instead.
///
/// ### Why this endpoint has to exist
///
/// The in-app wallet is created with `sponsorGas: true`. On its own that sponsors
/// **every transaction from every in-app wallet** — the app pays the gas for
/// anything the account chooses to send, to any contract. Anyone with an email
/// address can create one, so without a verifier the project has an unbounded,
/// unauthenticated gas budget.
///
/// The policy here is the narrowest thing that still makes the game work:
/// **sponsor calls to Airen's own contracts, refuse everything else.**
///
/// ### What this endpoint is not
///
/// It is not authentication. thirdweb sends `Referer: https://api.thirdweb.com`,
/// but a Referer is a client-supplied header and must never be treated as proof.
/// The endpoint is safe to leave public precisely because it holds no secret and
/// makes no state change — the worst a direct caller can do is learn which
/// addresses are allowlisted, which is public on-chain anyway.
///
/// ### Tightening it further
///
/// Target-level allowlisting blocks the abuse that matters (spamming an
/// unrelated contract on Airen's gas). A second pass could also pin the
/// **function selectors**, so only game actions — `activate`, `equip`,
/// `useAbility`, the tab arena — are sponsored and not, say, an NFT transfer out.
/// That is a deliberate next step, not an oversight: selectors change with every
/// contract edit and a stale list silently stops sponsoring real gameplay.

/// Every Airen contract the app can call. Read from the same public variables the
/// frontend uses, so a redeploy updates the policy with no code change.
function allowedTargets(): string[] {
  return [
    process.env.NEXT_PUBLIC_SNEAKER_MINT_ADDRESS,
    process.env.NEXT_PUBLIC_VE_SNEAKER_STORE_ADDRESS,
    process.env.NEXT_PUBLIC_SNEAKER_GAME_ADDRESS,
    process.env.NEXT_PUBLIC_SNEAKER_WORKSHOP_ADDRESS,
    process.env.NEXT_PUBLIC_SNEAKER_TAB_ARENA_ADDRESS,
    process.env.NEXT_PUBLIC_SNEAKER_MARKETPLACE_ADDRESS,
    process.env.NEXT_PUBLIC_SNEAKER_MODS_ADDRESS,
    process.env.NEXT_PUBLIC_SNEAKER_SWAP_ADDRESS,
    process.env.NEXT_PUBLIC_MOD_STORE_ADDRESS,
    process.env.NEXT_PUBLIC_PLAYER_PROGRESS_ADDRESS,
    process.env.NEXT_PUBLIC_STAKING_VAULT_ADDRESS,
  ]
    .filter((value): value is string => typeof value === "string" && isAddress(value))
    .map((value) => getAddress(value).toLowerCase());
}

/// thirdweb's documented request body. Only the fields this policy reads are
/// typed; anything else in the payload is ignored rather than trusted.
type VerifierRequest = {
  clientId?: string;
  chainId?: number;
  userOp?: {
    sender?: string;
    targets?: string[];
    data?: { targets?: string[]; callDatas?: string[]; values?: string[] };
  };
};

function deny(reason: string) {
  // 200, not 4xx: thirdweb reads `isAllowed` from the body, and a non-200 would
  // be treated as a verifier outage rather than a decision.
  return NextResponse.json({ isAllowed: false, reason });
}

export async function POST(request: NextRequest) {
  let body: VerifierRequest;
  try {
    body = (await request.json()) as VerifierRequest;
  } catch {
    return deny("Malformed verifier request.");
  }

  const targets = allowedTargets();
  if (targets.length === 0) {
    // Fail closed. An unconfigured deployment must not hand out free gas for
    // every contract on the network.
    console.warn("[verify-sponsorship] no contract addresses configured — refusing to sponsor.");
    return deny("Sponsorship is not configured on this deployment.");
  }

  // A batch carries its calls under `data`; a single call carries `targets`.
  const requested = [
    ...(body.userOp?.targets ?? []),
    ...(body.userOp?.data?.targets ?? []),
  ];

  if (requested.length === 0) {
    return deny("No call targets in the request.");
  }

  const refused = requested.filter(
    (target) => typeof target !== "string" || !targets.includes(target.toLowerCase()),
  );
  if (refused.length > 0) {
    // Deliberately no sender or calldata in the log line: this runs per user
    // transaction and the wallet address is personal data.
    console.warn(`[verify-sponsorship] refused ${refused.length} target(s) outside the allowlist.`);
    return deny("Airen only sponsors calls to its own contracts.");
  }

  return NextResponse.json({ isAllowed: true });
}
