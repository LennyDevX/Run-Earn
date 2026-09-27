# Airen

Airen is a virtual sneaker game economy on Polygon: AI-minted sneaker NFTs (veSneakers) that you upgrade, trade, rent, and put to work — with native POL staking, virtual veRUNE points, and the REN token on the horizon.

## v1.0 — Virtual sneaker game economy

This release delivers the core contracts and base concepts of the game, developed and tested end-to-end and ready for Polygon Amoy deployment. Nothing is deployed to mainnet yet; this is the deployment-ready foundation designed to scale.

**What v1.0 includes:**

- **veSneakers** (`SneakerMint`) — the core ERC-721s. Create them with the AI mint studio from a photo of your sneaker, or buy designs from the veSneaker store. The first pixel-art families are Astra, Sol, and Luna. Fully virtual, playable, upgradeable, tradable.
- **Power · Health · Energy** (`SneakerGame`) — every veSneaker mines veRUNE at a power rate set by rarity, loses 1 health/day of real time (plus wear per activation), and spends energy on special abilities. A worn-out sneaker stops mining until repaired.
- **Mods & badges** (`SneakerMods`) — a second ERC-721 collection of upgrade NFTs. Achievement badges are claimed by meeting on-chain conditions (streaks, lifetime veRUNE, collection size, POL staked); premium mods are sold by the store.
- **Workshop** (`SneakerWorkshop`) — equip mods into seven slots (sole, upper, lining, skin, core, boost, skill) to cut wear, raise health and appraisal, auto-activate daily, amplify staking APY, and run passive skill effects. Consumable mod NFTs burn on use: repair kits restore health, surge triggers instant activation, boost capsules and Overdrive raise earn rate for 24–48h, Stim packs refill energy, Lucky repairs heal and boost, and forge stones grant a free forge level — fueling a burn-driven economy.
- **Player levels & skills** (`PlayerProgress`) — on-chain XP from sneakers, mods, trades, workshop actions, and staked POL drives a 10-level curve. Levels unlock skill NFTs: one free claim each, extra copies sold in the stores, equipped in the workshop's skill slot or burned as consumable abilities.
- **Marketplace V2** (`SneakerMarketplace`) — one venue for every collection: fixed-price sales, English auctions, and escrowed POL offers on sneakers *and* mods.
- **Trades & rentals** (`SneakerSwap`, `ModRental`) — atomic NFT↔NFT swaps (± POL) and time-boxed mod rentals.
- **veRUNE → REN** — veRUNE is the in-game virtual currency earned by daily activation and spent on repairs and forging; it redeems for the REN token once the reward pool opens.

The earlier physical-store and physical-redemption direction is no longer part of the product — Airen is a purely virtual economy.

## Development

The executable project root is this directory (`Airen`), the directory containing `package.json`.

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
- `/collection` is the **veSneakers** store: buy virtual sneakers with POL, then boost staking APY, earn veRUNE, equip mods, and trade them.
- `/workshop` is the upgrade hub: live power/health/energy vitals, six equip slots, consumable ability NFTs, and the veRUNE forge.
- `/badges` lists claimable achievements minted as mod NFTs.
- `/marketplace` lists, buys, auctions, and makes escrowed POL offers on any allowed collection — sneakers and mods — with on-chain appraiser valuations.
- `/game` runs the daily sneaker activation loop: 24h activations, streak bonuses, live health decay, energy refills, and veRUNE point redemption.
- `/staking` accepts native POL deposits, tracks POL earnings, locks sneaker NFTs for APY boosts (including Boost mods), and shows recent indexed activity.
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
`polygon-frontend-evm`, `polygon-testing`, `polygon-security`, `airen-mint-studio`,
and `airen-subgraph-activity`.

## Contracts

The current Solidity foundation is:

- `contracts/SneakerMint.sol`
- `contracts/RENToken.sol` (symbol `REN`, 100M hard cap)
- `contracts/SneakerStaking.sol`
- `contracts/SneakerAppraiser.sol`
- `contracts/SneakerMarketplace.sol`
- `contracts/SneakerGame.sol`
- `contracts/VeSneakerStore.sol`
- `contracts/ISneakerBoosts.sol` — shared boost interface read by game, staking, appraiser, and marketplace
- `contracts/SneakerMods.sol` — ERC-721 upgrade/badge collection with on-chain achievement claims
- `contracts/SneakerWorkshop.sol` — seven-slot equip system, consumable ability NFTs, and the veRUNE forge
- `contracts/SneakerSwap.sol` — atomic NFT↔NFT trades (± POL) across collections
- `contracts/ModRental.sol` — time-boxed mod rentals paid in POL
- `contracts/ModStore.sol` — primary sale of premium mod designs (incl. `requiredLevel` gates)
- `contracts/PlayerProgress.sol` — live-state XP/levels plus public username/NFT-avatar identity

`SneakerStaking` separates user POL principal from a funded POL reward reserve. SneakerMint NFTs can be manually locked to increase APY with rarity-based boosts (Common +0.5%, Rare +0.8%, Epic +1.5%, Mythic +1.8%) plus Boost-mod bonuses via the workshop. `SneakerAppraiser` provides on-chain POL value estimates for each NFT based on rarity, tier, forge level, and equipped Skin mods. `SneakerMarketplace` supports fixed-price sales, English auctions, and POL offers across approved collections — staked NFTs and sneakers with equipped mods cannot be listed. `SneakerGame` runs the mining loop — rarity-scaled power, daily health decay, and energy for consumable abilities — with virtual veRUNE points redeemable for REN and workshop effects (earn bonus, wear reduction, repair discount, auto-activation) applied on-chain. `VeSneakerStore` sells virtual sneakers (veSneakers) for POL on demand; `ModStore` does the same for premium upgrade mods. Tokenomics are documented in [`docs/veRune-tokenomics.md`](docs/veRune-tokenomics.md); contract boundaries, economics, and deployment order in [`docs/contract-architecture-plan.md`](docs/contract-architecture-plan.md) and [`docs/polygon-staking-model.md`](docs/polygon-staking-model.md).

No staking or reward contract is treated as production-ready until it has tests, Polygon Amoy validation, economic review, multisig controls, reserve policy, and independent security review.
