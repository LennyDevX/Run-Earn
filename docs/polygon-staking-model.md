# Airen Polygon POL staking model

This document describes the current EVM implementation for Polygon Amoy. It is not a mainnet deployment approval or a promise of financial returns.

## Current contracts

- `SneakerMint.sol`: ERC-721 minting contract for AI-generated sneaker artwork. Tiers 0–3 (Common, Rare, Epic, Mythic).
- `RENToken.sol`: pausable ERC-20 reward token with symbol `REN` and a 100M hard cap; retained for the legacy NFT reward path.
- `SneakerStaking.sol`: native POL staking vault with optional SneakerMint NFT APY boosts and a legacy RUNE NFT reward path.
- `SneakerAppraiser.sol`: read-only NFT valuation contract that estimates the POL value of a SneakerMint NFT based on its rarity score and tier.

## POL staking model

1. The user calls `depositPOL()` with native POL.
2. The vault tracks `POLPosition.principal` separately from rewards and updates `totalPOLPrincipal`.
3. A new deposit accrues existing rewards and restarts the minimum lock period.
4. The user can lock SneakerMint NFTs with `stake(tokenId)` — this is a **manual action**. The NFT is transferred from the user to the vault.
5. The vault reads rarity/tier directly from `SneakerMint.traitsOf(tokenId)`.
6. The effective APY is recalculated from the base APY and the rarity-based tier bonus.
7. POL rewards accrue as integer units over elapsed seconds.
8. The admin funds the POL reward reserve with `fundPOLRewards()`.
9. `claimPOLRewards()` pays only from the excess balance above `totalPOLPrincipal`.
10. After the minimum lock, `withdrawPOL(amount)` returns principal. NFT `unstake(tokenId)` returns the exact token ID after its NFT lock.

The POL reserve must be funded before claims are enabled. The contract reverts safely when the reward reserve cannot cover a claim. Deposited principal is never treated as reward liquidity.

## NFT APY boost model

The APY boost is **rarity-based** — each NFT tier gives a fixed bonus:

| Tier | Label | Boost (bps) | Boost (%) |
| --- | --- | --- | --- |
| 0 | Common | 50 | +0.5% |
| 1 | Rare | 80 | +0.8% |
| 2 | Epic | 150 | +1.5% |
| 3 | Mythic | 180 | +1.8% |

There is no flat per-NFT bonus (`perNftBonusBps = 0`). The boost is applied only when the user manually locks the NFT into the vault via `stake(tokenId)`. The NFT must be in the vault (custodied by the staking contract) for the boost to remain active.

Boost-slot mods equipped on a locked sneaker add `workshop.stakingBoostBps(tokenId)` on top of the tier bonus — read live from `SneakerWorkshop` via `setBoosts`, so unequipping the mod removes the extra APY on the next accrual. Mods can be equipped on staked sneakers because the workshop recognizes `staking.stakedOwner` as the sneaker's controller.

## NFT valuation (SneakerAppraiser)

The `SneakerAppraiser` contract provides an on-chain POL value estimate for each SneakerMint NFT:

```text
estimated_value = (base_value + tier_values[tier] + rarity * rarity_weight) * global_multiplier_bps / 10_000
```

- `baseValue`: base POL value applied to every NFT (default: 0.5 POL).
- `tierValues[4]`: per-tier POL value added on top (default: 0, 1, 3, 8 POL for Common/Rare/Epic/Mythic).
- `rarityWeight`: POL value per rarity score point 0–100 (default: 0.01 POL).
- `globalMultiplierBps`: global multiplier (default: 10000 = 1x).

All parameters are admin-configurable via `updateParams()`. The estimate helps users decide whether to sell their NFT in a future marketplace or lock it as a staking APY boost. The contract is read-only — it does not execute trades or transfers.

## Conservative defaults

- Base APY: 2.80% (`280` bps) — reduced by 30% for long-term protocol sustainability.
- Per-NFT bonus: 0% (`0` bps) — boost is purely rarity-based.
- Maximum APY: 8% (`800` bps).
- Minimum lock: 30 days (`2,592,000` seconds).
- Tier bonuses: `[50, 80, 150, 180]` bps for Common, Rare, Epic, Mythic.

```text
effective_apy_bps = min(
  base_apy_bps
    + locked_count * per_nft_bonus_bps
    + sum(tier_bonus_bps + workshop_staking_boost_bps),
  max_apy_bps,
)
pol_reward_units = pol_principal
  * effective_apy_bps
  * elapsed_seconds
  / (10_000 * seconds_per_year)
```

The APY parameter is an accounting rule, not a guaranteed return. Mainnet requires an economic model, reserve policy, multisig administration, and independent review.

## Activity indexing

The staking UI at `/staking` reads principal, pending POL rewards, APY, locked token IDs, owned SneakerMint NFTs, and reserve state directly from RPC. The marketplace UI at `/marketplace` (fixed-price sales, auctions, POL offers) and the game UI at `/game` (24h activations, streaks, live health decay, energy, veRUNE redemption) follow the same pattern via the `useMarketplace` and `useSneakerGame` hooks. Recent activity is loaded through `/api/subgraph`, which proxies the `nuxgraph` Studio deployment configured in `docs/subgraph-integration.md`.

The deployed subgraph must index `POLDeposited`, `POLWithdrawn`, `POLRewardsClaimed`, `Staked`, and `Unstaked` for complete activity history. Marketplace and game events (`ListingCreated`, `NFTSold`, `AuctionSettled`, `OfferAccepted`, `Activated`, `PointsClaimed`, `Redeemed`) should be indexed for full cross-app activity.

## Security boundaries

- Client rarity/tier values are not trusted by staking.
- Duplicate proof hashes and duplicate stake receipts are rejected.
- `safeTransferFrom`, `IERC721Receiver`, `ReentrancyGuard`, checks-effects-interactions, and integer accounting protect custody and claims.
- Pausing blocks new deposits, NFT stakes, and claims; withdrawals and NFT unlocks remain available for fund safety.
- `recoverPOLRewards` cannot withdraw user principal, because it checks the excess balance above `totalPOLPrincipal`.
- Raw photos, personal data, private keys, and query/deploy keys remain off-chain and out of public environment variables.

## Tests

```bash
npx hardhat compile
npx hardhat test solidity
npx hardhat test mocha
npx hardhat test
npm run lint
npm run typecheck
npm run build
```
