---
name: polygon-contracts
description: Design, implement, test, and integrate Airen Solidity contracts for Polygon with Hardhat 3, OpenZeppelin, ERC-20 REN rewards, ERC-721 sneaker + mod NFTs, native POL staking, the upgrade workshop, and NFT APY boosts.
---

# Airen Polygon Contracts

Use this skill for EVM contract design, Solidity implementation, Hardhat 3 configuration, deployment preparation, ABI integration, and viem contract workflows.

## Current contract architecture (v1.0)

| Contract | File | Responsibility |
| --- | --- | --- |
| `SneakerMint` | `contracts/SneakerMint.sol` | ERC-721 minting for AI-generated sneaker artwork (tiers 0–3: Common, Rare, Epic, Mythic) |
| `RENToken` | `contracts/RENToken.sol` | ERC-20 reward token `REN` with a 100M hard cap |
| `SneakerStaking` | `contracts/SneakerStaking.sol` | Native POL staking vault with rarity-based sneaker NFT APY boosts (+ workshop Boost mods) |
| `SneakerAppraiser` | `contracts/SneakerAppraiser.sol` | Read-only NFT valuation contract (effective rarity from forge + Skin bonus via `setBoosts`) |
| `SneakerMarketplace` | `contracts/SneakerMarketplace.sol` | Multi-collection fixed-price sales, English auctions, and escrowed POL offers; staked NFTs and mod-equipped sneakers cannot be listed |
| `SneakerGame` | `contracts/SneakerGame.sol` | Power/health/energy gamification: virtual veRUNE points, streaks, daily health decay, energy abilities, and REN redemption |
| `VeSneakerStore` | `contracts/VeSneakerStore.sol` | Primary sale of virtual sneakers (veSneakers) for POL, minted on demand |
| `ISneakerBoosts` | `contracts/ISneakerBoosts.sol` | Shared boost read interface consumed by game, staking, appraiser, marketplace |
| `SneakerMods` | `contracts/SneakerMods.sol` | ERC-721 mod/badge collection with on-chain achievement claims (`claim`) |
| `SneakerWorkshop` | `contracts/SneakerWorkshop.sol` | Seven-slot equip escrow (incl. passive Skill slot), `useAbility` consumable burns, and the veRUNE forge |
| `SneakerSwap` | `contracts/SneakerSwap.sol` | Atomic NFT↔NFT trades (± POL) across allowed collections |
| `ModRental` | `contracts/ModRental.sol` | Time-boxed mod rentals paid in POL; custody stays in escrow, renter equips via workshop |
| `ModStore` | `contracts/ModStore.sol` | Primary sale of premium mod designs for POL, including consumables and `requiredLevel` gates |
| `PlayerProgress` | `contracts/PlayerProgress.sol` | Live-state XP/levels across the protocol + public username/NFT-avatar identity |
| `FeeSplitter` | `contracts/FeeSplitter.sol` | Pro-rata distribution of protocol fees (marketplace/rental) to weighted recipients in native POL |
| `SneakerVault` | `contracts/SneakerVault.sol` | Live-state perks: store discounts (`bestDiscountBps`) and one-time access claims, gated by tier/forge/POL/level/mod signals |

For the upgrade-economy internals (slots, traits, ability kinds, energy costs,
stats) see the `airen-upgrade-economy` skill. For XP sources, the level curve,
skill gating, and the hybrid profile see the `airen-player-progression` skill.

Do not reintroduce `SneakerCollection`, `SneakerRewards`, `LaceToken`, or `RuneToken` in new code, tests, docs, environment variables, or deployment scripts. The ERC-20 symbol is `REN` (not `RUNE`); veRUNE is the virtual point balance in SneakerGame.

## Current staking model

- `depositPOL()` accepts native POL and tracks principal in `POLPosition`.
- `withdrawPOL(amount)` returns principal after the minimum lock.
- `claimPOLRewards()` pays POL only from the funded reserve above `totalPOLPrincipal`.
- `fundPOLRewards()` is admin-only and must be backed by an economic budget.
- `stake(tokenId)` is a **manual action** — the user must call it to lock their NFT into the vault. Reads rarity/tier from `SneakerMint` and increases the user's effective APY.
- `stakedTokenIds(owner)` supports exact NFT unlock UI.
- `setBoosts(workshop)` adds `stakingBoostBps` per locked sneaker from equipped Boost mods, capped by `maxApyBps`.
- Existing RUNE NFT rewards remain available through `claimRewards` for compatibility.

Current defaults are 2.80% base APY (sustainable rate), rarity-based tier boosts `[50, 80, 150, 180]` bps (Common +0.5%, Rare +0.8%, Epic +1.5%, Mythic +1.8%), 0% flat per-NFT bonus, 8% maximum APY, and a 30-day minimum lock cycle.

## NFT valuation model (SneakerAppraiser)

- `appraise(tokenId)` returns `(estimatedValue, rarity, tier)` for an existing NFT.
- `appraiseRaw(rarity, tier)` returns an estimate without requiring an existing NFT.
- Formula: `(baseValue + tierValues[tier] + rarity * rarityWeight) * globalMultiplierBps / 10_000`.
- All parameters are admin-configurable via `updateParams()`.
- The contract is read-only — it does not execute trades or transfers.

## Marketplace model (SneakerMarketplace, multi-collection)

- Payments in native POL; 2.5% fee (`feeBps = 250`) accrues to the fee collector.
- All sale primitives take a `collection` address first: `list(collection, tokenId, price)`, `createAuction(collection, tokenId, startPrice, duration)`, `makeOffer(collection, tokenId, duration)`; locks are keyed by `(collection, tokenId)` via `tokenSaleKind`.
- `allowedCollections` gates which NFT contracts can trade — `SneakerMint` in the constructor, `SneakerMods` enabled by the deploy wiring.
- Listings/auctions escrow the NFT; bids refund the previous bidder (1% min increment); offers escrow POL and the NFT stays with the owner until acceptance.
- Staked NFTs cannot be listed or auctioned; sneakers with equipped workshop mods are blocked via `workshop.hasEquippedMods` — sellers must unequip first.
- `suggestedPrice(tokenId)` = appraiser value × `appraiserPremiumBps` (default 1.2x) — sneaker-only, mods are market-priced.

## Gamification model (SneakerGame)

- Three live stats per sneaker — **power** (`powerBps = 5000 + effectiveRarity × 100`, scales the tier base rate), **health** (durability − 1/day of real time via `lastDecayAt`, minus wear per activation; at 0 the sneaker is worn out), **energy** (capacity `2 + effectiveRarity/20`, refilled by each manual `activate`).
- `activate(tokenId)` every 24h starts a 24h earning window; the owner must be the NFT owner.
- Streak: activating within 48h increments the streak; +1% per streak day (`streakBonusStepBps`), capped at +50%.
- Accrual is capped at the death timestamp (`lastDecayAt + liveHealth × 24h`) — a worn-out sneaker stops earning until `repair` (50 veRUNE, Lining discount) or a burned repair kit (`repairFromWorkshop`, workshop-only).
- Workshop-only entry points: `activateFromWorkshop` (surge, bypasses cooldown, does NOT refill energy), `repairFromWorkshop`, `spendEnergy`, `spendPoints`.
- `sneakers(tokenId)` returns 8 fields: `lastActivationAt`, `lastAccrualAt`, `streak`, `durability`, `pendingPoints`, `lifetimePoints`, `lastDecayAt`, `energy`. Live views: `powerOf`, `healthOf`, `energyOf`, `maxEnergyOf`, `earnRatePerSecond`, `pendingPoints`, `canActivate`.
- Points accrue per second by tier: Common 100, Rare 200, Epic 400, Mythic 800 veRUNE/day (18-decimal, before power).
- veRUNE is virtual contract state, NOT an ERC-20. `redeem(points)` converts to REN at `redemptionRate` (default 100 veRUNE per REN) once the admin funds REN and calls `setRedemptionEnabled(true)`.
- Tokenomics: see `docs/veRune-tokenomics.md`.

## veSneaker primary sale (VeSneakerStore)

- veSneakers are purely virtual in-game sneakers anyone can buy with POL — there is no physical product or redemption path.
- The store mints on demand via `SneakerMint.mintAuthorized`, so it must hold `MINTER_ROLE` on SneakerMint (the deploy script grants it).
- `buy(designIndex)` / `buyBatch(designIndex, quantity)` (1–20) require `msg.value == price × quantity`; proceeds go to `treasury`.
- `reserveMint(designIndex, to, quantity)` allocates copies to the treasury without payment, counting against the design supply.
- Unique proof per copy: `keccak256(abi.encodePacked("vesneaker", designIndex, serial))`.
- Prices are USD targets converted at `POL_USD_PRICE`: $40 (Common) → $150 (Mythic), geometric progression — 410 / 635 / 993 / 1536 POL at POL = $0.09764. Supply default 1000 per design. Tune with `VE_PRICE_*_USD` or pin `VE_PRICE_*_POL`.
- The initial Astra/Sol/Luna family designs live in `veSneakerDesigns()` and are registered by `scripts/mint-veSneakers.ts`; set `VE_SNEAKER_ASSET_BASE_URL` to a public HTTPS origin before creating NFT metadata.
- The frontend `VE_SNEAKER_CATALOG` must match the first three registered design indices. Existing stores retain legacy indices; never reorder them. `VE_UPDATE_DESIGN_URIS=true` explicitly refreshes those first three metadata URIs for future mints.

## Toolchain and commands

- Solidity: exact `0.8.36`.
- Hardhat: 3.x, ESM-first declarative configuration.
- OpenZeppelin Contracts: 5.6.x.
- viem 2.x and `@nomicfoundation/hardhat-viem`.
- Solidity tests: `test/*.t.sol` with `forge-std`.
- TypeScript integration tests: `test/*.ts` with Mocha and hardhat-viem.
- `npx hardhat compile`
- `npx hardhat test solidity`
- `npx hardhat test mocha`
- `npx hardhat test`
- `npm run lint`, `npm run typecheck`, `npm run build`

Use `hre.network.create()` and `connection.viem` in Hardhat 3 tests. Use `viem.deployContract`, not Hardhat 2 `getContractFactory`.

## Deployment and funding scripts

- `scripts/deploy.ts` supports `DEPLOY_TARGET=all|RENToken|SneakerMint|SneakerStaking|SneakerAppraiser|SneakerMarketplace|SneakerGame|VeSneakerStore|SneakerMods|SneakerWorkshop|SneakerSwap|ModRental|ModStore|PlayerProgress|FeeSplitter|SneakerVault` and writes an ignored deployment manifest.
- `DEPLOY_TARGET=all` deploys in dependency order and runs the wiring: `game.setBoosts/setWorkshop`, `staking.setBoosts`, `appraiser.setBoosts`, `mods.setWorkshop`, `workshop.setRentalSource(rental)`, `marketplace.setWorkshop` + `setCollectionAllowed(mods)`, `swap.setCollectionAllowed(mods)`, `mods.grantRole(MINTER_ROLE, modStore)`, `nft.grantRole(MINTER_ROLE, veStore)`, `mods.setProgress(progress)`, `modStore.setProgress(progress)`, `veStore.setProgress(progress)`, `modStore.setVault(vault)`, `veStore.setVault(vault)`.
- `scripts/seed-skills.ts` seeds the level-gated skill catalog (free `PlayerLevel` achievements + `requiredLevel` store copies) — idempotent, run after the progress wiring.
- Single-target deploys read dependency addresses from `*_ADDRESS` env vars, so partial redeploys can re-wire against existing contracts.
- Deploy with `npx hardhat run scripts/deploy.ts --network amoy` or `--network polygon`.
- Set `SKIP_VERIFY=true` only when verification is intentionally skipped; otherwise `POLYGONSCAN_API_KEY` is required.
- `scripts/fund-staking.ts` supports `FUND_ASSET=POL` for native POL reserves and `FUND_ASSET=RUNE` for the legacy RUNE vault.
- Funding must use a signer with `DEFAULT_ADMIN_ROLE` for `fundPOLRewards()` and must validate network, balance, receipt, and reserve delta.
- Use `DEPLOYER_PRIVATE_KEY` only in terminal/deployment secrets. Never hardcode keys or log them.

## Required security invariants

- Validate caller permissions, contract addresses, token IDs, reward tokens, authorities, APY bounds, and POL amounts.
- Prevent duplicate proofs, duplicate stakes, replayed authorizations, double withdrawals, and unauthorized admin actions.
- Separate user POL principal from reward reserve; admin recovery may never withdraw user principal.
- Use checks-effects-interactions, `ReentrancyGuard`, `SafeERC20`, `safeTransferFrom`, and `IERC721Receiver`.
- Preserve exact NFT depositor/token custody and expose enumerable staked IDs.
- Do not trust client-provided rarity/tier in production.
- Keep pause, emergency recovery, migration, governance, and upgrade policy explicit before mainnet.
- Add unit, fuzz, integration, adversarial, and invariant tests.
- Never commit private keys, Graph deploy keys, Graph query keys, or funded deployer credentials.
