import type { Address } from "viem";

/// Workshop slot metadata for the upgrade economy (SneakerMods/SneakerWorkshop).

export const SLOT_COUNT = 6;
export const NO_AUX = 255;

export type SlotInfo = {
  id: number;
  key: string;
  label: string;
  icon: string;
  area: string;
  effect: string;
};

export const SLOTS: readonly SlotInfo[] = [
  {
    id: 0,
    key: "sole",
    label: "Sole",
    icon: "👟",
    area: "Outsole & cushioning",
    effect: "Reduces durability wear per activation",
  },
  {
    id: 1,
    key: "upper",
    label: "Upper",
    icon: "🧵",
    area: "Lightweight materials",
    effect: "Raises the veRUNE earn rate — lighter sneaker, faster mining",
  },
  {
    id: 2,
    key: "lining",
    label: "Lining",
    icon: "🧦",
    area: "Comfort interior",
    effect: "Discounts the veRUNE repair cost",
  },
  {
    id: 3,
    key: "skin",
    label: "Skin",
    icon: "🎨",
    area: "Design & colorway",
    effect: "Raises the appraiser valuation and restyles the sneaker",
  },
  {
    id: 4,
    key: "core",
    label: "Core",
    icon: "⚡",
    area: "Auto-activation module",
    effect: "Keeps the sneaker earning without manual activation",
  },
  {
    id: 5,
    key: "boost",
    label: "Boost",
    icon: "🚀",
    area: "Staking amplifier",
    effect: "Adds APY while the sneaker is locked in staking",
  },
] as const;

export function slotInfo(slot: number): SlotInfo {
  return SLOTS[slot] ?? SLOTS[0];
}

export type ModTraits = {
  slot: number;
  rarity: number;
  tier: number;
  effectBps: number;
  aux: number;
  consumable: boolean;
  proofHash: `0x${string}`;
};

export type OwnedMod = {
  tokenId: bigint;
  traits: ModTraits;
};

/// Consumable ability kinds (SneakerWorkshop ABILITY_* / aux field).
export const ABILITY_LABELS: Record<number, string> = {
  0: "Repair kit — full health restore, burns on use",
  1: "Surge — instant activation, bypasses cooldown (2 energy)",
  2: "Boost capsule — temporary earn-rate boost for 24h (1 energy)",
  3: "Forge stone — free forge level (2 energy)",
};

/// Human-readable effect label for a mod's traits.
export function modEffectLabel(traits: ModTraits): string {
  if (traits.consumable) {
    const kind = traits.aux === NO_AUX ? 0 : traits.aux;
    if (kind === 2) {
      return `Boost capsule — +${(traits.effectBps / 100).toFixed(1)}% earn for 24h (1 energy)`;
    }
    return ABILITY_LABELS[kind] ?? "Consumable — burns on use";
  }
  const pct = `${(traits.effectBps / 100).toFixed(1)}%`;
  switch (traits.slot) {
    case 0:
      return `-${pct} wear per activation`;
    case 1:
      return `+${pct} earn rate`;
    case 2:
      return `-${pct} repair cost`;
    case 3:
      return `+${pct} appraisal value`;
    case 4:
      return "Auto-activation every 24h";
    case 5:
      return `+${pct} staking APY`;
    default:
      return `Effect ${pct}`;
  }
}

/// Achievement requirement kinds (SneakerMods.ReqKind order).
export const REQ_KIND_LABELS = [
  "Daily streak",
  "Lifetime veRUNE",
  "Collection size",
  "POL staked",
] as const;

export type WorkshopBonusSnapshot = {
  earnBonusBps: bigint;
  wearReductionBps: bigint;
  maxDurabilityBonusBps: bigint;
  repairDiscountBps: bigint;
  appraisalBonusBps: bigint;
  stakingBoostBps: bigint;
  rarityBonus: number;
  autoActive: boolean;
  skinOverride: number;
  forgeLevel: number;
  nextForgeCost: bigint;
  tempBoostBps: number;
  boostExpiresAt: number;
};

export type ContractAddresses = {
  sneakerMint: Address | null;
  mods: Address | null;
  workshop: Address | null;
  marketplace: Address | null;
  swap: Address | null;
  rental: Address | null;
  modStore: Address | null;
};
