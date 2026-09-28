---
name: polygon-security
description: Review Airen Polygon contracts, native POL staking, REN rewards, NFT boosts, the mod workshop economy, subgraph activity, and wallet flows for custody, arithmetic, and deployment risks.
---

# Airen Polygon Security

Use this skill before merging or deploying any EVM contract, NFT mint flow, native POL staking flow, REN reward distribution, marketplace escrow, game point accounting, mod/workshop upgrade mechanic, subgraph integration, or wallet transaction change.

## Current system under review

- `SneakerMint.sol`: ERC-721 for AI-generated sneaker artwork with role-authorized production minting. Tiers 0–3 (Common, Rare, Epic, Mythic).
- `RENToken.sol`: ERC-20 `REN`, 18 decimals, 100M hard cap, role-gated minting.
- `SneakerStaking.sol`: native POL vault with separate principal/reward accounting, rarity-based SneakerMint NFT APY boosts (Common +0.5%, Rare +0.8%, Epic +1.5%, Mythic +1.8%), workshop Boost-mod APY via `setBoosts`, and legacy REN NFT rewards.
- `SneakerAppraiser.sol`: read-only NFT valuation (effective rarity incl. forge + Skin bonus via `setBoosts`). Admin-configurable parameters.
- `SneakerMarketplace.sol`: multi-collection fixed-price listings, English auctions, and escrowed POL offers with a 2.5% fee, staked-NFT and equipped-mod sale guards.
- `SneakerGame.sol`: virtual veRUNE points (24h activation, streaks, power/health/energy, repair) with a funded REN redemption path.
- `VeSneakerStore.sol`: on-demand primary sale of virtual sneakers for POL, with per-design pricing, supply caps, and a treasury payout.
- `SneakerMods.sol`: ERC-721 mod/badge collection with on-chain achievement claims.
- `SneakerWorkshop.sol`: seven-slot equip escrow (incl. passive Skill slot), consumable `useAbility` burns, veRUNE forge.
- `SneakerSwap.sol`: atomic NFT↔NFT trades ± POL.
- `ModRental.sol`: POL-paid mod rentals with escrow custody and expiry return.
- `ModStore.sol`: primary sale of premium/consumable mods for POL with `requiredLevel` gates.
- `PlayerProgress.sol`: live-state XP/levels (counters in game/marketplace/workshop, staking principal) + public username/NFT-avatar identity.
- `FeeSplitter.sol`: pro-rata POL fee distribution to weighted recipients (weights must sum to 100%).
- `SneakerVault.sol`: live-state perks (store discounts, one-time access claims) gated by tier/forge/POL/level/mod signals; read-only for funds.
- `/api/generate-sneaker`: server-only Gemini image generation for the mint studio.
- `/api/subgraph`: server-only proxy for the `nuxgraph` Studio deployment.
- `/api/pol-price`: server-only proxy for the Uniswap Trading API POL/USD quote.
- Wallet layer: EIP-6963/EIP-1193 discovery, MetaMask Connect EVM, and OKX Universal Provider with mobile handoff.

## Review areas

### Native POL solvency

- Verify `totalPOLPrincipal` always equals reserved user principal.
- Confirm `recoverPOLRewards` can withdraw only `address(this).balance - totalPOLPrincipal`.
- Confirm POL withdrawals cannot be reentered and state updates happen before external calls.
- Verify `fundPOLRewards` is explicit, admin-controlled, budgeted, and not confused with user deposits.
- Test zero deposits, zero withdrawals, lock periods, partial withdrawals, full withdrawals, empty reserves, rounding, and overflow.
- Treat the APY as a parameter, not a guaranteed return.

### NFT boosts and custody

- Confirm only the NFT owner can stake.
- Verify traits are read from `SneakerMint.traitsOf`, never trusted from the browser.
- Confirm exact token IDs and depositor addresses are preserved through `stakedOwner`, receipts, and `stakedTokenIds`.
- Verify `safeTransferFrom`, `IERC721Receiver`, pause behavior, minimum lock, emergency recovery, and swap-and-pop array removal.
- Test that adding/removing NFTs accrues rewards before APY weight changes.

### REN compatibility

- Confirm `RENToken.MAX_SUPPLY` (100M), symbol `REN`, minter role, pause behavior, and the separate legacy reward vault.
- Ensure REN recovery cannot accidentally drain user POL or NFT custody.

### Marketplace escrow and payments

- Confirm listed/auctioned NFTs are escrowed by `SneakerMarketplace` and returned on cancel/no-bid settle.
- Verify every POL transfer uses the checks-effects-interactions order and `nonReentrant`; bids refund the previous bidder before state settles.
- Confirm `buy` requires `msg.value == listing.price` and the seller cannot buy their own listing.
- Verify auction minimum increments, that bids after `endTime` revert, and that settle cannot run before `endTime`.
- Confirm offers escrow POL, cannot target own or listed tokens, expire correctly, and that accepting an offer requires NFT approval (the NFT is not in escrow).
- Verify the fee split (`feeBps`, cap 20%) credits `accumulatedFees` and that `withdrawFees` cannot touch user funds.
- Confirm `stakedOwner(tokenId) != address(0)` blocks listing and auctioning staked NFTs.
- Verify `allowedCollections` gates every sale primitive — a non-allowlisted NFT contract must revert on list/auction/offer/accept.
- Confirm locks are keyed by `(collection, tokenId)` — a listing on one collection must not lock the same tokenId on another.
- Confirm `workshop.hasEquippedMods(sneakerId)` blocks listing/auctioning mod-equipped sneakers, so a buyer cannot inherit or steal escrowed mods.
- Check reentrancy on NFT receiver callbacks and that a malicious NFT/collection cannot re-enter settle/buy.

### Game points, health, energy, and redemption

- Confirm veRUNE is tracked in contract state only — it must never be minted as a transferable token by this contract.
- Verify `activate` enforces the 24h cooldown, ownership, and the worn-out guard; health (`durability` minus elapsed `HEALTH_DECAY_PERIOD` units) cannot underflow.
- Confirm accrual stops at the 24h window boundary and at the death timestamp (`lastDecayAt + liveHealth × 24h`), and that already-earned points remain claimable.
- Verify the power multiplier (`5000 + effectiveRarity × 100` bps) bounds — rarity/forge bonuses cannot push it past the 1.5x cap at rarity 100.
- Verify `spendEnergy`, `repairFromWorkshop`, `activateFromWorkshop`, and `spendPoints` revert for every caller except the configured workshop.
- Confirm the surge path (`activateFromWorkshop`) does NOT refill energy — otherwise it would be a free-energy exploit.
- Verify energy capacity (`2 + effectiveRarity/20`) and that `spendEnergy` cannot underflow.
- Verify streak logic (build within 48h, reset beyond, cap +50%) cannot be gamed by warping or repeated calls in one block.
- Confirm `repair` deducts the exact (Lining-discounted) `repairCostPoints` and cannot be called on a never-activated sneaker.
- Confirm `redeem` is disabled by default, converts with integer division, and can never pay more REN than the contract holds (funded pool invariant).
- Verify `fundREN` is admin-only and that `setRedemptionEnabled` is the only gate.

### Upgrade economy (mods, workshop, swap, rental, stores)

- Confirm `SneakerMods.burnAuthorized` only works for the configured workshop — a burned mod must be unrecoverable and unequipped.
- Verify `claim` achievements check real on-chain requirements and enforce one claim per wallet per achievement.
- Confirm `equip` escrows the mod (`equippedTo`), rejects consumables, enforces one mod per slot, and only the sneaker owner (or active renter via `rentalSource`) can equip.
- Verify equipped mods cannot be burned, listed, or swapped while escrowed, and `unequip` returns the exact mod to its owner.
- Confirm `useAbility` validates `consumable` + `aux` kind (0/255 repair, 1 surge, 2 boost, 3 forge stone, 4 Overdrive 48h, 5 Stim refill, 6 Lucky repair), spends the correct energy cost via `game.spendEnergy`, and ALWAYS burns the mod — no ability may be reusable.
- Verify the Stim pack (`refillEnergyFromWorkshop`) is workshop-only and reverts on a dead sneaker — free energy must never resurrect a worn-out sneaker.
- Verify `tempBoostBps`/`boostExpiresAt` expire correctly and a new capsule refreshes rather than stacking indefinitely.
- Confirm `forge` burns exactly `forgeCostPoints` veRUNE via `spendPoints` and that forge-stone free levels cannot be replayed.
- Verify `SneakerSwap` is atomic: both NFTs (± POL) move in one transaction or the whole thing reverts; expired/counterparty-owned swaps cannot be accepted; escrow returns on `cancel`.
- Confirm `ModRental` escrow cannot be withdrawn mid-rental by the owner, expiry lets anyone return the mod, and the renter's workshop equip rights die with the rental.
- Verify `ModStore`/`VeSneakerStore` hold `MINTER_ROLE` only on their target collection and cannot mint outside their design catalog.
- Confirm `workshop.setRentalSource`, `setWorkshop`, and `setBoosts` are admin-only — a wrong address would hijack equip rights or fake boosts.

### Player progression (PlayerProgress + level gates)

- Verify XP is derived from live reads only — no user-supplied values; selling NFTs or unstaking POL must lower `levelOf`.
- Confirm the counters can't be gamed: `tradesCount` increments only on completed sales (not on list/cancel/expiry), `actionsCount` only on successful workshop actions, `lifetimeEarned` only on claimed points.
- Verify `setUsername` enforces the 3–20 byte bound and `setNftAvatar` verifies `ownerOf` — no avatar pointer to tokens the caller does not own.
- Confirm `setLevelThresholds` is admin-only, must start at 0, and be strictly increasing — a broken table would corrupt every level gate.
- Verify level gates (`PlayerLevel` achievements, `requiredLevel` designs) read `levelOf` at action time and revert when `progress` is unset — a zero-address `progress` must fail closed, never open.
- Confirm `setProgress` on mods/both stores is admin-only — a malicious progress contract would fake levels.
- Confirm `setVault` on both stores is admin-only — a malicious vault could fake discounts (capped at 50% by `MAX_DISCOUNT_BPS`).
- Verify a zero-address vault means full price (fail-closed to full price, never to a free mint) and the discounted amount can never be zero.

### Fee distribution (FeeSplitter)

- Confirm recipient weights must sum to exactly 10_000 bps — no fee can be stranded by an incomplete split.
- Verify `distribute()` is callable by anyone (deterministic split, no griefing vector) and is `nonReentrant`.
- Confirm the last recipient absorbs division dust so the distributed sum is exact.
- Verify `setRecipients` rejects zero addresses, zero weights, and empty lists.
- Confirm the splitter never holds user principal — it only receives explicit fee withdrawals.

### Benefits vault (SneakerVault)

- Verify all eligibility is derived from live contract state (tier via `traitsOf`, forge via `rarityBonus`, POL via `polPositions`, level via `levelOf`, mods via `balanceOf`) — never client-supplied.
- Confirm gates are additive: a perk with several non-zero gates requires all of them.
- Verify discounts cap at 50% (`MAX_DISCOUNT_BPS`) and inactive perks return 0 (full price).
- Confirm access claims are one-per-wallet-per-perk and revert on any failed gate.
- Verify the vault never holds POL or NFTs — it is read-only for funds.

### veSneaker primary sale

- Confirm `buy`/`buyBatch` require `msg.value == price × quantity` exactly and revert otherwise.
- Verify the design supply cap is enforced and that `updateDesign` cannot set a cap below `minted`.
- Confirm minting happens before the treasury transfer and that the whole flow is `nonReentrant`.
- Verify the store holds `MINTER_ROLE` on SneakerMint and that `addDesign`/`reserveMint`/`updateDesign` are admin-only.
- Confirm proof hashes are unique per (design, serial) and cannot collide with studio-minted proofs.
- Confirm `treasury` cannot be set to the zero address and that proceeds always reach it.
- Confirm `receive()` reverts so POL cannot be stranded, and that `withdrawProceeds` is a last-resort admin hatch.
- Verify the frontend catalog order matches the on-chain design index; a mismatch would mis-price designs.

### Subgraph and API security

- The Graph deploy key and query API key are different credentials.
- Keep `THE_GRAPH_QUERY_URL` and `THE_GRAPH_QUERY_API_KEY` server-only.
- Validate wallet addresses at `/api/subgraph` and never proxy arbitrary client-supplied GraphQL.
- Do not use indexed activity as the source of truth for balances or ownership; use RPC contract reads.
- Handle stale indexing, schema mismatch, endpoint errors, and query key rotation.

### Uniswap price feed security

- Keep `UNISWAP_API_KEY` server-only — the Trading API has no CORS support, so it must never be called from the browser.
- Never cache a fallback price as if it were live; surface `source: "fallback"` to the UI.
- Do not let the price feed drive on-chain state: contract prices are fixed in POL and only the USD display is derived.
- Treat the quote as untrusted input: validate the output amount is a positive integer before dividing.
- Do not use the feed for settlement, accounting, or oracle-style decisions without a dedicated, reviewed oracle.

### AI mint route security

- Keep `GEMINI_API_KEY` server-only; never expose it to `NEXT_PUBLIC_*` or logs.
- Enforce the image content-type and the 8 MB cap before calling the model.
- Do not persist or log raw user photos; only the generated artwork goes on-chain.
- Treat the proof hash as single-use: never reuse a proof across mints, and never trust a client-supplied proof without the contract's duplicate check.

### Wallet and frontend

- Validate `NEXT_PUBLIC_SNEAKER_MINT_ADDRESS`, `NEXT_PUBLIC_STAKING_VAULT_ADDRESS`, `NEXT_PUBLIC_SNEAKER_APPRAISER_ADDRESS`, `NEXT_PUBLIC_SNEAKER_MARKETPLACE_ADDRESS`, `NEXT_PUBLIC_SNEAKER_GAME_ADDRESS`, `NEXT_PUBLIC_VE_SNEAKER_STORE_ADDRESS`, `NEXT_PUBLIC_SNEAKER_MODS_ADDRESS`, `NEXT_PUBLIC_SNEAKER_WORKSHOP_ADDRESS`, `NEXT_PUBLIC_SNEAKER_SWAP_ADDRESS`, `NEXT_PUBLIC_MOD_RENTAL_ADDRESS`, `NEXT_PUBLIC_MOD_STORE_ADDRESS`, and `NEXT_PUBLIC_PLAYER_PROGRESS_ADDRESS` with viem.
- Confirm the EIP-1193 connected wallet is the signer.
- Check wrong chain, rejected signatures, insufficient POL, failed receipts, and stale UI state.
- Confirm the UI never treats veRUNE or local-storage entries as on-chain ownership.

### Deployment and funding scripts

- Require explicit `--network polygon` or `--network amoy`; never silently deploy to an unknown network.
- Confirm `DEPLOYER_PRIVATE_KEY` is supplied outside source control and the deployer has sufficient gas.
- Verify constructor arguments match the saved deployment manifest before explorer verification.
- Treat `POLYGONSCAN_API_KEY` as a terminal secret; do not log it.
- For `fund-staking.ts`, confirm the signer has `DEFAULT_ADMIN_ROLE` for POL funding and that only reward reserve surplus changes.
- For RUNE funding, check the wallet balance and the staking vault address before sending.
- Do not treat a successful transaction as proof of economic solvency; review reserve budgets separately.

## Review workflow

1. Consult current official Polygon, OpenZeppelin, Solidity, Hardhat 3, viem, and The Graph documentation.
2. Inspect Solidity and TypeScript tests, including negative and fuzz cases.
3. Run `npx hardhat compile`, `npx hardhat test`, `npm run lint`, `npm run typecheck`, and `npm run build`.
4. Verify `/staking`, `/marketplace` (incl. Mods/Rentals/Trades tabs), `/game`, `/workshop`, `/badges`, and `/collection` on Polygon Amoy with a disposable wallet and funded test reserve/pools.
5. Verify subgraph events after indexing and compare them against RPC receipts.
6. Report residual custody, solvency, economic, key-management, and indexing risks.
7. Do not mark financial logic production-ready without multisig administration and independent smart-contract/economic review.
