---
name: airen-upgrade-economy
description: Build and extend Airen's v1.0 upgrade economy — SneakerMods badges, the seven-slot SneakerWorkshop (incl. passive skill slot), power/health/energy stats, consumable abilities, the 365-day condition cycle, SneakerSwap trades, ModStore, SneakerTabArena, PlayerProgress levels, and the multi-collection marketplace.
---

# Airen Upgrade Economy

Use this skill for anything under the mod/upgrade game loop: `SneakerMods`,
`SneakerWorkshop`, `SneakerSwap`, `ModStore`, `SneakerTabArena`, `ISneakerBoosts`, the
workshop integrations inside `SneakerGame`/`SneakerStaking`/`SneakerAppraiser`/
`SneakerMarketplace`, and the `/workshop`, `/badges`, and mod tabs UI.

## Architecture map

```
SneakerMods (ERC-721) ──equip escrow──▶ SneakerWorkshop ──ISneakerBoosts──▶ SneakerGame
      ▲   ▲                                  │                              SneakerStaking
      │   └────MINTER_ROLE──── ModStore      └──conditionBps──▶ SneakerTabArena · SneakerAppraiser
      │                                                                      SneakerMarketplace
      └──allowedCollections──▶ SneakerMarketplace · SneakerSwap                (hasEquippedMods guard)
```

| Contract | Role |
| --- | --- |
| `SneakerMods` | ERC-721 mod/badge NFTs with `ModTraits` + on-chain achievement claims |
| `SneakerWorkshop` | Seven-slot equip escrow, consumable `useAbility` burns, 365-day condition cycle |
| `PlayerProgress` | XP/levels from live protocol state + on-chain username/NFT-avatar identity |
| `ISneakerBoosts` | Shared view interface: `earnBonusBps`, `wearReductionBps`, `repairDiscountBps`, `appraisalBonusBps`, `stakingBoostBps`, `autoActive`, `hasEquippedMods` |
| `SneakerSwap` | Atomic NFT↔NFT offers ± POL top-up, open or targeted taker |
| `ModStore` | Primary sale of premium/consumable mod designs (`addDesign(ModDesign)` struct, `buy`/`buyBatch`) |
| `SneakerVault` | Live-state perks: store discounts (`bestDiscountBps`) and one-time access claims; linked via `setVault` |
| `FeeSplitter` | Pro-rata POL fee distribution (marketplace fees) to weighted recipients |

## SneakerMods

```solidity
struct ModTraits {
    uint8 slot;        // SLOT_* — which slot the mod fills
    uint8 rarity;      // 0..100, cosmetic/display
    uint8 tier;        // 0..3 (Common, Rare, Epic, Mythic)
    uint16 effectBps;  // effect magnitude in bps (slot-dependent)
    uint8 aux;         // slot-dependent aux (skin: design index; consumable: ability kind)
    bool consumable;   // true = burned on use, can never be equipped
    bytes32 proofHash;
}
```

- `mintAuthorized(to, uri, ModTraits)` — `MINTER_ROLE` (admin + `ModStore`).
- `claim(achievementId, sneakerId)` — mints a badge when the on-chain `Achievement`
  requirement (`ReqKind`, threshold) is met; one claim per wallet per achievement.
- `burnAuthorized` — workshop-only; burns a mod for `useAbility`.
- `equippedTo[modId]` — nonzero while a mod is in workshop escrow; blocks burns/transfers paths that would strand custody.

## Seven slots (SneakerMods.SLOT_*)

| Slot | Name | Effect (read via `ISneakerBoosts`) |
| --- | --- | --- |
| 0 | Sole | `wearReductionBps` — less wear per activation |
| 1 | Upper | `earnBonusBps` — higher earn rate |
| 2 | Lining | `repairDiscountBps` — cheaper veRUNE repairs |
| 3 | Skin | `appraisalBonusBps` + cosmetic override |
| 4 | Core | `autoActive` — earning window never closes while equipped |
| 5 | Boost | `stakingBoostBps` — APY bonus on locked sneakers |
| 6 | Skill | `skillBonusBps` — passive earn bonus from level-gated skill NFTs (folded into `earnBonusBps`) |

`equip(sneakerId, modId)` requires ERC-721 approval on SneakerMods, one mod per
slot, ownership of the sneaker (or active renter). `unequip(sneakerId, slot)`
returns the mod. Consumables revert on equip — they only go through `useAbility`.

## Game stats (SneakerGame)

- **Power** — `powerOf(tokenId)` = `5000 + effectiveRarity × 100` bps (r50 ≈ 1.0x,
  r90 ≈ 1.4x, cap 1.5x at r100). Multiplies `tierBasePointsPerDay`.
- **Health** — `healthOf(tokenId)` = durability − elapsed `HEALTH_DECAY_PERIOD`
  (1/day, tracked by `lastDecayAt`) − activation wear. At 0 the sneaker is dead:
  accrual capped at the death timestamp, `canActivate` false, `earnRatePerSecond` 0.
- **Energy** — `energyOf`/`maxEnergyOf` = `2 + effectiveRarity/20`. Manual
  `activate` refills to max; surge does NOT refill (anti-exploit).

Workshop-only game entry points: `activateFromWorkshop` (surge),
`repairFromWorkshop`, `refillEnergyFromWorkshop` (stim pack), `spendEnergy`,
`spendPoints`. All revert for other callers.

`sneakers(tokenId)` returns **8 fields**: `lastActivationAt`, `lastAccrualAt`,
`streak`, `durability`, `pendingPoints`, `lifetimePoints`, `lastDecayAt`, `energy`.

## Consumable abilities (`workshop.useAbility(sneakerId, modId)`)

Burns the mod every time. Kind = `traits.aux` (`mods.NO_AUX()` → repair):

| aux | Ability | Energy | Effect |
| --- | --- | --- | --- |
| 0 or 255 | Repair kit | 0 | `game.repairFromWorkshop` — full health, no veRUNE |
| 1 | Surge | 2 | `game.activateFromWorkshop` — instant activation, bypasses cooldown, no energy refill |
| 2 | Boost capsule | 1 | `tempBoostBps` += `effectBps` for `BOOST_DURATION` (24h) — stacked into `earnBonusBps` until `boostExpiresAt` |
| 3 | Service kit | 0 | condition restored to pristine (wear does not touch game health) |
| 4 | Overdrive | 3 | `tempBoostBps` += `effectBps` for `OVERDRIVE_DURATION` (48h) |
| 5 | Stim pack | 0 | `game.refillEnergyFromWorkshop` — energy back to max; reverts on a dead sneaker |
| 6 | Lucky repair | 1 | full health + `effectBps` temp boost for 24h |

`lastServiceAt[tokenId]` starts the pair's 365-day season on the first `equip` or
ability use. `conditionBps` decays linearly from 10000 to `conditionFloorBps`
(5000) over `seasonSeconds`; a pair never put to work reads pristine. Consumers
scale rarity by it, so wear drags the earn rate, the appraisal, and the tab
power score down together. The repair kit (aux 0/255) and service kit (aux 3)
restore it. **Mods never expire — the sneaker is what wears.**

## PlayerProgress (levels + skill gating)

`PlayerProgress(admin, nft, mods, game, marketplace, workshop, staking, thresholds)`
aggregates live XP — sneaker balance ×100, mod balance ×40,
`game.lifetimeEarned`/1000 ×10, `marketplace.tradesCount` ×60,
`workshop.actionsCount` ×30, staking POL principal ×20. `levelOf` maps XP to the
threshold table (default `0,300,800,1600,2800,4500,7000,10500,15000,21000` → L10).
Level is **live** — selling NFTs or unstaking POL lowers it.

Skill NFTs ride the existing rails, no new contracts:

- `SneakerMods.ReqKind.PlayerLevel` — `claim` checks `progress.levelOf ≥ threshold`;
  one free claim per wallet per achievement.
- `ModStore.ModDesign.requiredLevel` + `VeSneakerStore.Design.requiredLevel` —
  `buy`/`buyBatch` revert `*: level required` when `progress.levelOf < requiredLevel`
  (`requiredLevel = 0` disables the gate; `setProgress` links the contract).
- Slot 6 (`SLOT_SKILL`) equips a non-consumable skill NFT → `skillBonusBps`.

Also hosts public identity: `setUsername` (3–20 bytes) + `setNftAvatar`
(ownership-verified pointer; uploaded images stay client-side).

## SneakerSwap

`createSwap(taker, offerCollection, offerTokenId, wantCollection, wantTokenId, duration)`
escrows the maker's NFT + `msg.value` POL top-up. `accept(swapId)` moves both
NFTs atomically (taker must own/approve the wanted token); `cancel(swapId)`
returns escrow. `allowedCollections` gates both sides; staked, listed, rented,
and equipped tokens revert via `_requireSwappable`.


## Multi-collection marketplace

All primitives take `collection` first: `list(collection, tokenId, price)`,
`createAuction(collection, tokenId, startPrice, duration)`,
`makeOffer(collection, tokenId, duration)`. Locks live in
`tokenSaleKind[collection][tokenId]`; `allowedCollections` gates which contracts
trade (SneakerMint + SneakerMods after deploy wiring). Sneakers with
`workshop.hasEquippedMods` revert on list/auction — unequip first.
`suggestedPrice` is sneaker-only; mods are market-priced.

## Frontend map

| Piece | Where |
| --- | --- |
| `/workshop` | `ModItemGallery` (item shop) + `WorkshopDashboard` + `useWorkshop` — slot grid, effective stats, condition bar, consumables |
| `/badges` | `BadgesDashboard` + `useBadges` — achievement progress + `claim` |
| `/marketplace` Mods/Rentals/Trades tabs | `ModMarketTabs` + `useModEconomy` |
| `/collection` mod section | `ModStorefront` (`useModEconomy.buyMod`) |
| `/my-nfts` mods section | `MyModsGallery` + `useOwnedMods` |
| Trait/slot helpers | `src/lib/mods.ts` (`WorkshopBonusSnapshot`, slot labels, `PIXEL_MOD_DESIGNS`) |
| ABIs | `src/lib/contracts.ts` (`sneakerModsAbi`, `sneakerWorkshopAbi`, `sneakerSwapAbi`, `modRentalAbi`, `modStoreAbi`) |

UI gotchas:

- Filter `traits.consumable` mods OUT of the equip picker; show them under
  `useAbility` with their energy cost.
- Track `boostExpiresAt` against a `nowSeconds` state updated in `useEffect` —
  `Date.now()` in render trips the lint purity rule.
- Equip is always two txs: `mods.approve(workshop, modId)` then
  `workshop.equip(sneakerId, modId)`.
- Struct/tuple returns from mapping getters are positional — index access, not
  named fields.
- Contract slot semantics are the source of truth: Upper = +earn rate, not max
  durability (an old UI label got this wrong).

## Wiring (deploy order)

`SneakerMods(name, symbol, admin, nft, game, staking)` →
`SneakerWorkshop(admin, nft, mods, game, staking, conditionFloorBps, seasonSeconds)` →
`SneakerSwap(admin, nft, staking, workshop)` →
`ModStore(admin, mods, treasury)`. Post-deploy:

- `game.setBoosts(workshop)` + `game.setWorkshop(workshop)`
- `staking.setBoosts(workshop)`, `appraiser.setBoosts(workshop)`
- `mods.setWorkshop(workshop)`
- `marketplace.setWorkshop(workshop)` + `setCollectionAllowed(mods, true)`
- `swap.setCollectionAllowed(mods, true)`
- `mods.grantRole(MINTER_ROLE, modStore)`
- `mods.setProgress(progress)` + `modStore.setProgress(progress)` +
  `veStore.setProgress(progress)` — required before any level-gated claim/buy
- `modStore.setVault(vault)` + `veStore.setVault(vault)` — enables perk discounts at purchase time (zero address = full price)

## Security invariants

- Equipped/listed/rented/staked NFTs can never be double-sold, burned, or swapped.
- `useAbility` always burns; energy cost always charged; boosts always expire.
- Renter can equip but never transfer/withdraw; owner cannot pull an active rental.
- Only the workshop calls `spendEnergy`/`repairFromWorkshop`/`spendPoints`/
  `activateFromWorkshop` — verify `setWorkshop`/`setBoosts`
  are admin-only.
- Surge must never refill energy; dead sneakers must not earn, activate, or be
  auto-activated by a Core mod.

## Testing

- Solidity: `test/SneakerMods.t.sol`, `test/SneakerWorkshop.t.sol`,
  `test/SneakerSwap.t.sol`, `test/ModStore.t.sol`, `test/SneakerTabArena.t.sol`,
  `test/PlayerProgress.t.sol` (XP, levels, identity, level-gated claims),
  `test/SneakerMarketplace.t.sol` (multi-collection + equipped guard).
- Mocha: `test/upgrade-economy.ts` covers the full loop end-to-end.
- Trap: `mods.SLOT_SOLE()` as a `vm.prank`-scoped call argument consumes the
  prank — use literal slot constants in tests.
- Tuple destructures of `game.sneakers()` need all 8 components.
- Commands: `npx hardhat compile`, `npx hardhat test`, `npm run lint`,
  `npm run typecheck`, `npm run build`.

Related skills: `polygon-contracts` (base architecture), `polygon-testing`
(test matrix), `polygon-security` (review checklist), `polygon-frontend-evm`
(route/hook conventions), `airen-subgraph-activity` (event feeds).
