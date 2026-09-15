# RUN&EARN

RUN&EARN is a Next.js App Router experience for Polygon sneaker NFTs, native POL staking, RUNE rewards, and community utility.

## Development

The executable project root is this directory (`Run-Earn`), the directory containing `package.json`.

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Polygon setup

The app uses:

- `viem` 2
- EIP-1193 injected wallet provider
- EIP-6963 wallet discovery
- `@metamask/connect-evm`
- `@okxconnect/universal-provider`
- Hardhat 3
- Solidity 0.8.36
- OpenZeppelin Contracts 5.6
- The Graph Studio activity proxy

Desktop extensions and in-app wallet browsers use EIP-6963/EIP-1193. Mobile browsers use the official MetaMask Connect and OKX Universal Provider SDK handoff with deep-link support. The app defaults to Polygon mainnet; set `NEXT_PUBLIC_POLYGON_NETWORK=amoy` for testnet work. User actions are signed by the connected wallet.

- `/mint` generates AI sneaker artwork and a SHA-256 proof locally; production minting still requires verifier authorization.
- `/collection` is the **veSneakers** store: buy virtual sneakers with POL (no physical pair required), then boost staking APY, earn veRUNE, and trade them.
- `/marketplace` lists, buys, auctions, and makes escrowed POL offers on SneakerMint NFTs with on-chain appraiser valuations.
- `/game` runs the daily sneaker activation loop: 24h activations, streak bonuses, durability wear/repair, and veRUNE point redemption.
- `/staking` accepts native POL deposits, tracks POL earnings, locks sneaker NFTs for APY boosts, and shows recent indexed activity.
- `/defi` contains the broader DeFi overview and the staking dashboard.

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Configure public contract values:

```env
NEXT_PUBLIC_SNEAKER_MINT_ADDRESS=
NEXT_PUBLIC_REWARD_TOKEN_ADDRESS=
NEXT_PUBLIC_STAKING_VAULT_ADDRESS=
```

Configure The Graph server values separately. Use a query API key from The Graph Studio API Keys page; the deploy key is for CLI deployment/admin and is not a query key:

```env
THE_GRAPH_QUERY_URL=https://api.studio.thegraph.com/query/<QUERY_API_KEY>/nuxgraph/0.1.0
THE_GRAPH_QUERY_API_KEY=<QUERY_API_KEY>
THE_GRAPH_SUBGRAPH_SLUG=nuxgraph
THE_GRAPH_SUBGRAPH_VERSION=0.1.0
```

The Graph values are server-only and must not use the `NEXT_PUBLIC_*` prefix. See [`docs/subgraph-integration.md`](docs/subgraph-integration.md).

## Checks

```bash
npx hardhat compile
npx hardhat test
npm run lint
npm run typecheck
npm run build
```

## Deploy and fund staking

Configure `POLYGON_AMOY_RPC_URL`, `DEPLOYER_PRIVATE_KEY`, and `POLYGONSCAN_API_KEY` only in the terminal/deployment environment. Never place them in `NEXT_PUBLIC_*` variables.

```bash
DEPLOY_TARGET=all npx hardhat run scripts/deploy.ts --network amoy
FUND_ASSET=POL FUND_AMOUNT=10 STAKING_VAULT_ADDRESS=0x... npx hardhat run scripts/fund-staking.ts --network amoy
```

See [`docs/polygon-test-runbook.md`](docs/polygon-test-runbook.md) for single-contract deployments, verification, and legacy REN funding.

## Documentation

Start with the documentation index at [`docs/README.md`](docs/README.md). Route-by-route
developer docs live in [`docs/app-routes.md`](docs/app-routes.md).

## Agent tooling

Project-specific skills live under `.devin/skills/`: `polygon-contracts`,
`polygon-frontend-evm`, `polygon-testing`, `polygon-security`, `runearn-mint-studio`,
and `runearn-subgraph-activity`.

## Contracts

The current Solidity foundation is:

- `contracts/SneakerMint.sol`
- `contracts/RUNEToken.sol` (symbol `REN`, 100M hard cap)
- `contracts/SneakerStaking.sol`
- `contracts/SneakerAppraiser.sol`
- `contracts/SneakerMarketplace.sol`
- `contracts/SneakerGame.sol`
- `contracts/VeSneakerStore.sol`

`SneakerStaking` separates user POL principal from a funded POL reward reserve. SneakerMint NFTs can be manually locked to increase APY with rarity-based boosts (Common +0.5%, Rare +0.8%, Epic +1.5%, Mythic +1.8%). `SneakerAppraiser` provides on-chain POL value estimates for each NFT based on rarity and tier. `SneakerMarketplace` supports fixed-price sales, English auctions, and POL offers — staked NFTs cannot be listed. `SneakerGame` adds a daily-activation gamification loop with virtual veRUNE points redeemable for REN. `VeSneakerStore` sells virtual sneakers (veSneakers) for POL on demand, no physical pair required. Tokenomics are documented in [`docs/veRune-tokenomics.md`](docs/veRune-tokenomics.md); contract boundaries, economics, and deployment order in [`docs/contract-architecture-plan.md`](docs/contract-architecture-plan.md) and [`docs/polygon-staking-model.md`](docs/polygon-staking-model.md).

No staking or reward contract is treated as production-ready until it has tests, Polygon Amoy validation, economic review, multisig controls, reserve policy, and independent security review.
