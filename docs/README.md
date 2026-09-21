# RUN&EARN documentation index

Entry point for developers working on the RUN&EARN Polygon dApp. Start with
[`app-routes.md`](app-routes.md) if you are touching the frontend, or
[`contract-architecture-plan.md`](contract-architecture-plan.md) if you are touching
Solidity.

## Frontend

| Doc | What it covers |
| --- | --- |
| [`app-routes.md`](app-routes.md) | Every route (`/mint`, `/collection` (veSneakers + mod stores), `/workshop`, `/badges`, `/my-nfts`, `/marketplace`, `/game`, `/staking`, `/defi`, `/roadmap`, APIs): files, contracts, hooks, flows, edge cases, and how to add a route |
| [`wallet-connectivity.md`](wallet-connectivity.md) | EIP-6963 discovery, MetaMask Connect, OKX Universal Provider, chain guard, mobile handoff |
| [`mobile-experience.md`](mobile-experience.md) | Bottom navigation, safe areas, touch ergonomics, reduced motion, PWA shell, and the future mobile/UI/UX/performance roadmap |
| [`subgraph-integration.md`](subgraph-integration.md) | The Graph Studio `nuxgraph` deployment, the `/api/subgraph` proxy, dynamic schema introspection |
| [`uniswap-price-feed.md`](uniswap-price-feed.md) | Live POL/USD via the Uniswap Trading API, the `/api/pol-price` proxy, caching, and fallback behavior |

## Contracts

| Doc | What it covers |
| --- | --- |
| [`contract-architecture-plan.md`](contract-architecture-plan.md) | Contract inventory, rename map, per-contract responsibilities, POL formula, custody invariants, deployment order |
| [`polygon-contract-roadmap.md`](polygon-contract-roadmap.md) | Shipped vs planned contracts and the recommended build/deploy order |
| [`polygon-staking-model.md`](polygon-staking-model.md) | Native POL staking, rarity-based NFT boosts, reward reserve accounting, appraiser valuation |
| [`veRune-tokenomics.md`](veRune-tokenomics.md) | 100M REN allocation, veRUNE accrual (power/health/energy stats, 24h activation, streaks, consumable abilities), veSneaker primary-sale pricing, redemption economics |
| [`polygon-test-runbook.md`](polygon-test-runbook.md) | Test matrix, Amoy deployment and verification runbook, funding steps |

## Skills

Agent skills live in `.devin/skills/` and are loaded automatically when their topic
matches a task.

| Skill | Use for |
| --- | --- |
| `polygon-contracts` | Solidity contract design, ABIs, Hardhat 3, deployment scripts |
| `polygon-frontend-evm` | Wallet UX, RPC reads, route/hook work, viem integration |
| `polygon-testing` | Solidity + TypeScript test matrices for all contracts |
| `polygon-security` | Custody, arithmetic, escrow, and deployment risk review |
| `runearn-upgrade-economy` | The mod/badge economy: SneakerMods, Workshop slots, consumable abilities, swaps, rentals, ModStore, power/health/energy stats |
| `runearn-mint-studio` | The AI photo → artwork → mint pipeline and local collection storage |
| `runearn-subgraph-activity` | Activity indexing, schema introspection, the subgraph proxy |
| `swap-integration` (Uniswap) | Official Uniswap Trading API / Universal Router reference — quotes, swaps, Permit2, UniswapX, error codes |
| `viem-integration` (Uniswap) | Official EVM/viem integration patterns |

The two Uniswap skills are installed from `Uniswap/uniswap-ai` into `.agents/skills/`
(`npx skills add Uniswap/uniswap-ai --skill swap-integration viem-integration`).

## Verification commands

```bash
npm run lint
npm run typecheck
npm run build
npx hardhat compile
npx hardhat test          # 354 tests (250 Solidity + 104 TypeScript)
```

## Mobile

The app ships a bottom navigation bar, safe-area aware layout, 44px tap targets, a
reduced-motion mode, and an installable PWA shell. Conventions for adding routes or
interactive components — plus the roadmap for haptics, Web Share, and more — live in
[`mobile-experience.md`](mobile-experience.md).

## Conventions

- New configuration goes in `.devin/` (skills, config), never `.claude/` or `.cursor/`.
- Public config uses `NEXT_PUBLIC_*`; secrets (Gemini key, Graph keys, deployer key) stay
  server-side.
- Contract addresses are optional at build time: pages must degrade gracefully when an
  address is missing (demo mode), never crash.
- The ERC-20 symbol is `REN`; `veRUNE` is virtual, non-transferable game state.
