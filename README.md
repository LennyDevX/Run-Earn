# Airen

Airen is a virtual sneaker game economy on Polygon: AI-generated sneaker NFTs (veSneakers) that wear out as you play them — and wearing them out is how you earn. Equip mods to keep them alive, stake them to boost a native-POL yield position, and trade them, with virtual veRUNE points backed by the REN token.

**Status: v2.1.0 — live on Polygon mainnet.** All 15 contracts are deployed and verified on PolygonScan (table below). The app currently runs locally; there is no public deployment yet.

## The game economy

Most NFT games die when the floor does. Airen's sneakers have a reason to be used that is not price: they decay whether you play or not, and the mod economy exists because of that decay.

- **veSneakers** (`SneakerMint`) — the core ERC-721s. Generate one from a photo of your sneaker with the AI mint studio — a Gemini vision pass grades the photo and assigns tier and rarity (assigned, never chosen), and a render pass produces the pixel art — or buy a design from the veSneaker store. The first families are **Astra** (Mythic, $150), **Sol** (Rare, $62) and **Luna** (Epic, $97), 1,000 supply each, priced as USD targets converted to POL through a Chainlink feed.

- **Power · Health · Energy** (`SneakerGame`) — every veSneaker earns veRUNE at a power rate set by rarity, loses 1 health per day of real time (plus wear per activation), and spends energy on special abilities. Activating within 48h of the last activation builds a streak (+1%/day, capped at +50%). At 0 health a sneaker stops earning until repaired — repairs cost veRUNE, the point sink that recycles value.

- **Mods & badges** (`SneakerMods`) — a second ERC-721 collection of upgrade NFTs. Achievement badges are claimed by meeting on-chain conditions (streaks, lifetime veRUNE, collection size, POL staked); premium mods are sold by the store.

- **Workshop** (`SneakerWorkshop`) — equip mods into seven slots (sole, upper, lining, skin, core, boost, skill) to cut wear, raise earn rate and appraisal, reduce repair cost, auto-activate daily, amplify staking APY, and run passive skill effects. Consumable mod NFTs burn on use: repair kits restore health, surges skip the cooldown, boost capsules and Overdrive raise earn rate, Stim packs refill energy, service kits reset the seasonal condition. That burn is the demand engine — every repair is a purchase. Condition decays linearly from 100% to 50% over a 365-day season and scales rarity, so earn rate, appraisal and power fall together.

- **Staking** (`SneakerStaking`) — native POL, no wrapping. Base 2.80% APY with rarity tier boosts (+0.5% to +1.8%) and workshop Boost-slot mods on top, hard-capped at 8%. Claims draw from a separately funded POL reward reserve and can never consume staked principal. 30-day minimum lock on withdrawals. Custody invariant: a staked sneaker earns APY but cannot be listed; a listed sneaker cannot be staked — never both.

- **Player levels & skills** (`PlayerProgress`) — on-chain XP from sneakers, mods, lifetime veRUNE, trades, workshop actions, and staked POL drives a 10-level curve. Levels are live standing — selling NFTs or unstaking lowers them. Levels unlock skill NFTs for the workshop's skill slot.

- **Marketplace** (`SneakerMarketplace`) — one venue for every collection: fixed-price sales, English auctions, and escrowed POL offers on sneakers *and* mods, with a 2.5% fee. Fees accrue on-chain and are distributed pro-rata through the `FeeSplitter`.

- **Trades** (`SneakerSwap`) — atomic NFT↔NFT swaps (± POL) across collections.

- **Tab Arena** (`SneakerTabArena`) — a daily tap challenge for players with a staked veSneaker and non-zero POL principal. The server signs the score; the contract recomputes and clamps the multiplier, granting a time-boxed APY boost.

- **veRUNE → REN** — veRUNE is the in-game virtual currency earned by daily activation and spent on repairs and abilities. It is deliberately **not** a token: no liquid asset while the product is in beta, near-zero gas for accrual, and tunable issuance. It redeems for the REN token at 100:1 once the redemption pool is enabled. REN (`RENToken`) is a deployed ERC-20 with a 100M hard cap.

The earlier physical-store and physical-redemption direction is no longer part of the product — Airen is a purely virtual economy.

## Deployed contracts — Polygon mainnet (137)

| Contract | Address | Purpose |
| --- | --- | --- |
| `RENToken` | `0x126D813002999715d2A4c8B7CFDed30bf4e6E800` | ERC-20 "Run and Earn Rune" / `REN`, 100M hard cap |
| `SneakerMint` | `0x61418682E3dC612EA93e15FB3F077C7E6f8fDD0d` | ERC-721 "Airen Sneakers" / `ASNEAK` |
| `SneakerStaking` | `0x0D3775Aa1f7Ddd05E81893369D8ce13C7AF8b6aa` | Native POL vault + NFT APY boosts |
| `SneakerAppraiser` | `0xdd6f463B9E8D8e9c4Da74Df91c84C17e7E110eEf` | Read-only valuation |
| `SneakerMarketplace` | `0x8426767aC2FB0146F57873F8c66b17fD1ca1cF72` | Sales, auctions, offers (2.5% fee) |
| `SneakerGame` | `0x620548db252BAb0Fe981aD3011c0720Cd0bA6108` | veRUNE accrual: power / health / energy |
| `SneakerMods` | `0x48FE0627460ccd4734c5711898F0D60cc08a6a77` | ERC-721 "Airen Mods" / `AMOD` |
| `SneakerWorkshop` | `0x85C93AB07332C3dAC1563124E71fab2e1676C7E8` | 7-slot equip, consumables, 365-day condition |
| `SneakerSwap` | `0x0C7dbB64247f9d31C474AB023c2E961531AB211f` | Atomic NFT↔NFT trades |
| `ModStore` | `0x02d7610a152AB1cA60cb448a22424Db6EC3130AE` | Primary mod sales |
| `VeSneakerStore` | `0xD547499A0435f3080bC24a4a1FE6697828902BA7` | Primary veSneaker sales, USD-anchored |
| `PlayerProgress` | `0x7591DA865497e5a68532E0451d569Bb7258832eb` | XP/levels + public identity |
| `FeeSplitter` | `0xA0c71204f69F059E0380e4f261f36a9AC5bC00e4` | Pro-rata fee distribution |
| `SneakerVault` | `0x932ac2F5aDD52c4Ef6CAa9A095D0B9Ff322336b8` | Live-state perks (discounts, access) |
| `SneakerTabArena` | `0xCA19afF30926Cd5Daf37983015AF648595196de5` | Daily tap challenge → APY boost |

**Treasury:** `0xe7448bC8c43379402308C3D95A62e0cD6Bd48cd7`

`ISneakerBoosts` is the shared seam between contracts: the workshop is the single source of truth for what a sneaker's equipped mods do, and the game, staking, appraiser and marketplace all read it through that one interface.

## App routes

`/` · `/mint` · `/collection` · `/my-nfts` · `/marketplace` · `/workshop` · `/game` · `/play` · `/staking` · `/defi` · `/badges` · `/profile` · `/roadmap` · `/treasury`

API routes include `/api/generate-sneaker` (photo → Gemini grade → pixel-art render → metadata, payable per call with **x402 at $0.75 USDC**, verified end-to-end on mainnet, with the discovery manifest served at `/.well-known/x402`), `/api/pol-price`, `/api/subgraph` (server-only Graph proxy) and `/api/verify-sponsorship` (restricts thirdweb gas sponsorship to Airen's own contracts).

## Development

The executable project root is this directory (`Airen`), the directory containing `package.json`.

```
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

- `/mint` generates AI sneaker artwork through the two-pass Gemini pipeline; generation is payable per call via x402 (USDC) and minting requires authorization.
- `/collection` is the **veSneakers** store: buy virtual sneakers with POL, then boost staking APY, earn veRUNE, equip mods, and trade them.
- `/workshop` is the upgrade hub: live power/health/energy vitals, seven equip slots, and consumable ability NFTs.
- `/badges` lists claimable achievements minted as mod NFTs.
- `/marketplace` lists, buys, auctions, and makes escrowed POL offers on any allowed collection — sneakers and mods — with on-chain appraiser valuations.
- `/game` runs the daily sneaker activation loop: 24h activations, streak bonuses, live health decay, energy refills, and veRUNE point redemption.
- `/staking` accepts native POL deposits, tracks POL earnings, locks sneaker NFTs for APY boosts (including Boost mods), and shows recent indexed activity.
- `/defi` contains the broader DeFi overview and the staking dashboard.
- `/treasury` is a public view of what the protocol holds *and* what is owed: accrued marketplace fees sit next to the balance, because a 0 POL balance can mean money is waiting, not missing.

Copy `.env.example` to `.env.local`:

```
cp .env.example .env.local
```

Configure public contract values:

```
NEXT_PUBLIC_SNEAKER_MINT_ADDRESS=
NEXT_PUBLIC_REWARD_TOKEN_ADDRESS=
NEXT_PUBLIC_STAKING_VAULT_ADDRESS=
```

Configure The Graph server values separately. Use a query API key from The Graph Studio API Keys page; the deploy key is for CLI deployment/admin and is not a query key:

```
THE_GRAPH_QUERY_URL=https://api.studio.thegraph.com/query/<QUERY_API_KEY>/nuxgraph/0.1.0
THE_GRAPH_QUERY_API_KEY=<redacted>
THE_GRAPH_SUBGRAPH_SLUG=nuxgraph
THE_GRAPH_SUBGRAPH_VERSION=0.1.0
```

The Graph values are server-only and must not use the `NEXT_PUBLIC_*` prefix. See `docs/subgraph-integration.md`.

## Checks

```
npx hardhat compile
npx hardhat test
npm run lint
npm run typecheck
npm run build
```

394 Solidity tests (forge-std) and 136 Mocha tests, all passing.

## Deploy and fund staking

The contracts above were deployed with `scripts/deploy.ts`, which performs the full deploy, wiring and PolygonScan verification; its `VERIFY_ONLY` mode re-verifies an existing deployment without redeploying. Operational scripts live in `scripts/`: `treasury-audit.ts` (prints every payout address **read from the contracts** — the only source of truth, since the deploy script defaults unset treasury variables to the admin address), `set-treasury.ts`, `collect-fees.ts` (the two-hop marketplace fee keeper), `fund-staking.ts` (funds the POL reward reserve), `mint-veSneakers.ts` and `seed-skills.ts`.

Configure `POLYGON_AMOY_RPC_URL`, `DEPLOYER_PRIVATE_KEY`, and `POLYGONSCAN_API_KEY` only in the terminal/deployment environment. Never place them in `NEXT_PUBLIC_*` variables.

```
DEPLOY_TARGET=all npx hardhat run scripts/deploy.ts --network amoy
FUND_ASSET=POL FUND_AMOUNT=10 STAKING_VAULT_ADDRESS=0x... npx hardhat run scripts/fund-staking.ts --network amoy
```

See `docs/polygon-test-runbook.md` for single-contract deployments and verification.

## Documentation

Start with the documentation index at `docs/README.md`. Route-by-route developer docs live in `docs/app-routes.md`; economics in `docs/veRune-tokenomics.md` and `docs/polygon-staking-model.md`; money paths in `docs/treasury.md`.

## Agent tooling

Project-specific skills live under `.devin/skills/`: `polygon-contracts`, `polygon-frontend-evm`, `polygon-testing`, `polygon-security`, `airen-mint-studio`, and `airen-subgraph-activity`.

## Security status

The contracts are live on mainnet but **unaudited** — no independent contract or economic review has been performed, and the test suites are not an audit. All 15 contracts are currently administered by a single EOA, which is also the treasury; moving administration and the treasury to a multisig is the highest-value hardening step remaining. Treat every figure in this README as describing a beta protocol with no revenue history.
