export type VeSneakerRarity = "Common" | "Rare" | "Epic" | "Mythic";

export type VeSneakerCatalogEntry = {
  name: string;
  design: number; // PixelSneaker design index (0..6)
  rarity: number; // rarity score 0..100
  tier: number; // 0..3
  palette: Partial<Record<string, string>>;
};

/// Canonical veSneaker catalog. The order MUST match `veSneakerDesigns()` in
/// `scripts/deployment-config.ts`, because the on-chain design index is the
/// array position used by `VeSneakerStore.addDesign`.
export const VE_SNEAKER_CATALOG: readonly VeSneakerCatalogEntry[] = [
  { name: "Neon Runner", design: 0, rarity: 85, tier: 3, palette: {} },
  { name: "Sky Drift", design: 1, rarity: 45, tier: 1, palette: { M: "#38bdf8", S: "#3ddc97" } },
  { name: "Magma Rush", design: 2, rarity: 65, tier: 2, palette: { S: "#ff4a2d", G: "#38bdf8" } },
  { name: "Mint Circuit", design: 3, rarity: 45, tier: 1, palette: { M: "#3ddc97", S: "#ff4a2d" } },
  { name: "Ghost Protocol", design: 2, rarity: 20, tier: 0, palette: { S: "#d4d4d8", M: "#a1a1aa", G: "#d4d4d8" } },
  { name: "Sol Surge", design: 1, rarity: 85, tier: 3, palette: { S: "#9945ff", M: "#14f195", G: "#9945ff" } },
  { name: "Cyber Pulse", design: 4, rarity: 85, tier: 3, palette: { S: "#14f195", M: "#38bdf8", G: "#14f195" } },
  { name: "Violet Haze", design: 5, rarity: 65, tier: 2, palette: { S: "#c084fc", M: "#8247e5", G: "#c084fc" } },
  { name: "Ember Trail", design: 6, rarity: 20, tier: 0, palette: { S: "#ff8a5c", M: "#ff4a2d", G: "#ff4a2d" } },
] as const;

export const VE_TIER_LABEL: readonly VeSneakerRarity[] = ["Common", "Rare", "Epic", "Mythic"];
export const VE_TIER_BOOST: readonly string[] = ["+0.5% APY", "+0.8% APY", "+1.5% APY", "+1.8% APY"];

/// Fallback prices (POL) used when the store contract is not configured.
/// These mirror the `veSneakerPricesPol()` defaults: USD targets $40 / $62 / $97 /
/// $150 converted at POL = $0.09764. Refresh them if the USD targets or POL price change.
export const VE_FALLBACK_PRICE_POL: Record<number, string> = {
  0: "410", // Common  (~$40)
  1: "635", // Rare    (~$62)
  2: "993", // Epic   (~$97)
  3: "1536", // Mythic (~$150)
};

/// Display-only POL/USD reference used as the initial value before the live
/// Uniswap price feed (`/api/pol-price`) resolves. Keep in sync with
/// `POL_USD_PRICE` in `.env`.
export const VE_POL_USD_PRICE = 0.09764;

export const VE_MAX_SUPPLY_FALLBACK = 1000n;

export const VE_RARITY_STYLES: Record<VeSneakerRarity, string> = {
  Common: "bg-foreground/10 text-foreground/60",
  Rare: "bg-sky/15 text-sky",
  Epic: "bg-magma/15 text-magma",
  Mythic: "bg-mint/15 text-mint",
};
