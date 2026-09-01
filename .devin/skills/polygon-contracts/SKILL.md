---
name: polygon-contracts
description: Design, implement, test, and integrate Run-Earn Solidity contracts for Polygon with Hardhat 3, OpenZeppelin, ERC-20 RUNE rewards, ERC-721 sneaker NFTs, native POL staking, and NFT APY boosts.
---

# Run-Earn Polygon Contracts

Use this skill for EVM contract design, Solidity implementation, Hardhat 3 configuration, deployment preparation, ABI integration, and viem contract workflows.

## Current contract architecture

| Contract | File | Responsibility |
| --- | --- | --- |
| `SneakerMint` | `contracts/SneakerMint.sol` | ERC-721 minting for AI-generated sneaker artwork |
| `RUNEToken` | `contracts/RUNEToken.sol` | ERC-20 RUNE reward token with a 100M hard cap |
| `SneakerStaking` | `contracts/SneakerStaking.sol` | Native POL staking vault with optional sneaker NFT APY boosts |

Do not reintroduce `SneakerCollection`, `SneakerRewards`, `LaceToken`, or `RuneToken` in new code, tests, docs, environment variables, or deployment scripts.

## Current staking model

- `depositPOL()` accepts native POL and tracks principal in `POLPosition`.
- `withdrawPOL(amount)` returns principal after the minimum lock.
- `claimPOLRewards()` pays POL only from the funded reserve above `totalPOLPrincipal`.
- `fundPOLRewards()` is admin-only and must be backed by an economic budget.
- `stake(tokenId)` reads rarity/tier from `SneakerMint` and increases the user's effective APY.
- `stakedTokenIds(owner)` supports exact NFT unlock UI.
- Existing RUNE NFT rewards remain available through `claimRewards` for compatibility.

Current defaults are 4% base APY, 0.5% per-NFT bonus, 8% maximum APY, and a 7-day lock.

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

- `scripts/deploy.ts` supports `DEPLOY_TARGET=all|RUNEToken|SneakerMint|SneakerStaking` and writes an ignored deployment manifest.
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
