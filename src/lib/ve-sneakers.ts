export type VeSneakerRarity = "Common" | "Rare" | "Epic" | "Mythic";

export type VeSneakerFamilyId = "astra" | "sol" | "luna";

export type VeSneakerFamily = {
  id: VeSneakerFamilyId;
  name: string;
  imageSrc: string;
  design: number;
  tagline: string;
};

export const VE_SNEAKER_FAMILIES: readonly VeSneakerFamily[] = [
  { id: "astra", name: "Astra", imageSrc: "/veSneakerAstra.png", design: 0, tagline: "A violet signal from beyond the grid." },
  { id: "sol", name: "Sol", imageSrc: "/veSneakerSol.png", design: 1, tagline: "A solar flare built for the next run." },
  { id: "luna", name: "Luna", imageSrc: "/veSneakerLuna.png", design: 2, tagline: "Moonlight metal for the midnight runner." },
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
