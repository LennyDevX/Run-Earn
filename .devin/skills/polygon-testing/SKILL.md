---
name: polygon-testing
description: Test Run-Earn's Hardhat 3 Solidity contracts, native POL staking, SneakerMint NFT boosts, RUNEToken rewards, viem integrations, and subgraph activity.
---

# Run-Earn Polygon Contract Testing

Use this skill whenever modifying contracts, deployment configuration, ABIs, wallet flows, minting, native POL staking, RUNE rewards, NFT boosts, or subgraph activity.

## Test locations

- Solidity tests: `test/*.t.sol` using Hardhat 3's built-in Solidity test runner and `forge-std`.
- TypeScript integration tests: `test/*.ts` using `@nomicfoundation/hardhat-mocha` and `@nomicfoundation/hardhat-viem`.
- Do not place new Solidity tests in the old `tests/` directory; Hardhat 3 discovers Solidity tests from `test/` by default.

## Hardhat 3 test patterns

Use ESM imports and a network connection:

```ts
import hre from "hardhat";
const connection = await hre.network.create();
const { viem } = connection;
const [admin, user] = await viem.getWalletClients();
const contract = await viem.deployContract("SneakerMint", constructorArgs);
```

Use `viem.deployContract`, not Hardhat 2 `getContractFactory`. Use `connection.viem.getTestClient()` for time manipulation/mining and bigint values for POL/RUNE amounts and timestamps.

## Required contract test matrix

### `SneakerMint`

- Roles, nonzero admin, authorized mint, public mint toggle.
- Duplicate/zero proof hash, rarity `0..100`, tier `< 4` (Common, Rare, Epic, Mythic).
- Sequential IDs, traits, pause/unpause, fuzz bounds.

### `RUNEToken`

- ERC-20 name, symbol `RUNE`, decimals, roles, 100M cap.
- Authorized/unauthorized mint, zero recipient, cap boundary.
- Burn, insufficient balance, paused minting and transfers.

### `SneakerStaking`

- Constructor addresses and APY bounds.
- `depositPOL` principal accounting, zero deposit, and total principal.
- `fundPOLRewards`, reserve solvency, empty reserve, claim rounding, and funded POL claims.
- Minimum lock, partial/full `withdrawPOL`, paused-state fund safety, and reentrancy.
- Ownership, approval, duplicate NFT stake, on-chain trait reads, rarity-based APY boost (Common +0.5%, Rare +0.8%, Epic +1.5%, Mythic +1.8%), and max cap.
- Exact NFT return, `stakedTokenIds` add/remove behavior, emergency recovery.
- Legacy RUNE accrual/claims, pending rewards, admin parameter changes, unauthorized calls.

### `SneakerAppraiser`

- Constructor addresses, zero admin/NFT/multiplier reverts.
- `appraise(tokenId)` returns correct value, rarity, and tier for each NFT tier.
- `appraiseRaw(rarity, tier)` matches the formula for arbitrary inputs.
- Global multiplier applies correctly (1x, 1.5x, etc.).
- Admin `updateParams` works and reverts for non-admin and zero multiplier.
- `tierLabel`, `tierBoostBps`, and `tierValueList` view functions return expected values.
- Fuzz: rarity 0..100, tier 0..3.

### `SneakerMarketplace`

- Constructor addresses, fee cap (max 20%), zero premium reverts.
- Listings: escrow NFT, buy splits payment (fee to `accumulatedFees`), cancel returns NFT, wrong payment reverts, seller cannot buy.
- Staked NFTs cannot be listed or auctioned (`stakedOwner` check).
- Auctions: create escrows NFT, bid refunds previous bidder, 1% min increment, settle pays seller minus fee, no-bid settle returns NFT, settle reverts while running, seller cannot bid, bid after end reverts.
- Offers: make escrows POL (NFT stays with owner), accept pays seller minus fee and transfers NFT, cancel refunds bidder, own-token/listed-token reverts, expiry reverts.
- Views: `suggestedPrice` = appraiser × premium; `valueRecommendations` returns 4 tips.
- Admin: `updateParams`, `withdrawFees`, non-admin reverts.

### `SneakerGame`

- Constructor addresses, zero durability/rate reverts, redemption disabled by default.
- Activation: first activation initializes durability, 24h cooldown, streak builds within 48h, resets after break, worn-out reverts, not-owner reverts.
- Accrual: points accrue per second while active (tier base × streak multiplier), stop after the 24h window, stop at 0 durability, already-earned points remain claimable.
- Claim: adds to `veRuneBalance`, clears pending, not-owner reverts.
- Repair: costs veRUNE, restores durability, insufficient-balance reverts.
- Redemption: disabled by default, converts points to REN at `redemptionRate` (integer division), insufficient balance/zero points reverts, requires funded pool.
- Views: `streakMultiplierBps` caps at +50%, `canActivate`, `earnRatePerSecond`, `pendingPoints`.
- Note: `increaseTime` offsets accumulate across Mocha tests — compute deltas from a fresh block timestamp read.

### `VeSneakerStore`

- Constructor zero admin/NFT/treasury reverts.
- `addDesign` stores name/uri/rarity/tier/price/supply; reverts on non-admin, invalid tier, zero price.
- `buy` mints on demand, transfers the exact price to the treasury, writes design rarity/tier into the NFT traits, and uses a unique proof per copy.
- `buyBatch` (2–20) mints multiple copies and charges `price × quantity`; reverts on quantity 1 or > 20.
- Wrong payment, inactive design, unknown design, and paused states revert.
- Supply cap enforced; `updateDesign` reverts when the new cap is below `minted`.
- `reserveMint` counts against supply and reverts for non-admin.
- Views: `quote`, `isAvailable`, `priceOf`, `remaining`, `designCount`, `designs`.
- `receive()` reverts — test stranded-funds recovery with `setBalance`, not a plain transfer.
- Fuzz: batch quantity bounds.

## Subgraph/API checks

- Configure a real query endpoint/API key server-side; never use the Graph deploy key in frontend code.
- Test `GET /api/subgraph?address=0x...` with a valid and invalid address.
- Verify the route handles missing credentials, schema introspection errors, stale indexing, and empty activity safely.
- Compare indexed `POLDeposited`, `POLWithdrawn`, `POLRewardsClaimed`, `Staked`, and `Unstaked` events against RPC receipts.

## Commands

```bash
npx hardhat compile
npx hardhat test solidity
npx hardhat test mocha
npx hardhat test
npm run lint
npm run typecheck
npm run build
```

Before Amoy deployment, all local tests must pass. Before mainnet, add adversarial/invariant coverage, verify deterministic artifacts, use multisig administration, and obtain independent contract/economic reviews.
