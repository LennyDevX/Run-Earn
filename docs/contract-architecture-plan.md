# RUN&EARN Contract Architecture Plan

> Current architecture — August 2026
> Target: Polygon Amoy (testnet) → Polygon Mainnet
> Toolchain: Hardhat 3, Solidity 0.8.36, OpenZeppelin Contracts 5.6, viem 2, The Graph Studio

## Contract rename map

| Retired name | Current name | File | Purpose |
| --- | --- | --- | --- |
| `SneakerCollection` | `SneakerMint` | `contracts/SneakerMint.sol` | ERC-721 minting for AI-generated sneaker artwork (tiers 0–3) |
| `SneakerRewards` / `LaceToken` / `RuneToken` / `RUNEToken` | `RENToken` | `contracts/RENToken.sol` | ERC-20 REN reward token (symbol `REN`) |
| `SneakerStaking` | `SneakerStaking` | `contracts/SneakerStaking.sol` | Native POL vault with rarity-based NFT APY boosts |
| — | `SneakerAppraiser` | `contracts/SneakerAppraiser.sol` | Read-only NFT valuation contract (POL estimates) |
| — | `SneakerMarketplace` | `contracts/SneakerMarketplace.sol` | Multi-collection fixed-price sales, English auctions, and escrowed POL offers |
| — | `SneakerGame` | `contracts/SneakerGame.sol` | Power/health/energy gamification with virtual veRUNE points redeemable for REN |
| — | `VeSneakerStore` | `contracts/VeSneakerStore.sol` | Primary sale of virtual sneakers (veSneakers) for POL, minted on demand |
| — | `ISneakerBoosts` | `contracts/ISneakerBoosts.sol` | Shared boost read interface consumed by game, staking, appraiser, marketplace |
| — | `SneakerMods` | `contracts/SneakerMods.sol` | ERC-721 mod/badge collection with on-chain achievement claims |
| — | `SneakerWorkshop` | `contracts/SneakerWorkshop.sol` | Seven-slot equip system, consumable ability NFTs, and the veRUNE forge |
| — | `SneakerSwap` | `contracts/SneakerSwap.sol` | Atomic NFT↔NFT trades (± POL) across collections |
| — | `ModRental` | `contracts/ModRental.sol` | Time-boxed mod rentals paid in POL, workshop-aware |
| — | `ModStore` | `contracts/ModStore.sol` | Primary sale of premium mod designs (including consumables) |
| — | `PlayerProgress` | `contracts/PlayerProgress.sol` | On-chain player XP/levels from live protocol state + public username/NFT-avatar identity |

## Current Phase 1 foundation

### `SneakerMint.sol`

- `mintAuthorized` is the production verifier path.
- `mintWithProof` is the explicitly gated Amoy/beta path.
- Proof hashes are nonzero and single-use.
- Rarity is bounded `0..100`; tier is bounded `< 4` (Common, Rare, Epic, Mythic).
- The frontend uses `NEXT_PUBLIC_SNEAKER_MINT_ADDRESS`.
- Raw photos and personal data remain off-chain.

### `RENToken.sol`

- ERC-20 name `Run and Earn Rune`, symbol `REN`, decimals `18`.
- `MAX_SUPPLY` is 100M REN.
- `MINTER_ROLE` controls minting.
- Transfers and minting are pausable.
- This token remains available for the legacy NFT reward path.

### `SneakerStaking.sol`

The vault supports two accounting paths:

1. **Native POL path:** users call `depositPOL()`, receive passive POL rewards, and call `withdrawPOL()` after the lock period.
2. **NFT boost path:** users call `stake(tokenId)` — a **manual action**. The vault reads `SneakerMint.traitsOf(tokenId)`, stores the exact receipt, and increases the effective APY for the user's POL position. The NFT is custodied by the vault until `unstake(tokenId)` is called after the lock period.

Current default economics are 2.80% base APY (reduced by 30% for sustainability), rarity-based tier boosts `[50, 80, 150, 180]` bps (Common +0.5%, Rare +0.8%, Epic +1.5%, Mythic +1.8%), 0% flat per-NFT bonus, 8% maximum APY, and a 30-day minimum lock cycle. The admin must fund the POL reward reserve with `fundPOLRewards()`. Claims can never consume `totalPOLPrincipal`.

### `SneakerAppraiser.sol`

- Read-only contract that estimates the POL value of a SneakerMint NFT.
- Formula: `(baseValue + tierValues[tier] + effectiveRarity * rarityWeight) * globalMultiplierBps / 10_000`, where effective rarity adds the forge `rarityBonus` and the value is then scaled by the equipped Skin `appraisalBonusBps` — both read live from the workshop via `setBoosts`.
- All parameters are admin-configurable via `updateParams()`.
- `appraise(tokenId)` reads traits from `SneakerMint` and returns `(estimatedValue, rarity, tier)`.
- `appraiseRaw(rarity, tier)` returns an estimate without requiring an existing NFT.
- The contract does not execute trades or transfers — it is purely informational.

The legacy RUNE NFT reward path (`claimRewards`) remains for compatibility, but it is separate from POL rewards.

### `SneakerGame.sol` — power / health / energy

- **Power** scales the tier base rate by effective rarity: `powerBps = 5000 + rarity × 100` (r50 = 1.0x, r100 = 1.5x); forge rarity counts.
- **Health** is durability that decays 1 unit per `HEALTH_DECAY_PERIOD` (1 day) of real time plus wear per activation. Accrual is capped at the death timestamp (`lastDecayAt + remainingHealth × 24h`); at 0 the sneaker is worn out and cannot activate.
- **Energy** capacity = `2 + effectiveRarity / 20`, refilled to max on each manual `activate`; spent by workshop abilities through `spendEnergy` (workshop-only, like `repairFromWorkshop`, `activateFromWorkshop`, `spendPoints`).
- Views `powerOf`, `healthOf`, `energyOf`, `maxEnergyOf`, `earnRatePerSecond`, `pendingPoints` are all decay-aware; `sneakers(tokenId)` returns 8 fields including `lastDecayAt` and `energy`.

### Upgrade economy (v1.0)

- `SneakerMods.sol`: ERC-721 mods/badges with `ModTraits{slot, rarity, tier, effectBps, aux, consumable, proofHash}`. Seven slots: Sole (−wear), Upper (+earn rate), Lining (−repair cost), Skin (+appraisal, `aux` = design override), Core (auto-activation), Boost (+staking APY), Skill (passive +earn rate from level-gated skill NFTs). Achievements are claimable on-chain against verifiable state (streak, lifetime veRUNE, NFT balance, POL staked, `ReqKind.PlayerLevel` via `PlayerProgress.levelOf`).
- `SneakerWorkshop.sol`: escrows equipped mods (one per slot), exposes `ISneakerBoosts` (`skillBonusBps` folds the slot-6 passive into `earnBonusBps`), runs `forge` (burns veRUNE via `game.spendPoints` for permanent +rarity/+earn), and `useAbility` which **burns a consumable mod NFT** per use — `aux` selects the ability: `0`/`255` repair kit (free), `1` surge (instant activation, 2⚡), `2` boost capsule (+`effectBps` earn for 24h, 1⚡), `3` forge stone (free level, 2⚡), `4` Overdrive (+`effectBps` earn for 48h, 3⚡), `5` Stim pack (instant energy refill via `game.refillEnergyFromWorkshop`, free), `6` Lucky repair (full health + `effectBps` boost for 24h, 1⚡).
- `SneakerMarketplace.sol`: collection-aware V2 — `list(collection, tokenId, price)`, auctions, and POL offers work for sneakers and mods; locks are keyed by `(collection, tokenId)`; staked NFTs and sneakers with equipped mods cannot be listed.
- `SneakerSwap.sol`: atomic NFT↔NFT swaps with optional POL top-up, any allowed collection pair.
- `ModRental.sol`: owners list mods for `pricePerDay` POL; renters prepay and equip via the workshop while custody stays in the rental contract; consumables are not rentable.
- `ModStore.sol`: catalog of premium mod designs minted on demand for POL (store holds `MINTER_ROLE` on SneakerMods), including consumable designs via the `aux`/`consumable` fields. `ModDesign.requiredLevel` gates purchases by `PlayerProgress.levelOf` — the paid path for extra skill copies.
- `PlayerProgress.sol`: deterministic XP/levels aggregated from live protocol state — sneaker balance ×100, mod balance ×40, `game.lifetimeEarned`/1,000 ×10, `marketplace.tradesCount` ×60, `workshop.actionsCount` ×30, staked POL principal ×20 — mapped onto a 10-tier threshold table (`0 → 21,000`). Also hosts the public profile half: `setUsername` (3–20 bytes) and `setNftAvatar` (ownership-verified pointer); uploaded images stay client-side. Levels are live standing — selling NFTs or unstaking POL lowers them. See [`player-progression.md`](player-progression.md).

**POL formula:**

```text
effective_apy_bps = min(
  base_apy_bps + locked_count * per_nft_bonus_bps
    + sum(tier_bonus_bps + workshop_staking_boost_bps),
  max_apy_bps
)
pol_rewards = pol_principal * effective_apy_bps * elapsed_seconds
  / (10_000 * 31_536_000)
```

The workshop term comes from Boost-slot mods equipped on each locked sneaker
(`ISneakerBoosts.stakingBoostBps`), read live when `boosts` is set.

**Custody invariants:**

- `safeTransferFrom` and `IERC721Receiver` protect NFT custody.
- `stakedTokenIds(owner)` provides an enumerable unlock path.
- `stakedOwner` and receipts preserve exact depositor/token relationships.
- `ReentrancyGuard`, checks-effects-interactions, integer accounting, and `SafeERC20` are required.
- Withdrawals and NFT unlocks remain available during pause for fund safety.

## Subgraph and frontend

The deployed Subgraph Studio project is `nuxgraph` version `0.1.0` on Polygon. The app uses a server-only `/api/subgraph` proxy. Configure `THE_GRAPH_QUERY_URL` or `THE_GRAPH_QUERY_API_KEY` plus slug/version; never place a deploy key or query key in `NEXT_PUBLIC_*` variables.

The `/staking` route shows:

- POL principal.
- Pending POL earnings.
- Effective APY.
- Locked sneaker count.
- POL reward reserve.
- Deposit, withdrawal, and claim controls.
- Owned NFTs available to lock.
- Locked NFTs available to unlock.
- Recent indexed activity from the subgraph plus locally confirmed transactions.

The adapter introspects the configured schema and normalizes address-indexed deposit, withdrawal, claim, stake, and unstake entities. Complete history requires the subgraph mappings to index `POLDeposited`, `POLWithdrawn`, `POLRewardsClaimed`, `Staked`, and `Unstaked`.

## Phase 2 — Advanced features

- `SneakerVault` benefits vault for discounts, early access, offers, and gifts.
- Treasury/fee splitter with explicit reserve allocations.
- Epoch-based accounting only after economic review.
- Optional compounding only after solvency analysis.
- Store integration and verifier registry.

## Phase 3 — Governance and scale

- Timelocked APY/tier/treasury changes.
- Multisig administration before mainnet.
- Protected upgradeability only if justified.
- Merkle distributions, referrals, quests, and activity attestations.
- Independent smart-contract and economic review.

## Deployment order

`DEPLOY_TARGET=all` in `scripts/deploy.ts` deploys in dependency order and runs the
post-deploy wiring automatically:

1. `RENToken` → `SneakerMint` → `SneakerStaking` → `SneakerAppraiser` → `SneakerMarketplace` → `SneakerGame` → `SneakerMods` → `SneakerWorkshop` → `SneakerSwap` → `ModRental` → `ModStore` → `VeSneakerStore` → `PlayerProgress`.
2. Wiring: `game.setBoosts/setWorkshop`, `staking.setBoosts`, `appraiser.setBoosts`,
   `mods.setWorkshop`, `workshop.setRentalSource`,
   `marketplace.setWorkshop/setCollectionAllowed(mods)`,
   `swap.setCollectionAllowed(mods)`, `mods.grantRole(MINTER_ROLE, modStore)`,
   `nft.grantRole(MINTER_ROLE, veStore)`, `mods.setProgress`,
   `modStore.setProgress`, `veStore.setProgress`.
3. Fund the POL reward reserve (`scripts/fund-staking.ts`) and the veRUNE redemption pool.
3b. Seed the level-gated skill catalog (`scripts/seed-skills.ts` — achievements + store copies).
4. Configure frontend contract addresses and server-only Graph query settings.
5. Test `/staking`, `/marketplace`, `/game`, `/workshop`, `/badges`, and `/profile` on Polygon Amoy with a disposable wallet.
6. Verify subgraph activity after indexing.
7. Use multisig administration and deterministic artifacts before mainnet.
