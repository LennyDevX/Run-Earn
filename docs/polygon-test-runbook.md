# Polygon Amoy test runbook

The frontend uses viem with an EIP-1193 injected wallet provider. The current contracts are `SneakerMint`, `RUNEToken`, and `SneakerStaking`. Amoy is the default test environment; this runbook is not a mainnet deployment approval.

## 1. Configure the app

Copy `.env.example` to `.env.local` and fill public values only:

```env
NEXT_PUBLIC_POLYGON_NETWORK=amoy
NEXT_PUBLIC_POLYGON_RPC_URL=https://rpc-amoy.polygon.technology
NEXT_PUBLIC_POLYGON_EXPLORER=https://amoy.polygonscan.com
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=
NEXT_PUBLIC_SNEAKER_MINT_ADDRESS=<sneaker-mint-address>
NEXT_PUBLIC_REWARD_TOKEN_ADDRESS=<rune-token-address>
NEXT_PUBLIC_STAKING_VAULT_ADDRESS=<staking-vault-address>

THE_GRAPH_QUERY_URL=https://api.studio.thegraph.com/query/<QUERY_API_KEY>/nuxgraph/0.1.0
THE_GRAPH_QUERY_API_KEY=<QUERY_API_KEY>
THE_GRAPH_SUBGRAPH_SLUG=nuxgraph
THE_GRAPH_SUBGRAPH_VERSION=0.1.0
```

Use a **query API key** from The Graph Studio API Keys page. The deployment key is for CLI deployment/admin and is not a query key. Keep both Graph values server-only. Restart Next after changing environment values.

## 2. Install and verify

```bash
npm install
npx hardhat --version
npx hardhat compile
```

The project expects Hardhat 3, Solidity 0.8.36, and OpenZeppelin Contracts 5.6.

## 3. Run all checks

```bash
npx hardhat test solidity
npx hardhat test mocha
npx hardhat test
npm run lint
npm run typecheck
npm run build
```

Do not deploy if contract tests or application checks fail.

## 4. Deploy to Polygon Amoy

Deploy from a disposable wallet outside the repository:

1. `RUNEToken(admin, minter)`.
2. `SneakerMint(name, symbol, admin)`.
3. `SneakerStaking(admin, sneakerMint, runeToken, rewardRate, baseApy, perNftBonus, maxApy, tierBonuses, minLock)`.
4. Fund the POL reward reserve with `SneakerStaking.fundPOLRewards()`.
5. Fund the legacy RUNE vault only if the NFT RUNE reward path is enabled.
6. Keep public mint disabled unless deliberately testing the beta path.
7. Record deployed addresses in `.env.local`.

## 5. Staking route demo

1. Open `/staking`.
2. Connect a Polygon Amoy wallet.
3. Deposit POL and verify `POLDeposited` in the receipt/logs.
4. Confirm the principal, pending rewards, APY, and POL reserve cards update.
5. Open the sneaker boost section and lock a SneakerMint NFT.
6. Verify `effectiveApyBps` increases according to rarity/tier.
7. Claim POL rewards only after the reward reserve is funded.
8. Withdraw POL after the minimum lock period.
9. Unlock NFTs after their minimum lock period.
10. Confirm recent activity appears through `/api/subgraph` after indexing.

## 6. Subgraph verification

The `/api/subgraph?address=0x...` route introspects the configured `nuxgraph` schema and normalizes address-indexed activity. Test the route after setting the query endpoint. The subgraph should expose entities for POL deposits, withdrawals, reward claims, NFT stakes, and NFT unstakes.

If the activity panel is empty but RPC state works, inspect the subgraph schema and publish a mapping version that indexes the new POL events.

## 7. Security gates before mainnet

- Use multisig admin and treasury controls.
- Verify deterministic build artifacts and deployed bytecode.
- Verify the POL reserve cannot be drained below user principal.
- Test pause, emergency recovery, empty reserve, unauthorized calls, replay, custody, and reentrancy cases.
- Keep the query API key server-only and rotate any key that was exposed.
- Obtain independent smart-contract and economic security reviews.

## 8. Deployment scripts

Set the terminal-only variables in `.env.local` or the deployment environment. `DEPLOYER_PRIVATE_KEY` is the signer used for gas; `DEPLOY_ADMIN_ADDRESS` can be a multisig or separate admin.

Deploy all three contracts and verify them:

```bash
DEPLOY_TARGET=all npx hardhat run scripts/deploy.ts --network amoy
```

Deploy and verify one contract:

```bash
DEPLOY_TARGET=RUNEToken npx hardhat run scripts/deploy.ts --network amoy
DEPLOY_TARGET=SneakerMint npx hardhat run scripts/deploy.ts --network amoy
DEPLOY_TARGET=SneakerStaking \
  RUNE_TOKEN_ADDRESS=0x... \
  SNEAKER_MINT_ADDRESS=0x... \
  npx hardhat run scripts/deploy.ts --network amoy
DEPLOY_TARGET=SneakerAppraiser \
  SNEAKER_MINT_ADDRESS=0x... \
  npx hardhat run scripts/deploy.ts --network amoy
```

Use `SKIP_VERIFY=true` only for local or intentionally unverified deployments. The deployment manifest is saved under `deployments/<network>.json` and is ignored by git.

## 9. Fund the staking reward reserve

The default funding asset is native POL. The signer must have `DEFAULT_ADMIN_ROLE` on `SneakerStaking` because `fundPOLRewards()` is admin-only:

```bash
FUND_ASSET=POL FUND_AMOUNT=10 STAKING_VAULT_ADDRESS=0x... \
  npx hardhat run scripts/fund-staking.ts --network amoy
```

The script validates network, signer, balance, admin role, receipt status, and reserve balance before/after funding. Set `FUNDING_PRIVATE_KEY` to use a personal funding wallet different from `DEPLOYER_PRIVATE_KEY`; otherwise it uses the configured deployer signer.

For the legacy RUNE reward vault:

```bash
FUND_ASSET=RUNE FUND_AMOUNT=1000 \
  STAKING_VAULT_ADDRESS=0x... RUNE_TOKEN_ADDRESS=0x... \
  npx hardhat run scripts/fund-staking.ts --network amoy
```

On Windows PowerShell, set variables for the command like this:

```powershell
$env:DEPLOY_TARGET = "RUNEToken"
npx hardhat run scripts/deploy.ts --network amoy

$env:FUND_ASSET = "POL"
$env:FUND_AMOUNT = "10"
$env:STAKING_VAULT_ADDRESS = "0x..."
npx hardhat run scripts/fund-staking.ts --network amoy
```
