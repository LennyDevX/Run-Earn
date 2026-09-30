/// ─────────────────────────── Daily Tab Challenge ───────────────────────────
///
/// A once-per-24h tap challenge that grants a **time-boxed staking APY boost**.
/// It is deliberately modelled as a temporary modifier on top of the existing
/// `SneakerStaking` accounting rule — never as a new reward stream.
///
/// ### How the boost fits the current staking budget
///
/// `SneakerStaking` computes (see `contracts/SneakerStaking.sol`):
///
/// ```text
/// requested = baseApyBps (280)
///           + lockedCount * perNftBonusBps (0)
///           + Σ tierBonusBps            // 50 / 80 / 150 / 180 per locked NFT
///           + Σ stakingBoostBps         // Boost-slot mods on locked sneakers
///           + tabBoostBps               // ← this mechanic, 0 when no session is active
/// effective = min(requested, maxApyBps = 800)
/// ```
///
/// The tab boost is added to `requested` **before** the clamp, so it can never
/// lift a wallet above the 8.00% hard cap. That single rule is what keeps the
/// mechanic safe: a Mythic holder with a Boost mod who is already near the cap
/// simply absorbs no extra cost.
///
/// ### Worst-case cost to the reserve
///
/// | Path                        | bps  | Annualised cost on principal |
/// | --------------------------- | ---- | ---------------------------- |
/// | Mythic tier boost           | 180  | 1.80%                        |
/// | Boost-slot mod (typical)    | ~300 | ~3.00%                       |
/// | **Tab challenge (max)**     | 150  | **1.50%**                    |
///
/// The tab ceiling (1.50%) is therefore *cheaper than the Mythic tier boost*
/// that already exists — and unlike the tier boost it only pays out for 24h
/// after a completed session, requires the sneaker to stay locked in staking,
/// and is limited to one active session per wallet. Playing perfectly for a
/// full year is the only way to reach the 1.50% annualised figure.
///
/// ### Access gate
///
/// A session requires **both**:
/// 1. a non-zero POL principal in `SneakerStaking` (otherwise the boost has no
///    APY to apply to), and
/// 2. the runner locked in the vault (`staking.stakedOwner(tokenId) == caller`).
///
/// The 30-day minimum lock only delays *withdrawal*, not play — a player can
/// stake and open their first session the same day.
///
/// ### Guardrails
///
/// 1. Rewards are paid **only** from the explicitly funded POL reserve;
///    `claimPOLRewards` reverts when the reserve cannot cover the claim.
/// 2. The boost is not a promise of return — the APY is an accounting rule.
/// 3. Principal is never touched: the boost changes accrual, not custody.
/// 4. The boost expires after 24h and does not auto-renew.
/// 5. One active session per wallet — sessions never stack.
/// 6. The multiplier is recomputed on-chain at claim time, so equipping items
///    mid-session cannot inflate the reward.

export const TAB_CHALLENGE = {
  /** The player has 24h from starting a session to hit the target. */
  sessionSeconds: 86_400,
  /** A completed session grants the boost for 24h, then it lapses. */
  boostSeconds: 86_400,
  /** One active session per wallet — sessions never stack. */
  maxActiveSessions: 1,
  /** Boost floor and ceiling, matching the product spec (0.50% – 1.50%). */
  minBoostBps: 50,
  maxBoostBps: 150,
  /** Power-score inputs: +5 per equipped mod, up to the seven slots. */
  modPowerEach: 5,
  maxEquippedMods: 7,
  maxPowerScore: 100,
} as const;

/// ─────────────────────────── VeSneaker condition ───────────────────────────
///
/// A veSneaker is a physical object in the fiction, so it wears. Every pair runs
/// a **365-day season**: condition decays linearly from pristine to fully worn,
/// and a fully worn pair still keeps half of its rarity — a neglected sneaker
/// gets weaker, never useless.
///
/// Condition scales the pair's effective rarity, which flows into the veRUNE
/// earn rate, the appraiser valuation, and the tab power score. Restoring it is
/// what the workshop's repair consumables are for.
///
/// The decay lives on the **sneaker**, never on the item: mod NFTs stay
/// permanent, transferable property whose value does not evaporate on a timer.
export const CONDITION = {
  /** A fully worn pair keeps this share of its rarity (50%). */
  floorBps: 5_000,
  /** A freshly serviced pair (100%). */
  fullBps: 10_000,
  /** One full season, in seconds. */
  seasonSeconds: 31_536_000,
} as const;

/// Condition at a point in time, given the last service timestamp.
export function conditionBpsAt(lastServiceAt: number, nowSeconds: number) {
  const elapsed = Math.max(0, nowSeconds - lastServiceAt);
  const capped = Math.min(elapsed, CONDITION.seasonSeconds);
  const lost = Math.floor(
    ((CONDITION.fullBps - CONDITION.floorBps) * capped) / CONDITION.seasonSeconds,
  );
  return CONDITION.fullBps - lost;
}

/// Seconds until the pair is fully worn, given its current condition.
export function secondsUntilFullyWorn(conditionBps: number) {
  if (conditionBps <= CONDITION.floorBps) return 0;
  const remaining = conditionBps - CONDITION.floorBps;
  const span = CONDITION.fullBps - CONDITION.floorBps;
  return Math.ceil((remaining / span) * CONDITION.seasonSeconds);
}

export type ConditionBand = {
  id: "pristine" | "good" | "worn" | "critical";
  label: string;
  /** Tailwind text colour for the bar and the label. */
  tone: string;
  /** Tailwind background for the filled portion of the bar. */
  bar: string;
};

/// Wear bands used by the condition bar in `/collection` and `/my-nfts`.
export const CONDITION_BANDS: readonly (ConditionBand & { minBps: number })[] = [
  { minBps: 8_500, id: "pristine", label: "Pristine", tone: "text-mint", bar: "bg-mint" },
  { minBps: 7_000, id: "good", label: "Good", tone: "text-brand", bar: "bg-brand" },
  { minBps: 5_500, id: "worn", label: "Worn", tone: "text-sol", bar: "bg-sol" },
  { minBps: 0, id: "critical", label: "Critical", tone: "text-magma", bar: "bg-magma" },
] as const;

export function conditionBand(conditionBps: number): ConditionBand {
  return CONDITION_BANDS.find((band) => conditionBps >= band.minBps) ?? CONDITION_BANDS[CONDITION_BANDS.length - 1];
}

/// Percentage of the bar to fill (0–100), relative to the floor.
export function conditionPercent(conditionBps: number) {
  const clamped = Math.min(CONDITION.fullBps, Math.max(CONDITION.floorBps, conditionBps));
  return Math.round(
    ((clamped - CONDITION.floorBps) / (CONDITION.fullBps - CONDITION.floorBps)) * 100,
  );
}

/// Staking constants mirrored for display. Keep in sync with
/// `contracts/SneakerStaking.sol` and `scripts/deployment-config.ts`.
export const STAKING_BUDGET = {
  baseApyBps: 280,
  tierBonusBps: [50, 80, 150, 180] as const,
  maxApyBps: 800,
  minLockSeconds: 2_592_000,
} as const;

export type TabLevel = {
  level: number;
  /** Points required to clear the level. */
  points: number;
  /** Boost granted when the level is completed, before the power ceiling. */
  boostBps: number;
  label: string;
};

/// Each level costs more points than the last. The reward curve is front-loaded
/// so a casual session still earns a meaningful 0.50%.
///
/// Points — not taps — are the currency. A stronger veSneaker earns more points
/// per tap (see `pointsPerTap`), so the same ladder clears in fewer taps:
///
/// | Runner tier | Points/tap | Taps to clear L6 (600 pts) |
/// | ----------- | ---------- | -------------------------- |
/// | Common      | 1          | 600                        |
/// | Rare        | 2          | 300                        |
/// | Epic        | 3          | 200                        |
/// | Mythic      | 4          | 150                        |
///
/// This is the whole payoff for upgrading: **power changes how fast you clear
/// the ladder, never how much you can earn.** The boost ceiling is untouched, so
/// protocol liability is identical regardless of the NFT.
export const TAB_LEVELS: readonly TabLevel[] = [
  { level: 1, points: 50, boostBps: 50, label: "Warm-up" },
  { level: 2, points: 100, boostBps: 70, label: "Steady" },
  { level: 3, points: 175, boostBps: 90, label: "Tempo" },
  { level: 4, points: 275, boostBps: 110, label: "Push" },
  { level: 5, points: 400, boostBps: 130, label: "Overdrive" },
  { level: 6, points: 600, boostBps: 150, label: "Mythic run" },
] as const;

export const MAX_TAB_LEVEL = TAB_LEVELS[TAB_LEVELS.length - 1];

/// Points a single tap is worth, keyed off the runner's power score. The bands
/// line up with the four sneaker tiers so the multiplier reads as "what class of
/// runner am I bringing".
export function pointsPerTap(powerScore: number) {
  if (powerScore >= 76) return 4;
  if (powerScore >= 51) return 3;
  if (powerScore >= 26) return 2;
  return 1;
}

/// Taps needed to reach a point target with a runner at this multiplier.
export function tapsFor(points: number, perTap: number) {
  return Math.ceil(points / Math.max(1, perTap));
}

export type TapTier = {
  multiplier: number;
  label: string;
  minScore: number;
};

/// The multiplier ladder, for UI display.
export const TAP_TIERS: readonly TapTier[] = [
  { multiplier: 1, label: "Common", minScore: 0 },
  { multiplier: 2, label: "Rare", minScore: 26 },
  { multiplier: 3, label: "Epic", minScore: 51 },
  { multiplier: 4, label: "Mythic", minScore: 76 },
] as const;

/// ─────────────────────────── VeSneaker power ───────────────────────────────
///
/// Power is **derived**, never stored: it is the live sum of the pair's base
/// rarity (scaled by wear) and the mods currently equipped. Equipping raises it,
/// unequipping lowers it, and letting the pair wear down drags it back — which
/// is exactly what makes the loadout a decision rather than a permanent unlock.

export type SneakerPowerInput = {
  /** Base rarity score 0–100 read from `SneakerMint.traitsOf`. */
  rarity: number;
  /** Live wear, `CONDITION.floorBps` … `CONDITION.fullBps`. */
  conditionBps: number;
  /** Number of mods currently equipped on the sneaker (0–7). */
  equippedMods: number;
};

export type SneakerPower = {
  /** Rarity after wear is applied, 0–100. */
  effectiveRarity: number;
  /** Combined power score used for the ceiling and the multiplier (0–100). */
  score: number;
  /** Highest boost this sneaker can earn, in basis points. */
  ceilingBps: number;
  /** Derived runner level, 1–11. */
  level: number;
  /** Points each tap is worth for this runner. */
  multiplier: number;
};

/// Power = worn rarity + a bonus per equipped mod, clamped to 100.
///
/// Because wear scales the base rarity, a neglected pair loses power even while
/// it keeps every item equipped. Servicing it is the only way back up — that is
/// the maintenance loop.
export function sneakerPower({ rarity, conditionBps, equippedMods }: SneakerPowerInput): SneakerPower {
  const worn = Math.min(CONDITION.fullBps, Math.max(CONDITION.floorBps, conditionBps));
  const base = Math.min(100, Math.max(0, rarity));
  const effectiveRarity = Math.round((base * worn) / CONDITION.fullBps);
  const modBonus =
    Math.min(TAB_CHALLENGE.maxEquippedMods, Math.max(0, equippedMods)) * TAB_CHALLENGE.modPowerEach;
  const score = Math.min(TAB_CHALLENGE.maxPowerScore, effectiveRarity + modBonus);
  return {
    effectiveRarity,
    score,
    ceilingBps: boostCeilingBps(score),
    level: nftLevel(score),
    multiplier: pointsPerTap(score),
  };
}

/// Derived runner level: ten bands of power score, 1–11. Display only — nothing
/// reads it on-chain, so it never has to be migrated.
export function nftLevel(powerScore: number) {
  const clamped = Math.min(TAB_CHALLENGE.maxPowerScore, Math.max(0, powerScore));
  return 1 + Math.floor(clamped / 10);
}

export const MAX_NFT_LEVEL = nftLevel(TAB_CHALLENGE.maxPowerScore);

/// Linear 50 → 150 bps across a 0 → 100 power score.
export function boostCeilingBps(score: number) {
  const clamped = Math.min(TAB_CHALLENGE.maxPowerScore, Math.max(0, score));
  return TAB_CHALLENGE.minBoostBps + clamped;
}

/// The boost a completed level actually pays: the level reward, capped by the
/// sneaker's power ceiling.
export function awardedBoostBps(levelBoostBps: number, ceilingBps: number) {
  return Math.min(levelBoostBps, ceilingBps);
}

/// Levels whose reward is fully paid by a sneaker at this ceiling. The rest
/// still count for progression, but pay the capped amount.
export function reachableLevels(ceilingBps: number) {
  return TAB_LEVELS.filter((level) => level.boostBps <= ceilingBps);
}

export function levelForPoints(points: number) {
  let current: TabLevel | null = null;
  for (const level of TAB_LEVELS) {
    if (points >= level.points) current = level;
  }
  return current;
}

export function nextLevelAfterPoints(points: number) {
  return TAB_LEVELS.find((level) => points < level.points) ?? null;
}

/// Projected APY if the boost lands on top of the wallet's current staking
/// position — clamped to the protocol cap exactly like the contract does.
export function projectedApyBps(currentApyBps: number, boostBps: number) {
  return Math.min(STAKING_BUDGET.maxApyBps, currentApyBps + boostBps);
}

export function bpsToPercent(bps: number) {
  return `${(bps / 100).toFixed(2)}%`;
}

/// ─────────────────────────── Arena access gate ─────────────────────────────

export type ArenaGate = {
  /** Non-zero POL principal in the staking vault. */
  hasPol: boolean;
  /** The selected runner is locked in the vault by this wallet. */
  hasLockedRunner: boolean;
};

/// Both conditions are required to open a session. Returns the unmet ones so the
/// UI can list exactly what is missing.
export function unmetGateRequirements(gate: ArenaGate) {
  const missing: string[] = [];
  if (!gate.hasPol) missing.push("Deposit POL into the staking vault");
  if (!gate.hasLockedRunner) missing.push("Lock a veSneaker in the vault");
  return missing;
}

export function gateOpen(gate: ArenaGate) {
  return gate.hasPol && gate.hasLockedRunner;
}

/// Worked examples shown in the UI. Each row is a legitimate path to a given
/// ceiling — cheap sneakers can still get there with enough equipped mods, and
/// wear drags every row down until the pair is serviced.
export type PowerExample = {
  family: "astra" | "sol" | "luna";
  name: string;
  tier: number;
  rarity: number;
  conditionBps: number;
  equippedMods: number;
};

export const POWER_EXAMPLES: readonly PowerExample[] = [
  { family: "sol", name: "Sol", tier: 1, rarity: 45, conditionBps: 9_200, equippedMods: 2 },
  { family: "luna", name: "Luna", tier: 2, rarity: 65, conditionBps: 7_600, equippedMods: 4 },
  { family: "astra", name: "Astra", tier: 3, rarity: 85, conditionBps: 9_800, equippedMods: 3 },
] as const;
