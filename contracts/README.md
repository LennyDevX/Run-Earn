# Polygon EVM contracts

Current foundation: Solidity 0.8.36, Hardhat 3, OpenZeppelin Contracts 5.6.

## Contracts

| Contract | File | Purpose |
| --- | --- | --- |
| `SneakerMint` | `SneakerMint.sol` | ERC-721 minting for AI-generated sneaker artwork (tiers 0–3: Common, Rare, Epic, Mythic) |
| `RENToken` | `RENToken.sol` | ERC-20 reward token `REN` with 100M supply cap |
| `SneakerStaking` | `SneakerStaking.sol` | Native POL staking with rarity-based sneaker NFT APY boosts |
| `SneakerAppraiser` | `SneakerAppraiser.sol` | Read-only NFT valuation contract (POL value estimates) |
| `SneakerMarketplace` | `SneakerMarketplace.sol` | Fixed-price sales, English auctions, and POL offers |
| `SneakerGame` | `SneakerGame.sol` | Daily-activation gamification with virtual veRUNE points redeemable for REN |
| `VeSneakerStore` | `VeSneakerStore.sol` | On-demand primary sale of virtual sneakers (veSneakers) for POL |
| `ISneakerBoosts` | `ISneakerBoosts.sol` | Shared boost interface implemented by the workshop and read by game/staking/appraiser/marketplace |
| `SneakerMods` | `SneakerMods.sol` | ERC-721 upgrade/badge collection with on-chain achievement claims |
| `SneakerWorkshop` | `SneakerWorkshop.sol` | Seven-slot mod equipment (6 upgrade slots + passive skill slot), consumable abilities, and the 365-day condition cycle |
| `SneakerSwap` | `SneakerSwap.sol` | Atomic NFT↔NFT trades (± POL) across approved collections |
| `ModRental` | `ModRental.sol` | Time-boxed mod rentals paid in POL, workshop-aware |
| `ModStore` | `ModStore.sol` | On-demand primary sale of premium mod designs for POL |
| `PlayerProgress` | `PlayerProgress.sol` | On-chain player XP/levels across the protocol + public username/NFT-avatar identity |

## Current staking behavior

- `depositPOL()` accepts native POL and records user principal.
- `withdrawPOL(amount)` returns principal after the minimum lock period.
- `fundPOLRewards()` adds POL to the admin-controlled reward reserve.
- `claimPOLRewards()` pays POL only from reserve liquidity above `totalPOLPrincipal`.
- `stake(tokenId)` is a **manual action** — reads on-chain rarity/tier from `SneakerMint` and increases the user's effective APY. The NFT is custodied by the vault.
- `stakedTokenIds(owner)` provides the exact NFT list needed by the unlock UI.
- The legacy NFT RUNE reward path remains available through `claimRewards`.

Default economics are 2.80% base APY (sustainable rate), rarity-based tier boosts `[50, 80, 150, 180]` bps (Common +0.5%, Rare +0.8%, Epic +1.5%, Mythic +1.8%), 0% flat per-NFT bonus, 8% maximum APY, and a 30-day minimum lock. See [`docs/polygon-staking-model.md`](../docs/polygon-staking-model.md).

## NFT valuation (SneakerAppraiser)

- `appraise(tokenId)` returns `(estimatedValue, rarity, tier)` for an existing NFT.
- `appraiseRaw(rarity, tier)` returns an estimate without requiring an existing NFT.
- Formula: `(baseValue + tierValues[tier] + rarity * rarityWeight) * globalMultiplierBps / 10_000`.
- All parameters are admin-configurable via `updateParams()`.
- The contract is read-only — it does not execute trades or transfers.

## Marketplace (SneakerMarketplace)

- Fixed-price listings (`list`/`buy`/`cancelListing`), English auctions (`createAuction`/`bid`/`settleAuction`), and escrowed POL offers (`makeOffer`/`acceptOffer`/`cancelOffer`).
- All payments in native POL; a 2.5% fee (`feeBps`) accrues to the fee collector.
- NFTs locked in `SneakerStaking` cannot be listed or auctioned (`stakedOwner` check).
- `suggestedPrice(tokenId)` = appraiser valuation × `appraiserPremiumBps`.
- `valueRecommendations(tokenId)` returns on-chain tips for increasing an NFT's value.

## Gamification (SneakerGame)

Every veSneaker has three live stats:

- **Power** — the daily veRUNE mining rate: `tierBasePointsPerDay[tier] × (50% + effectiveRarity%)`. Rarity 50 ≈ 1.0x; live condition scales the rarity, so wear lowers power until the pair is serviced.
- **Health** — remaining "days of life". Health decays 1 point per `HEALTH_DECAY_PERIOD` (24h) of real time since `lastDecayAt`, plus wear on each activation. At 0 the sneaker is worn out: accrual stops (capped at the death timestamp) and it cannot activate until repaired — with veRUNE (`repair`, Lining discount applies) or a burned repair-kit NFT (`repairFromWorkshop`, workshop only).
- **Energy** — charges spent on consumable abilities via `SneakerGame.spendEnergy` (workshop only). Capacity = `2 + effectiveRarity / 20`; every manual `activate` refills it to max.

- `activate(tokenId)` every 24h starts an earning window; daily streaks add +1% per day (cap +50%).
- Points accrue per second by tier: Common 100, Rare 200, Epic 400, Mythic 800 veRUNE/day (before power).
- Live views: `powerOf`, `healthOf`, `energyOf`, `maxEnergyOf`, `earnRatePerSecond`, `pendingPoints` (all decay-aware).
- veRUNE is virtual (contract state, not an ERC-20). `redeem(points)` converts veRUNE to REN at `redemptionRate` once the admin funds the pool and enables redemption.
- See [`docs/veRune-tokenomics.md`](../docs/veRune-tokenomics.md) for the full tokenomics design.

## veSneaker store (VeSneakerStore)

- veSneakers are the playable NFTs of the virtual sneaker economy — bought with POL.
- `buy(designIndex)` / `buyBatch(designIndex, quantity)` mint on demand through `SneakerMint.mintAuthorized`; the store holds `MINTER_ROLE`.
- Prices are USD targets converted at `POL_USD_PRICE`: $40 (Common) → $150 (Mythic), geometric progression — 410 / 635 / 993 / 1536 POL at POL = $0.09764. Supply default 1000 per design.
- `reserveMint` allocates copies to the treasury without payment, counting against supply.
- Configure the initial Astra, Sol, and Luna designs with `VE_MINT_MODE=configure npx hardhat run scripts/mint-veSneakers.ts --network amoy`; set `VE_SNEAKER_ASSET_BASE_URL` to the public HTTPS origin first so NFT metadata points to real PNGs.
- For an existing store, `VE_UPDATE_DESIGN_URIS=true` opts into updating the first three design URIs; it affects future mints only because already minted token URIs are stored per token.

## Upgrade economy (v1.0)

- **SneakerMods** — ERC-721 mods/badges with `ModTraits { slot, rarity, tier, effectBps, aux, consumable, proofHash }`. Seven slots: 0 Sole (−wear), 1 Upper (+earn rate), 2 Lining (−repair cost), 3 Skin (+appraisal, cosmetic), 4 Core (auto-activation), 5 Boost (+staking APY), 6 Skill (passive earn bonus from level-gated skill NFTs). Consumable mods burn on use. Achievements are claimed on-chain against verifiable state (streak, lifetime veRUNE, NFT balance, POL staked, `ReqKind.PlayerLevel` via `PlayerProgress.levelOf`) — one claim per wallet each; level-gated claims are the free skill mint.
- **SneakerWorkshop** — implements `ISneakerBoosts`. `equip`/`unequip` escrow one mod per slot; `conditionBps(tokenId)` decays over a 365-day season and scales the pair's rarity. `useAbility(sneakerId, modId)` burns any consumable mod and applies its ability by `aux`: `0`/`255` repair kit (free full restore), `1` surge (instant activation, bypasses cooldown — 2⚡), `2` boost capsule (+`effectBps` earn for 24h — 1⚡), `3` service kit (condition restored to pristine — free), `4` Overdrive (+`effectBps` earn for 48h — 3⚡), `5` Stim pack (instant energy refill — free, reverts on a dead sneaker), `6` Lucky repair (full restore + `effectBps` boost for 24h — 1⚡). Energy costs are enforced through `SneakerGame.spendEnergy`; the Stim pack refills through `SneakerGame.refillEnergyFromWorkshop`. `skillBonusBps` exposes the slot-6 passive contribution (already folded into `earnBonusBps`). The game, staking, appraiser, marketplace, and swap read effects through the shared interface.
- **SneakerMarketplace (V2)** — collection-aware: `list(collection, tokenId, price)`, `createAuction(collection, ...)`, `makeOffer(collection, ...)`, locks keyed by `(collection, tokenId)`. `allowedCollections` gates which NFT contracts trade; sneakers with equipped mods cannot be listed or auctioned.
- **SneakerSwap** — `createSwap` escrows the maker's NFT (+ optional POL) for a specific or open taker; `accept` settles both legs atomically; `cancel` returns escrow. Any approved collection pair.
- **ModRental** — owners `list` a mod for `pricePerDay` POL; renters prepay for a fixed duration, equip via `equipRented` (custody stays in the rental contract), and `returnExpired` settles after expiry. Equipped mods cannot be listed.
- **ModStore** — catalog of premium designs minted on demand through `SneakerMods.mintAuthorized` (the store holds `MINTER_ROLE`). Proceeds go to the treasury. `ModDesign.requiredLevel` gates purchases by `PlayerProgress.levelOf` — this is how extra copies of a claimed skill are sold at accessible POL prices. `VeSneakerStore.Design.requiredLevel` applies the same gate to exclusive sneaker drops; `setDesignRequiredLevel` / `setProgress` are admin-only.
- **PlayerProgress** — aggregates verifiable activity into a 10-tier player level. XP signals: owned veSneakers (×100), owned mods (×40), lifetime claimed veRUNE (`SneakerGame.lifetimeEarned`, 10 XP per 1,000), completed marketplace trades (`SneakerMarketplace.tradesCount`, ×60 — both sides), workshop actions (`SneakerWorkshop.actionsCount`, ×30 — equip/unequip/ability), and live POL staking principal (×20 per POL). Levels are derived from live state, so selling NFTs or withdrawing POL can lower them. Also hosts the public half of the hybrid profile: `setUsername` (3–20 bytes) and `setNftAvatar` (ownership-verified pointer); uploaded images stay client-side. Thresholds: `PROGRESS_LEVEL_THRESHOLDS`, default `0,300,800,1600,2800,4500,7000,10500,15000,21000`.
- **Deployment order:** mint → staking → appraiser → marketplace → game → mods → workshop → swap → rental → modStore → veStore → progress, then wiring: `game.setBoosts/setWorkshop`, `staking.setBoosts`, `appraiser.setBoosts`, `mods.setWorkshop`, `workshop.setRentalSource`, `marketplace.setWorkshop/setCollectionAllowed(mods)`, `swap.setCollectionAllowed(mods)`, `mods.grantRole(MINTER_ROLE, modStore)`, `nft.grantRole(MINTER_ROLE, veStore)`, `mods.setProgress`, `modStore.setProgress`, `veStore.setProgress`.

## Frontend and subgraph

The staking UI is at `/staking`. Contract addresses use:

```env
NEXT_PUBLIC_SNEAKER_MINT_ADDRESS=
NEXT_PUBLIC_REWARD_TOKEN_ADDRESS=
NEXT_PUBLIC_STAKING_VAULT_ADDRESS=
NEXT_PUBLIC_SNEAKER_APPRAISER_ADDRESS=
NEXT_PUBLIC_SNEAKER_MARKETPLACE_ADDRESS=
NEXT_PUBLIC_SNEAKER_GAME_ADDRESS=
NEXT_PUBLIC_SNEAKER_MODS_ADDRESS=
NEXT_PUBLIC_SNEAKER_WORKSHOP_ADDRESS=
NEXT_PUBLIC_SNEAKER_SWAP_ADDRESS=
NEXT_PUBLIC_MOD_RENTAL_ADDRESS=
NEXT_PUBLIC_MOD_STORE_ADDRESS=
NEXT_PUBLIC_PLAYER_PROGRESS_ADDRESS=
```

The deployed The Graph Studio project is `nuxgraph` version `0.1.0`. Configure its server-only query endpoint/API key for `/api/subgraph`; see [`docs/subgraph-integration.md`](../docs/subgraph-integration.md). The Graph deploy key is not a query API key and must never be committed.

## Before deploying

1. Run Solidity and TypeScript tests with `npx hardhat test`.
2. Verify POL reserve solvency, partial/full withdrawals, NFT boosts, lock periods, pause controls, and emergency recovery.
3. Compile with `npx hardhat compile`.
4. Deploy to Polygon Amoy with a disposable deployer.
5. Fund the POL reward reserve using `fundPOLRewards()` and document the budget.
6. Configure the frontend addresses and server-only subgraph settings.
7. Use multisig/admin separation before Polygon mainnet.
8. Obtain an independent smart-contract and economic security review.

## Deployment scripts

The scripts live in `scripts/`:

```bash
# Deploy and verify all contracts
DEPLOY_TARGET=all npx hardhat run scripts/deploy.ts --network amoy

# Deploy and verify one contract
DEPLOY_TARGET=RENToken npx hardhat run scripts/deploy.ts --network amoy
DEPLOY_TARGET=SneakerMint npx hardhat run scripts/deploy.ts --network amoy
DEPLOY_TARGET=SneakerStaking RUNE_TOKEN_ADDRESS=0x... SNEAKER_MINT_ADDRESS=0x... npx hardhat run scripts/deploy.ts --network amoy
DEPLOY_TARGET=SneakerAppraiser SNEAKER_MINT_ADDRESS=0x... npx hardhat run scripts/deploy.ts --network amoy
DEPLOY_TARGET=SneakerMarketplace SNEAKER_MINT_ADDRESS=0x... SNEAKER_APPRAISER_ADDRESS=0x... STAKING_VAULT_ADDRESS=0x... npx hardhat run scripts/deploy.ts --network amoy
DEPLOY_TARGET=SneakerGame SNEAKER_MINT_ADDRESS=0x... RUNE_TOKEN_ADDRESS=0x... npx hardhat run scripts/deploy.ts --network amoy
DEPLOY_TARGET=VeSneakerStore SNEAKER_MINT_ADDRESS=0x... npx hardhat run scripts/deploy.ts --network amoy

# Fund native POL rewards from the configured wallet
FUND_ASSET=POL FUND_AMOUNT=10 STAKING_VAULT_ADDRESS=0x... npx hardhat run scripts/fund-staking.ts --network amoy

# Seed level-gated skill achievements + purchasable copies (idempotent)
SNEAKER_MODS_ADDRESS=0x... MOD_STORE_ADDRESS=0x... npx hardhat run scripts/seed-skills.ts --network amoy
```

`deploy.ts` verifies deployed source with Hardhat Verify when `POLYGONSCAN_API_KEY` is configured. `fund-staking.ts` validates the signer, network, admin role, balance, receipt, and reserve delta before completing. Set `FUNDING_PRIVATE_KEY` to fund from a personal wallet separate from the deployer.
