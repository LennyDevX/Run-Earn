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

## Daily Tab Challenge (shipped)

A once-per-24h tap challenge grants a **time-boxed** staking APY boost of
**0.50% – 1.50%**, written into `SneakerStaking` by `SneakerTabArena`. It is
modelled as an extra term inside the existing APY clamp, never as a new reward
stream.

### Where it fits in the formula

```text
requested = baseApyBps (280)
          + lockedCount * perNftBonusBps (0)
          + Σ tierBonusBps          // 50 / 80 / 150 / 180 per locked NFT
          + Σ stakingBoostBps       // Boost-slot mods on locked sneakers
          + tabBoostBps             // ← 0 when no session is active
effective = min(requested, maxApyBps = 800)
```

Because the tab boost is added **before** the clamp, it can never lift a wallet
above the 8.00% hard cap. A Mythic holder with a Boost mod who is already near
the cap simply absorbs no extra cost — the protocol's liability stays bounded by
a constant that already exists.

### Access gate

A session requires **both**:

1. `polPositions(caller).principal > 0` — otherwise the boost has no APY to
   apply to.
2. `staking.stakedOwner(runnerId) == caller` — the runner must be locked in the
   vault. The 30-day minimum lock only delays *withdrawal*, not play, so a player
   can stake and open their first session the same day.

### Level ladder

Levels are measured in **points**, not taps. A stronger veSneaker earns more
points per tap, so the same ladder clears in fewer taps:

| Level | Points | Boost granted |
| ----- | ------ | ------------- |
| 1     | 50     | +0.50%        |
| 2     | 100    | +0.70%        |
| 3     | 175    | +0.90%        |
| 4     | 275    | +1.10%        |
| 5     | 400    | +1.30%        |
| 6     | 600    | +1.50%        |

### Power score → ceiling and multiplier

Power is **derived**, never stored. It is the live sum of the pair's base rarity
(scaled by wear) and the mods currently equipped:

```text
power_score = min(rarity * conditionBps / 10000 + equipped_mods * 5, 100)
ceiling_bps = 50 + power_score          // 0.50% .. 1.50%
awarded_bps = min(level_boost_bps, ceiling_bps)
```

| Power score | Points per tap | Taps to clear L6 (600 pts) |
| ----------- | -------------- | -------------------------- |
| 0–25        | ×1             | 600                        |
| 26–50       | ×2             | 300                        |
| 51–75       | ×3             | 200                        |
| 76–100      | ×4             | 150                        |

**This is the whole payoff for upgrading.** Power changes how *fast* a player
clears the ladder, never how *much* they can earn — the boost ceiling is a
separate cap and the multiplier does not touch it. Protocol liability is
therefore identical regardless of which NFT is used.

### veSneaker condition (365-day season)

`SneakerWorkshop` tracks `lastServiceAt[tokenId]`. Condition decays linearly from
`10000` to `conditionFloorBps` (5000) over `seasonSeconds` (365 days). A pair
that has never been equipped reads pristine, so an unused sneaker does not wear.

Consumers scale rarity by condition, so wear drags the earn rate, the appraisal,
and the tab power score down together:

```text
effective_rarity = rarity * conditionBps / 10000
```

The **repair kit** (aux 0/255) restores health and condition; the **service kit**
(aux 3) restores condition only. Neither costs energy, so a worn-out pair is
always revivable.

**Mods never expire.** Every slot item is a permanent ERC-721 the owner keeps,
sells, or gifts. The sneaker is what wears — that is what makes consumables the
recurring sink.

### Trust model

Taps happen off-chain, so the completed score arrives as an EIP-191 signature
from an admin `signer` (produced by `/api/tab-session`). The contract never
trusts it blindly:

| Risk | Mitigation |
| ---- | ---------- |
| Scripted taps | Server-side rate and plausibility checks before signing |
| Inflated multiplier | The contract **recomputes** power on-chain; a signed multiplier is ignored |
| Unbounded score | Clamped to `multiplier * MAX_TAPS_PER_SESSION` (600) |
| Replayed signature | Per-wallet nonce consumed on completion |
| Malleable signature | `s` is rejected above `secp256k1n/2` |
| Buggy or compromised arena | `SneakerStaking.setTabBoost` re-clamps to `maxTabBoostBps` (150) |

### Why this stays sustainable

| Path                     | bps  | Annualised cost on principal |
| ------------------------ | ---- | ---------------------------- |
| Mythic tier boost        | 180  | 1.80%                        |
| Boost-slot mod (typical) | ~300 | ~3.00%                       |
| **Tab challenge (max)**  | 150  | **1.50%**                    |

1. **Cheaper than what already exists.** The 1.50% ceiling is below the 1.80%
   Mythic tier boost the vault already pays.
2. **Time-boxed.** The boost lasts 24h from completion and never auto-renews.
   Reaching 1.50% annualised requires completing a session every single day.
3. **One session per wallet per 24h.** Sessions do not stack.
4. **Requires a locked NFT and staked POL.** The boost applies to staking yield,
   so the player has skin in the game before they can earn it.
5. **Still reserve-funded.** `claimPOLRewards` pays only from the funded surplus
   above `totalPOLPrincipal` and reverts when the reserve cannot cover a claim.
6. **The cap is unchanged.** `maxApyBps × TVL` remains the absolute worst-case
   liability. The tab game changes who reaches the cap and how fast, never the
   number itself.

The APY remains a parameter, not a guaranteed return.



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
