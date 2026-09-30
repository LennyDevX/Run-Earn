/// ─────────────────────────── Mod item catalog ──────────────────────────────
///
/// The item line sold through `ModStore` and equipped in `SneakerWorkshop`.
/// Every entry is a real ERC-721 (`SneakerMods`) with `slot`, `tier`, and
/// `effectBps` traits — the artwork here is the display layer for that NFT.
///
/// ### How an item upgrades a veSneaker
///
/// A veSneaker is an ERC-721 with `rarity` (0–100) and `tier` (0–3). Those two
/// traits drive everything the pair does: the veRUNE it mines per day, the APY
/// boost it adds when locked in staking, and the **power score** that sets the
/// player's ceiling and points-per-tap in the daily tab challenge.
///
/// An item is an **equippable upgrade to one part of that NFT**. It never
/// mutates the base traits — it stacks a live bonus on top, read through
/// `ISneakerBoosts` at accrual time, so unequipping removes the effect on the
/// very next read:
///
/// | Slot | Upgrades | Effect field | Feeds into |
/// | ---- | -------- | ------------ | ---------- |
/// | Sole   | Outsole     | `wearReductionBps`  | Durability — how long the pair keeps mining |
/// | Upper  | Shell       | `earnBonusBps`      | veRUNE earned per second while active |
/// | Lining | Interior    | `repairDiscountBps` | veRUNE cost to repair a worn-out pair |
/// | Skin   | Colorway    | `appraisalBonusBps` | Appraiser valuation + cosmetic override |
/// | Core   | Reactor     | `autoActive`        | Earning window stays open without activating |
/// | Boost  | Thruster    | `stakingBoostBps`   | **Staking APY** while the pair is locked |
/// | Skill  | Processor   | `skillBonusBps`     | Passive earn rate from a level-unlocked skill |
///
/// ### What items do for the tab game and staking
///
/// - **Tab challenge:** every equipped mod adds **+5 power** (`modPowerEach`),
///   up to +35 across the seven slots. Power raises the boost ceiling *and* the
///   points earned per tap, so a fully equipped pair clears the ladder in far
///   fewer taps. Power is capped at 100, and the ceiling is capped at 1.50% —
///   equipping more items can never lift a wallet past the protocol limit.
/// - **Staking:** only the Boost slot touches APY, and it is added to the
///   accrual **before** the `maxApyBps` (8.00%) clamp in `SneakerStaking`. The
///   vault still pays exclusively from its funded reserve, so a stack of items
///   cannot create an unfunded liability — it can only reach the same ceiling
///   faster.
///
/// ### Artwork file convention
///
/// ```text
/// item<N>_<Slot><EffectField><Tier>.png
/// ```
///
/// - `N` — sequential global index across the whole line.
/// - `Slot` — `Sole` · `Upper` · `Lining` · `Skin` · `Core` · `Boost` · `Skill`.
/// - `EffectField` — the contract field the item drives, e.g. `WearReductionBps`.
/// - `Tier` — empty for Common, then `Rare` · `Epic` · `Mythic`.
///
/// All files live in `public/items/` at 500×500 PNG with a transparent
/// background. Generation prompts: `docs/mod-artwork-prompts.md`.
///
/// ### Price ladder
///
/// Each slot is priced off the Sole baseline — **tier sets the price, and every
/// new slot is a step above the last**:
///
/// | Tier   | Sole (base) | Upper (+15%) | Lining (+5%) | Skin (+10%) |
/// | ------ | ----------- | ------------ | ------------ | ----------- |
/// | Common | 100 POL     | 115 POL      | 121 POL      | 133 POL     |
/// | Rare   | 200 POL     | 230 POL      | 242 POL      | 266 POL     |
/// | Epic   | 300 POL     | 345 POL      | 362 POL      | 398 POL     |
/// | Mythic | 450 POL     | 518 POL      | 544 POL      | 598 POL     |
///
/// The on-chain `ModStore` design price always wins when the store is live.
///
/// ### Adding the next items
///
/// Append to `MOD_ITEMS`, keep `slot`/`tier`/`effectBps` in sync with the
/// `ModStore.addDesign` call that registers the same item on-chain, and the
/// gallery picks it up automatically.

export type ModItem = {
  id: string;
  name: string;
  /** SneakerMods SLOT_* index. */
  slot: number;
  /** 0 Common · 1 Rare · 2 Epic · 3 Mythic. */
  tier: number;
  /** 0–100 cosmetic/display score, mirrored on-chain. */
  rarity: number;
  /** Effect magnitude in basis points (slot-dependent, see `mods.ts`). */
  effectBps: number;
  /// Skin slot only: the design index the equipped mod overrides the sneaker
  /// artwork with (`SneakerWorkshop.skinOverride`). Left unset in the catalog —
  /// the on-chain `addDesign` call decides which colorway it maps to.
  aux?: number;
  /** Primary sale price in POL. */
  pricePol: string;
  imageSrc: string;
  description: string;
};

/// Slot 0 — Sole. Upgrades the outsole to slow durability wear, which is the
/// veSneaker's health decay: less wear per activation means a longer earning
/// window between repairs.
export const SOLE_ITEMS: readonly ModItem[] = [
  {
    id: "sole-common",
    name: "Grip Plate",
    slot: 0,
    tier: 0,
    rarity: 30,
    effectBps: 500,
    pricePol: "100",
    imageSrc: "/items/item1_SoleWearReductionBps.png",
    description:
      "Standard outsole swap — matte rubber tread with a single cyan wear strip. Slows the pair's daily durability loss so it keeps mining longer between repairs.",
  },
  {
    id: "sole-rare",
    name: "Vector Tread",
    slot: 0,
    tier: 1,
    rarity: 55,
    effectBps: 800,
    pricePol: "200",
    imageSrc: "/items/item2_SoleWearReductionBpsRare.png",
    description:
      "Cyan-lit traction grooves run the full length over a brushed metal heel plate. Cuts wear per activation further, stretching the streak window on an active runner.",
  },
  {
    id: "sole-epic",
    name: "Flux Sole",
    slot: 0,
    tier: 2,
    rarity: 75,
    effectBps: 1_200,
    pricePol: "300",
    imageSrc: "/items/item3_SoleWearReductionBpsEpic.png",
    description:
      "Violet energy channels between the tread blocks, with a floating midsole segment that absorbs impact before it reaches the sneaker. Wear drops sharply.",
  },
  {
    id: "sole-mythic",
    name: "Apex Cushion",
    slot: 0,
    tier: 3,
    rarity: 92,
    effectBps: 1_800,
    pricePol: "450",
    imageSrc: "/items/item4_SoleWearReductionBpsMythic.png",
    description:
      "Gold-trimmed levitating plate riding a plasma cushion. The strongest wear reduction in the line — a Mythic runner holds its health through long streaks.",
  },
] as const;

/// Slot 1 — Upper. Upgrades the shell to raise the veRUNE the pair mines every
/// second it is inside an active earning window.
///
/// Priced 15% above the matching Sole tier. Effects mirror the Sole ladder so
/// the catalog stays predictable: **tier sets the magnitude, the slot sets what
/// it affects**.
export const UPPER_ITEMS: readonly ModItem[] = [
  {
    id: "upper-common",
    name: "Mesh Shell",
    slot: 1,
    tier: 0,
    rarity: 30,
    effectBps: 500,
    pricePol: "115",
    imageSrc: "/items/Item2_UpperEarnBonusBpsCommon.png",
    description:
      "Plain woven upper — cream mesh with a single mint accent. Lifts the veRUNE the pair mines every second it is active.",
  },
  {
    id: "upper-rare",
    name: "Vector Weave",
    slot: 1,
    tier: 1,
    rarity: 55,
    effectBps: 800,
    pricePol: "230",
    imageSrc: "/items/Item2_UpperEarnBonusBpsRare.png",
    description:
      "Cyan filament threads glow at every seam. A clear step up in earn rate — the everyday pick once your runner is producing veRUNE.",
  },
  {
    id: "upper-epic",
    name: "Flux Weave",
    slot: 1,
    tier: 2,
    rarity: 75,
    effectBps: 1_200,
    pricePol: "345",
    imageSrc: "/items/Item2_UpperEarnBonusBpsEpic.png",
    description:
      "Violet plasma conduits thread the shell and the lace lock tightens on its own. A visible jump in daily veRUNE for the same activation effort.",
  },
  {
    id: "upper-mythic",
    name: "Apex Lattice",
    slot: 1,
    tier: 3,
    rarity: 92,
    effectBps: 1_800,
    pricePol: "518",
    imageSrc: "/items/Item1_UpperEarnBonusBpsMythic.png",
    description:
      "Gold-threaded nano-mesh with light motes drifting off the surface. The strongest earn-rate upper in the line — it compounds with streak and skill bonuses.",
  },
] as const;

/// Slot 2 — Lining. Upgrades the interior to discount the veRUNE cost of
/// repairing a worn-out pair, so upkeep eats less of what the runner produces.
///
/// Priced 5% above the matching Upper tier.
export const LINING_ITEMS: readonly ModItem[] = [
  {
    id: "lining-common",
    name: "Quilt Pad",
    slot: 2,
    tier: 0,
    rarity: 30,
    effectBps: 500,
    pricePol: "121",
    imageSrc: "/items/Item1_LiningRepairDiscountBps.png",
    description:
      "Cream quilted interior with mint stitching and a woven repair sigil. Trims the veRUNE it costs to bring a worn-out pair back to full health.",
  },
  {
    id: "lining-rare",
    name: "Vector Plush",
    slot: 2,
    tier: 1,
    rarity: 55,
    effectBps: 800,
    pricePol: "242",
    imageSrc: "/items/Item1_LiningRepairDiscountBpsRare.png",
    description:
      "Denser padding with mint light seeping between the seams. Repairs get cheaper, so less of your veRUNE goes to upkeep and more to forging.",
  },
  {
    id: "lining-epic",
    name: "Flux Lining",
    slot: 2,
    tier: 2,
    rarity: 75,
    effectBps: 1_200,
    pricePol: "362",
    imageSrc: "/items/Item1_LiningRepairDiscountBpsEpic.png",
    description:
      "Violet stitch-work forms a rune and the padding knits itself shut after every repair. A deep discount on keeping an Epic runner alive.",
  },
  {
    id: "lining-mythic",
    name: "Apex Comfort",
    slot: 2,
    tier: 3,
    rarity: 92,
    effectBps: 1_800,
    pricePol: "544",
    imageSrc: "/items/Item1_LiningRepairDiscountBpsMythic.png",
    description:
      "Gold-trimmed padding with a floating mint sigil. The biggest repair discount in the line — near-free upkeep on the pair you run the hardest.",
  },
] as const;

/// Slot 3 — Skin. Upgrades the colorway: raises the appraiser valuation **and**
/// overrides the sneaker artwork, making it the only slot that changes how the
/// pair looks (`SneakerWorkshop.skinOverride` reads the mod's `aux`).
///
/// Priced 10% above the matching Lining tier.
export const SKIN_ITEMS: readonly ModItem[] = [
  {
    id: "skin-common",
    name: "Greycoat",
    slot: 3,
    tier: 0,
    rarity: 30,
    effectBps: 500,
    pricePol: "133",
    imageSrc: "/items/Item1_SkinAppraisalBonusBpsCosmeticOverride.png",
    description:
      "Entry colorway kit — a matte spray rig with a three-swatch fan. Raises what the appraiser values the pair at and repaints it for the first time.",
  },
  {
    id: "skin-rare",
    name: "Vector Coat",
    slot: 3,
    tier: 1,
    rarity: 55,
    effectBps: 800,
    pricePol: "266",
    imageSrc: "/items/Item2_SkinAppraisalBonusBpsCosmeticOverrideRare.png",
    description:
      "Cyan-toned colorway module. Raises the appraiser valuation further and repaints the pair — the first skin that visibly changes your runner.",
  },
  {
    id: "skin-epic",
    name: "Flux Paint",
    slot: 3,
    tier: 2,
    rarity: 75,
    effectBps: 1_200,
    pricePol: "398",
    imageSrc: "/items/Item3_SkinAppraisalBonusBpsCosmeticOverrideEpic.png",
    description:
      "Iridescent palette wheel with violet pigment curling into a full sneaker outline. A deeper appraisal bump and a stronger restyle on the marketplace.",
  },
  {
    id: "skin-mythic",
    name: "Apex Coat",
    slot: 3,
    tier: 3,
    rarity: 92,
    effectBps: 1_800,
    pricePol: "598",
    imageSrc: "/items/Item4_SkinAppraisalBonusBpsCosmeticOverrideMythic.png",
    description:
      "Holographic palette with a gold nozzle and a spiralling pigment ribbon. The highest appraisal bonus in the line — it directly raises the suggested sale price.",
  },
] as const;

/// Full catalog. Slots 4–6 (Core, Boost, Skill) are drawn next — append them
/// here and the gallery renders them without code changes.
export const MOD_ITEMS: readonly ModItem[] = [
  ...SOLE_ITEMS,
  ...UPPER_ITEMS,
  ...LINING_ITEMS,
  ...SKIN_ITEMS,
];

export const MOD_ITEM_SLOTS: readonly number[] = Array.from(
  new Set(MOD_ITEMS.map((item) => item.slot)),
).sort((a, b) => a - b);

export function modItemsBySlot(slot: number) {
  return MOD_ITEMS.filter((item) => item.slot === slot);
}

export function modItemById(id: string) {
  return MOD_ITEMS.find((item) => item.id === id) ?? null;
}

/// The cheapest item in the catalog — used for the "from X POL" hint.
export function lowestPricePol() {
  return MOD_ITEMS.reduce(
    (lowest, item) => (Number(item.pricePol) < Number(lowest) ? item.pricePol : lowest),
    MOD_ITEMS[0]?.pricePol ?? "0",
  );
}
