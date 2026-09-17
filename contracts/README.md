# Polygon EVM contracts

Current foundation: Solidity 0.8.36, Hardhat 3, OpenZeppelin Contracts 5.6.

## Contracts

| Contract | File | Purpose |
| --- | --- | --- |
| `SneakerMint` | `SneakerMint.sol` | ERC-721 minting for AI-generated sneaker artwork (tiers 0–3: Common, Rare, Epic, Mythic) |
| `RUNEToken` | `RUNEToken.sol` | ERC-20 reward token `REN` with 100M supply cap |
| `SneakerStaking` | `SneakerStaking.sol` | Native POL staking with rarity-based sneaker NFT APY boosts |
| `SneakerAppraiser` | `SneakerAppraiser.sol` | Read-only NFT valuation contract (POL value estimates) |
| `SneakerMarketplace` | `SneakerMarketplace.sol` | Fixed-price sales, English auctions, and POL offers |
| `SneakerGame` | `SneakerGame.sol` | Daily-activation gamification with virtual veRUNE points redeemable for REN |
| `VeSneakerStore` | `VeSneakerStore.sol` | On-demand primary sale of virtual sneakers (veSneakers) for POL |

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

- `activate(tokenId)` every 24h starts an earning window; daily streaks add +1% per day (cap +50%).
- Each activation wears 1 durability (max 10); at 0 the sneaker stops earning until repaired (50 veRUNE).
- Points accrue per second by tier: Common 100, Rare 200, Epic 400, Mythic 800 veRUNE/day.
- veRUNE is virtual (contract state, not an ERC-20). `redeem(points)` converts veRUNE to REN at `redemptionRate` once the admin funds the pool and enables redemption.
- See [`docs/veRune-tokenomics.md`](../docs/veRune-tokenomics.md) for the full tokenomics design.

## veSneaker store (VeSneakerStore)

- veSneakers are virtual sneakers anyone can buy with POL, with or without a physical pair.
- `buy(designIndex)` / `buyBatch(designIndex, quantity)` mint on demand through `SneakerMint.mintAuthorized`; the store holds `MINTER_ROLE`.
- Prices are USD targets converted at `POL_USD_PRICE`: $40 (Common) → $150 (Mythic), geometric progression — 410 / 635 / 993 / 1536 POL at POL = $0.09764. Supply default 1000 per design.
- `reserveMint` allocates copies to the treasury without payment, counting against supply.
- Configure the 9 genesis designs with `VE_MINT_MODE=configure|premint|both npx hardhat run scripts/mint-veSneakers.ts --network amoy`.

## Frontend and subgraph

The staking UI is at `/staking`. Contract addresses use:

```env
NEXT_PUBLIC_SNEAKER_MINT_ADDRESS=
NEXT_PUBLIC_REWARD_TOKEN_ADDRESS=
NEXT_PUBLIC_STAKING_VAULT_ADDRESS=
NEXT_PUBLIC_SNEAKER_APPRAISER_ADDRESS=
NEXT_PUBLIC_SNEAKER_MARKETPLACE_ADDRESS=
NEXT_PUBLIC_SNEAKER_GAME_ADDRESS=
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
DEPLOY_TARGET=RUNEToken npx hardhat run scripts/deploy.ts --network amoy
DEPLOY_TARGET=SneakerMint npx hardhat run scripts/deploy.ts --network amoy
DEPLOY_TARGET=SneakerStaking RUNE_TOKEN_ADDRESS=0x... SNEAKER_MINT_ADDRESS=0x... npx hardhat run scripts/deploy.ts --network amoy
DEPLOY_TARGET=SneakerAppraiser SNEAKER_MINT_ADDRESS=0x... npx hardhat run scripts/deploy.ts --network amoy
DEPLOY_TARGET=SneakerMarketplace SNEAKER_MINT_ADDRESS=0x... SNEAKER_APPRAISER_ADDRESS=0x... STAKING_VAULT_ADDRESS=0x... npx hardhat run scripts/deploy.ts --network amoy
DEPLOY_TARGET=SneakerGame SNEAKER_MINT_ADDRESS=0x... RUNE_TOKEN_ADDRESS=0x... npx hardhat run scripts/deploy.ts --network amoy
DEPLOY_TARGET=VeSneakerStore SNEAKER_MINT_ADDRESS=0x... npx hardhat run scripts/deploy.ts --network amoy

# Fund native POL rewards from the configured wallet
FUND_ASSET=POL FUND_AMOUNT=10 STAKING_VAULT_ADDRESS=0x... npx hardhat run scripts/fund-staking.ts --network amoy
```

`deploy.ts` verifies deployed source with Hardhat Verify when `POLYGONSCAN_API_KEY` is configured. `fund-staking.ts` validates the signer, network, admin role, balance, receipt, and reserve delta before completing. Set `FUNDING_PRIVATE_KEY` to fund from a personal wallet separate from the deployer.
