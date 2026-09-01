# Polygon EVM contracts

Current foundation: Solidity 0.8.36, Hardhat 3, OpenZeppelin Contracts 5.6.

## Contracts

| Contract | File | Purpose |
| --- | --- | --- |
| `SneakerMint` | `SneakerMint.sol` | ERC-721 minting for AI-generated sneaker artwork |
| `RUNEToken` | `RUNEToken.sol` | ERC-20 RUNE reward token with 100M supply cap |
| `SneakerStaking` | `SneakerStaking.sol` | Native POL staking with optional sneaker NFT APY boosts |

## Current staking behavior

- `depositPOL()` accepts native POL and records user principal.
- `withdrawPOL(amount)` returns principal after the minimum lock period.
- `fundPOLRewards()` adds POL to the admin-controlled reward reserve.
- `claimPOLRewards()` pays POL only from reserve liquidity above `totalPOLPrincipal`.
- `stake(tokenId)` reads on-chain rarity/tier from `SneakerMint` and increases the user's effective APY.
- `stakedTokenIds(owner)` provides the exact NFT list needed by the unlock UI.
- The legacy NFT RUNE reward path remains available through `claimRewards`.

Default economics are 4% base APY, 0.5% per-NFT bonus, 8% maximum APY, and a 7-day minimum lock. See [`docs/polygon-staking-model.md`](../docs/polygon-staking-model.md).

## Frontend and subgraph

The staking UI is at `/staking`. Contract addresses use:

```env
NEXT_PUBLIC_SNEAKER_MINT_ADDRESS=
NEXT_PUBLIC_REWARD_TOKEN_ADDRESS=
NEXT_PUBLIC_STAKING_VAULT_ADDRESS=
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

# Fund native POL rewards from the configured wallet
FUND_ASSET=POL FUND_AMOUNT=10 STAKING_VAULT_ADDRESS=0x... npx hardhat run scripts/fund-staking.ts --network amoy
```

`deploy.ts` verifies deployed source with Hardhat Verify when `POLYGONSCAN_API_KEY` is configured. `fund-staking.ts` validates the signer, network, admin role, balance, receipt, and reserve delta before completing. Set `FUNDING_PRIVATE_KEY` to fund from a personal wallet separate from the deployer.
