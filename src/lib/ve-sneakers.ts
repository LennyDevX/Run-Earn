export type VeSneakerRarity = "Common" | "Rare" | "Epic" | "Mythic";

export type VeSneakerFamilyId = "astra" | "sol" | "luna";

export type VeSneakerFamily = {
  id: VeSneakerFamilyId;
  name: string;
  imageSrc: string;
  design: number;
  tagline: string;
  /// What this NFT actually does — the base capabilities that the workshop
  /// items upgrade. Rarity and tier are the on-chain traits; the numbers here
  /// mirror `sneakerPower` and the staking tier bonuses.
  capability: string;
};

/// The base capabilities every veSneaker shares, spelled out so the item shop
/// and the storefront describe the same machine:
///
/// - **veRUNE output** — mines per second while inside an active earning window,
///   scaled by `powerOf` (rarity) and the tier base rate.
/// - **Staking APY** — added to the vault rate while the pair is locked:
///   Common +0.5% · Rare +0.8% · Epic +1.5% · Mythic +1.8%, inside the 8% cap.
/// - **Tab power** — `rarity + forge×5 + equippedMods×5` (max 100). Power sets
///   the boost ceiling (`50 + power` bps, max 1.50%) and the points per tap
///   (×1 to ×4) in the daily tab challenge.
export const VE_SNEAKER_FAMILIES: readonly VeSneakerFamily[] = [
  {
    id: "astra",
    name: "Astra",
    imageSrc: "/veSneakerAstra.png",
    design: 0,
    tagline: "A violet signal from beyond the grid.",
    capability:
      "Mythic runner — the highest base output in the catalog. Mines at the top tier rate, adds +1.8% staking APY when locked, and starts with 85 tab power for a +1.35% boost ceiling. Three equipped mods take it to the 1.50% maximum.",
  },
  {
    id: "sol",
    name: "Sol",
    imageSrc: "/veSneakerSol.png",
    design: 1,
    tagline: "A solar flare built for the next run.",
    capability:
      "Rare runner — the accessible entry point. Mines at the rare tier rate, adds +0.8% staking APY when locked, and starts with 45 tab power for a +0.95% ceiling. Forge levels and equipped mods carry it the rest of the way.",
  },
  {
    id: "luna",
    name: "Luna",
    imageSrc: "/veSneakerLuna.png",
    design: 2,
    tagline: "Moonlight metal for the midnight runner.",
    capability:
      "Epic runner — the balanced mid-tier. Mines at the epic tier rate, adds +1.5% staking APY when locked, and starts with 65 tab power for a +1.15% ceiling, with clear headroom to reach the maximum.",
  },
] as const;

export type VeSneakerCatalogEntry = {
  name: string;
  family: VeSneakerFamilyId;
  design: number;
  imageSrc: string;
  rarity: number;
  tier: number;
};

/// Canonical veSneaker catalog. The order MUST match `veSneakerDesigns()` in
/// `scripts/deployment-config.ts`, because the on-chain design index is the
/// array position used by `VeSneakerStore.addDesign`.
export const VE_SNEAKER_CATALOG: readonly VeSneakerCatalogEntry[] = [
  { name: "Astra", family: "astra", design: 0, imageSrc: "/veSneakerAstra.png", rarity: 85, tier: 3 },
  { name: "Sol", family: "sol", design: 1, imageSrc: "/veSneakerSol.png", rarity: 45, tier: 1 },
  { name: "Luna", family: "luna", design: 2, imageSrc: "/veSneakerLuna.png", rarity: 65, tier: 2 },
] as const;

export function veSneakerFamilyById(id: string | null | undefined) {
  return VE_SNEAKER_FAMILIES.find((family) => family.id === id?.toLowerCase());
}

export function veSneakerArtworkByDesign(design: number, legacy = false) {
  const legacyFamilies: readonly VeSneakerFamilyId[] = ["astra", "sol", "luna", "astra", "sol", "luna", "astra"];
  const familyId = legacy ? legacyFamilies[design] : VE_SNEAKER_FAMILIES.find((family) => family.design === design)?.id;
  return VE_SNEAKER_FAMILIES.find((family) => family.id === (familyId ?? "astra")) ?? VE_SNEAKER_FAMILIES[0];
}

export const VE_TIER_LABEL: readonly VeSneakerRarity[] = ["Common", "Rare", "Epic", "Mythic"];
export const VE_TIER_BOOST: readonly string[] = ["+0.5% APY", "+0.8% APY", "+1.5% APY", "+1.8% APY"];

/// Fallback prices (POL) used when the store contract is not configured.
/// These mirror the `veSneakerPricesPol()` defaults. The on-chain design price
/// always wins when the store is live.
///
///   Sol   (Rare)   1,500 POL
///   Luna  (Epic)   2,100 POL
///   Astra (Mythic) 3,000 POL
///
/// Tier 0 is unused by the genesis catalog; it is kept priced so a future
/// Common design has a sane default.
export const VE_FALLBACK_PRICE_POL: Record<number, string> = {
  0: "1000",
  1: "1500", // Sol   (~$146 at POL = $0.09764)
  2: "2100", // Luna  (~$205)
  3: "3000", // Astra (~$293)
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
