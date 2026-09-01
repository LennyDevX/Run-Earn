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
- Duplicate/zero proof hash, rarity `0..100`, tier `< 8`.
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
- Ownership, approval, duplicate NFT stake, on-chain trait reads, APY boost, and max cap.
- Exact NFT return, `stakedTokenIds` add/remove behavior, emergency recovery.
- Legacy RUNE accrual/claims, pending rewards, admin parameter changes, unauthorized calls.

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
