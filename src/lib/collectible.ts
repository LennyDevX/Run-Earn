/// ─────────────────────────── AI collectible model ──────────────────────────
///
/// Shared by the server pipeline (`/api/generate-sneaker`) and the mint studio.
/// Everything here is pure so both sides agree on the numbers.
///
/// ### Why rarity is assigned, not chosen
///
/// A collector cannot pick Mythic — that would make the tier meaningless. The AI
/// reads measurable signals off the source photo and the server maps them onto a
/// **target distribution** that is enforced against what has already been minted:
///
/// | Tier   | Target share | Rarity band |
/// | ------ | ------------ | ----------- |
/// | Common | 50%          | 20 – 44     |
/// | Rare   | 30%          | 45 – 64     |
/// | Epic   | 15%          | 65 – 84     |
/// | Mythic | 5%           | 85 – 99     |
///
/// Quality sets the **ceiling**; scarcity can only pull a piece **down**, never
/// up. So a blurry snapshot never becomes Mythic, and the curve stays honest as
/// the collection grows.

export type CollectibleTier = 0 | 1 | 2 | 3;

export type TierTarget = {
  tier: CollectibleTier;
  label: string;
  /** Share of the collection this tier should hold. */
  share: number;
  /** Inclusive rarity band for pieces in this tier. */
  min: number;
  max: number;
};

export const TIER_TARGETS: readonly TierTarget[] = [
  { tier: 0, label: "Common", share: 0.5, min: 20, max: 44 },
  { tier: 1, label: "Rare", share: 0.3, min: 45, max: 64 },
  { tier: 2, label: "Epic", share: 0.15, min: 65, max: 84 },
  { tier: 3, label: "Mythic", share: 0.05, min: 85, max: 99 },
] as const;

/// Below this many mints the curve has no signal, so the piece is graded on
/// quality alone.
const MIN_SAMPLE = 20;

/// What the vision pass reads off the photo.
export type RaritySignals = {
  /** How much fine structure the sneaker has (stitching, panels, texture). */
  detailDensity: number;
  /** How varied the colorway is. */
  colorComplexity: number;
  /** How far the silhouette sits from a generic trainer. */
  distinctiveness: number;
};

export type CollectibleAnalysis = {
  suggestedName: string;
  description: string;
  silhouette: string;
  material: string;
  colorway: string[];
  primaryColor: string;
  notableDetails: string;
  raritySignals: RaritySignals;
};

/// Weighted blend of the vision signals, 0–100.
export function qualityScore(signals: RaritySignals): number {
  const clamp = (value: number) => Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
  const blended =
    clamp(signals.detailDensity) * 0.35 +
    clamp(signals.colorComplexity) * 0.25 +
    clamp(signals.distinctiveness) * 0.4;
  return Math.round(blended);
}

/// Where a quality score lands on the target curve, before scarcity is applied.
export function qualityToTier(quality: number): CollectibleTier {
  const clamped = Math.min(100, Math.max(0, quality));
  if (clamped >= 95) return 3;
  if (clamped >= 80) return 2;
  if (clamped >= 50) return 1;
  return 0;
}

/// Assign a tier from the piece's quality and what the collection already holds.
///
/// @param mintedPerTier how many collectibles each tier already has, index 0–3.
/// @dev Scarcity can only lower the tier. That keeps the curve enforceable while
///      making it impossible to farm a Mythic by minting when the tier is empty.
export function pickTier(quality: number, mintedPerTier: readonly number[]): CollectibleTier {
  const ceiling = qualityToTier(quality);
  const total = mintedPerTier.reduce((sum, count) => sum + count, 0);
  if (total < MIN_SAMPLE) return ceiling;

  for (let tier = ceiling; tier >= 0; tier -= 1) {
    const actual = (mintedPerTier[tier] ?? 0) / total;
    if (actual <= TIER_TARGETS[tier].share) return tier as CollectibleTier;
  }
  return 0;
}

/// Rarity score inside the tier's band, so two pieces of the same tier still
/// differ. `quality` drives the position within the band.
export function rarityScoreForTier(tier: number, quality: number): number {
  const band = TIER_TARGETS[tier] ?? TIER_TARGETS[0];
  const ratio = Math.min(1, Math.max(0, quality / 100));
  return Math.round(band.min + ratio * (band.max - band.min));
}

export function tierLabel(tier: number): string {
  return TIER_TARGETS[tier]?.label ?? "Common";
}

/// The full assignment for one piece.
export type CollectibleGrading = {
  tier: CollectibleTier;
  tierLabel: string;
  rarityScore: number;
  quality: number;
};

export function gradeCollectible(
  signals: RaritySignals,
  mintedPerTier: readonly number[],
): CollectibleGrading {
  const quality = qualityScore(signals);
  const tier = pickTier(quality, mintedPerTier);
  return {
    tier,
    tierLabel: tierLabel(tier),
    rarityScore: rarityScoreForTier(tier, quality),
    quality,
  };
}

// ─────────────────────────── Style rotation ────────────────────────────────

/// Palette bands the renderer rotates through. A collector's `styleKey` is built
/// from one of these, and the contract rejects a repeat, so no two pieces look
/// alike.
export const STYLE_PALETTES = [
  "cyan-dominant",
  "violet-dominant",
  "mint-dominant",
  "gold-dominant",
  "cyan-violet split",
  "mint-gold split",
  "violet-gold split",
  "cyan-mint gradient",
  "deep-navy mono",
  "ember accent",
  "glacier accent",
  "neon dusk",
] as const;

export const STYLE_COMPOSITIONS = [
  "three-quarter hero",
  "low dramatic angle",
  "floating profile",
  "top-down isometric",
  "three-quarter with orbit ring",
  "side profile with speed lines",
] as const;

/// Deterministic style pick from a seed, skipping combinations already taken.
/// @param isTaken predicate against the on-chain `usedStyles` mapping.
export function pickStyle(seed: number, isTaken: (key: string) => boolean) {
  const paletteCount = STYLE_PALETTES.length;
  const compositionCount = STYLE_COMPOSITIONS.length;
  const total = paletteCount * compositionCount;

  for (let offset = 0; offset < total; offset += 1) {
    const index = (seed + offset) % total;
    const palette = STYLE_PALETTES[index % paletteCount];
    const composition = STYLE_COMPOSITIONS[Math.floor(index / paletteCount) % compositionCount];
    const key = `${palette}::${composition}`;
    if (!isTaken(key)) return { palette, composition, key, index };
  }
  // Every combination is spent — fall back to a seed-derived one so the mint
  // still succeeds rather than blocking the collector.
  const index = seed % total;
  const palette = STYLE_PALETTES[index % paletteCount];
  const composition = STYLE_COMPOSITIONS[Math.floor(index / paletteCount) % compositionCount];
  return { palette, composition, key: `${palette}::${composition}`, index };
}

export const STYLE_COMBINATION_COUNT = STYLE_PALETTES.length * STYLE_COMPOSITIONS.length;
