---
name: polygon-contracts
description: Design, implement, test, and integrate Run-Earn Solidity contracts for Polygon with Hardhat 3, OpenZeppelin, ERC-20 RUNE rewards, ERC-721 sneaker NFTs, native POL staking, and NFT APY boosts.
---

# Run-Earn Polygon Contracts

Use this skill for EVM contract design, Solidity implementation, Hardhat 3 configuration, deployment preparation, ABI integration, and viem contract workflows.

## Current contract architecture

| Contract | File | Responsibility |
| --- | --- | --- |
| `SneakerMint` | `contracts/SneakerMint.sol` | ERC-721 minting for AI-generated sneaker artwork (tiers 0–3: Common, Rare, Epic, Mythic) |
| `RUNEToken` | `contracts/RUNEToken.sol` | ERC-20 reward token `REN` with a 100M hard cap |
| `SneakerStaking` | `contracts/SneakerStaking.sol` | Native POL staking vault with rarity-based sneaker NFT APY boosts |
| `SneakerAppraiser` | `contracts/SneakerAppraiser.sol` | Read-only NFT valuation contract that estimates POL value based on rarity and tier |
| `SneakerMarketplace` | `contracts/SneakerMarketplace.sol` | Fixed-price sales, English auctions, and escrowed POL offers; staked NFTs cannot be listed |
| `SneakerGame` | `contracts/SneakerGame.sol` | Daily-activation gamification: virtual veRUNE points, streaks, durability, and REN redemption |
| `VeSneakerStore` | `contracts/VeSneakerStore.sol` | Primary sale of virtual sneakers (veSneakers) for POL, minted on demand |

Do not reintroduce `SneakerCollection`, `SneakerRewards`, `LaceToken`, or `RuneToken` in new code, tests, docs, environment variables, or deployment scripts. The ERC-20 symbol is `REN` (not `RUNE`); veRUNE is the virtual point balance in SneakerGame.

## Current staking model

- `depositPOL()` accepts native POL and tracks principal in `POLPosition`.
- `withdrawPOL(amount)` returns principal after the minimum lock.
- `claimPOLRewards()` pays POL only from the funded reserve above `totalPOLPrincipal`.
- `fundPOLRewards()` is admin-only and must be backed by an economic budget.
- `stake(tokenId)` is a **manual action** — the user must call it to lock their NFT into the vault. Reads rarity/tier from `SneakerMint` and increases the user's effective APY.
- `stakedTokenIds(owner)` supports exact NFT unlock UI.
- Existing RUNE NFT rewards remain available through `claimRewards` for compatibility.

Current defaults are 2.80% base APY (sustainable rate), rarity-based tier boosts `[50, 80, 150, 180]` bps (Common +0.5%, Rare +0.8%, Epic +1.5%, Mythic +1.8%), 0% flat per-NFT bonus, 8% maximum APY, and a 30-day minimum lock cycle.

## NFT valuation model (SneakerAppraiser)

- `appraise(tokenId)` returns `(estimatedValue, rarity, tier)` for an existing NFT.
- `appraiseRaw(rarity, tier)` returns an estimate without requiring an existing NFT.
- Formula: `(baseValue + tierValues[tier] + rarity * rarityWeight) * globalMultiplierBps / 10_000`.
- All parameters are admin-configurable via `updateParams()`.
- The contract is read-only — it does not execute trades or transfers.

## Marketplace model (SneakerMarketplace)

- Payments in native POL; 2.5% fee (`feeBps = 250`) accrues to the fee collector.
- Listings (`list`/`buy`/`cancelListing`) escrow the NFT in the marketplace.
- Auctions (`createAuction`/`bid`/`settleAuction`) escrow the NFT; bids refund the previous bidder; 1% minimum bid increment.
- Offers (`makeOffer`/`acceptOffer`/`cancelOffer`) escrow POL from the bidder; the NFT stays with the owner until acceptance (requires ERC-721 approval).
- Staked NFTs cannot be listed or auctioned — `stakedOwner(tokenId)` must be zero.
- `suggestedPrice(tokenId)` = appraiser value × `appraiserPremiumBps` (default 1.2x).

## Gamification model (SneakerGame)

- `activate(tokenId)` every 24h starts a 24h earning window; the owner must be the NFT owner.
- Streak: activating within 48h increments the streak; +1% per streak day (`streakBonusStepBps`), capped at +50%.
- Durability: each activation wears 1 point (max 10); at 0 the sneaker stops earning; `repair(tokenId)` costs 50 veRUNE.
- Points accrue per second by tier: Common 100, Rare 200, Epic 400, Mythic 800 veRUNE/day (18-decimal).
- veRUNE is virtual contract state, NOT an ERC-20. `redeem(points)` converts to REN at `redemptionRate` (default 100 veRUNE per REN) once the admin funds REN and calls `setRedemptionEnabled(true)`.
- Tokenomics: see `docs/veRune-tokenomics.md`.

## veSneaker primary sale (VeSneakerStore)

- veSneakers are virtual sneakers anyone can buy with POL, with or without a physical pair.
- The store mints on demand via `SneakerMint.mintAuthorized`, so it must hold `MINTER_ROLE` on SneakerMint (the deploy script grants it).
- `buy(designIndex)` / `buyBatch(designIndex, quantity)` (1–20) require `msg.value == price × quantity`; proceeds go to `treasury`.
- `reserveMint(designIndex, to, quantity)` allocates copies to the treasury without payment, counting against the design supply.
- Unique proof per copy: `keccak256(abi.encodePacked("vesneaker", designIndex, serial))`.
- Default prices are 2× the appraiser value: Common 1.4, Rare 3.9, Epic 8.3, Mythic 18.7 POL. Supply default 1000 per design.
- The 9 genesis designs live in `veSneakerDesigns()` (`scripts/deployment-config.ts`) and are registered by `scripts/mint-veSneakers.ts` (`VE_MINT_MODE=configure|premint|both`).
- The frontend catalog `VE_SNEAKER_CATALOG` (`src/lib/ve-sneakers.ts`) must stay in the **same index order** as `veSneakerDesigns()`.

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

- `scripts/deploy.ts` supports `DEPLOY_TARGET=all|RUNEToken|SneakerMint|SneakerStaking|SneakerAppraiser|SneakerMarketplace|SneakerGame` and writes an ignored deployment manifest.
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
