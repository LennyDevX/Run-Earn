# RUN&EARN Contract Architecture Plan

> Current architecture — August 2026
> Target: Polygon Amoy (testnet) → Polygon Mainnet
> Toolchain: Hardhat 3, Solidity 0.8.36, OpenZeppelin Contracts 5.6, viem 2, The Graph Studio

## Contract rename map

| Retired name | Current name | File | Purpose |
| --- | --- | --- | --- |
| `SneakerCollection` | `SneakerMint` | `contracts/SneakerMint.sol` | ERC-721 minting for AI-generated sneaker artwork |
| `SneakerRewards` / `LaceToken` / `RuneToken` | `RUNEToken` | `contracts/RUNEToken.sol` | ERC-20 RUNE reward token |
| `SneakerStaking` | `SneakerStaking` | `contracts/SneakerStaking.sol` | Native POL vault with NFT APY boosts |

## Current Phase 1 foundation

### `SneakerMint.sol`

- `mintAuthorized` is the production verifier path.
- `mintWithProof` is the explicitly gated Amoy/beta path.
- Proof hashes are nonzero and single-use.
- Rarity is bounded `0..100`; tier is bounded `< 8`.
- The frontend uses `NEXT_PUBLIC_SNEAKER_MINT_ADDRESS`.
- Raw photos and personal data remain off-chain.

### `RUNEToken.sol`

- ERC-20 name `Run and Earn Rune`, symbol `RUNE`, decimals `18`.
- `MAX_SUPPLY` is 100M RUNE.
- `MINTER_ROLE` controls minting.
- Transfers and minting are pausable.
- This token remains available for the legacy NFT reward path.

### `SneakerStaking.sol`

The vault supports two accounting paths:

1. **Native POL path:** users call `depositPOL()`, receive passive POL rewards, and call `withdrawPOL()` after the lock period.
2. **NFT boost path:** users call `stake(tokenId)`. The vault reads `SneakerMint.traitsOf(tokenId)`, stores the exact receipt, and increases the effective APY for the user's POL position.

Current default economics are 4% base APY, 0.5% per-NFT bonus, 8% maximum APY, and a 7-day lock. The admin must fund the POL reward reserve with `fundPOLRewards()`. Claims can never consume `totalPOLPrincipal`.

The legacy RUNE NFT reward path (`claimRewards`) remains for compatibility, but it is separate from POL rewards.

**POL formula:**

```text
weight_bps = locked_count * 10_000 + sum(tier_bonus_bps)
effective_apy_bps = min(
  base_apy_bps + locked_count * per_nft_bonus_bps + sum(tier_bonus_bps),
  max_apy_bps
)
pol_rewards = pol_principal * effective_apy_bps * elapsed_seconds
  / (10_000 * 31_536_000)
```

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

1. Deploy `RUNEToken`.
2. Deploy `SneakerMint`.
3. Deploy `SneakerStaking` with NFT and RUNE addresses.
4. Fund the POL reward reserve.
5. Configure frontend contract addresses and server-only Graph query settings.
6. Test `/staking` on Polygon Amoy with a disposable wallet.
7. Verify subgraph activity after indexing.
8. Use multisig administration and deterministic artifacts before mainnet.
