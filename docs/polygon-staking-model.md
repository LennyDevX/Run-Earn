# RUN&EARN Polygon POL staking model

This document describes the current EVM implementation for Polygon Amoy. It is not a mainnet deployment approval or a promise of financial returns.

## Current contracts

- `SneakerMint.sol`: ERC-721 minting contract for AI-generated sneaker artwork.
- `RUNEToken.sol`: pausable ERC-20 reward token with symbol `RUNE` and a 100M hard cap; retained for the legacy NFT reward path.
- `SneakerStaking.sol`: native POL staking vault with optional SneakerMint NFT APY boosts and a legacy RUNE NFT reward path.

## POL staking model

1. The user calls `depositPOL()` with native POL.
2. The vault tracks `POLPosition.principal` separately from rewards and updates `totalPOLPrincipal`.
3. A new deposit accrues existing rewards and restarts the minimum lock period.
4. The user can lock SneakerMint NFTs with `stake(tokenId)`.
5. The vault reads rarity/tier directly from `SneakerMint.traitsOf(tokenId)`.
6. The effective APY is recalculated from the base APY, NFT count, and tier bonuses.
7. POL rewards accrue as integer units over elapsed seconds.
8. The admin funds the POL reward reserve with `fundPOLRewards()`.
9. `claimPOLRewards()` pays only from the excess balance above `totalPOLPrincipal`.
10. After the minimum lock, `withdrawPOL(amount)` returns principal. NFT `unstake(tokenId)` returns the exact token ID after its NFT lock.

The POL reserve must be funded before claims are enabled. The contract reverts safely when the reward reserve cannot cover a claim. Deposited principal is never treated as reward liquidity.

## Conservative defaults

- Base APY: 4% (`400` bps).
- Per-NFT bonus: 0.5% (`50` bps).
- Maximum APY: 8% (`800` bps).
- Minimum lock: 7 days.
- Tier bonuses: configured in an eight-element array; current tests use 0%, 0.5%, 1%, 1.5%, and higher bounded tiers.

```text
weight_bps = locked_count * 10_000 + sum(tier_bonus_bps)
effective_apy_bps = min(
  base_apy_bps
    + locked_count * per_nft_bonus_bps
    + sum(tier_bonus_bps),
  max_apy_bps,
)
pol_reward_units = pol_principal
  * effective_apy_bps
  * elapsed_seconds
  / (10_000 * seconds_per_year)
```

The APY parameter is an accounting rule, not a guaranteed return. Mainnet requires an economic model, reserve policy, multisig administration, and independent review.

## Activity indexing

The staking UI at `/staking` reads principal, pending POL rewards, APY, locked token IDs, owned SneakerMint NFTs, and reserve state directly from RPC. Recent activity is loaded through `/api/subgraph`, which proxies the `nuxgraph` Studio deployment configured in `docs/subgraph-integration.md`.

The deployed subgraph must index `POLDeposited`, `POLWithdrawn`, `POLRewardsClaimed`, `Staked`, and `Unstaked` for complete activity history.

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
