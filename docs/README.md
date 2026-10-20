# Airen documentation index

Entry point for developers working on the Airen Polygon dApp. Start with
[`app-routes.md`](app-routes.md) if you are touching the frontend, or
[`contract-architecture-plan.md`](contract-architecture-plan.md) if you are touching
Solidity.

## Frontend

| Doc | What it covers |
| --- | --- |
| [`app-routes.md`](app-routes.md) | Every route (`/mint`, `/collection` (veSneakers + mod stores), `/workshop`, `/badges`, `/my-nfts`, `/marketplace`, `/game`, `/staking`, `/defi`, `/roadmap`, `/profile`, APIs): files, contracts, hooks, flows, edge cases, and how to add a route |
| [`wallet-connectivity.md`](wallet-connectivity.md) | EIP-6963 discovery, MetaMask Connect, OKX Universal Provider, the thirdweb in-app wallet (email/social), chain guard, mobile handoff |
| [`treasury.md`](treasury.md) | How the treasury works: the direct vs routed money paths (with a diagram), why a 0 POL balance can hide earned revenue, the two-step fee keeper, the scripts, and the `/treasury` public view |
| [`thirdweb-gas-sponsorship.md`](thirdweb-gas-sponsorship.md) | In-app wallet gas sponsorship: the EIP-7702 setup, why an unconstrained paymaster is an unbounded spend, the `/api/verify-sponsorship` contract allowlist, dashboard steps, and how to verify |
| [`mobile-experience.md`](mobile-experience.md) | Bottom navigation, safe areas, touch ergonomics, reduced motion, PWA shell, what Mobile v2.0 shipped, and the remaining mobile roadmap |
| [`Plan_Mobile_v2.0.md`](Plan_Mobile_v2.0.md) | The mobile v2.0 plan: robustness gaps (no error/loading/404 boundaries), platform capabilities, retention, performance, inclusivity — with what was deliberately excluded and why |
| [`subgraph-integration.md`](subgraph-integration.md) | The Graph Studio `nuxgraph` deployment, the `/api/subgraph` proxy, dynamic schema introspection |
| [`uniswap-price-feed.md`](uniswap-price-feed.md) | Live POL/USD via the Uniswap Trading API, the `/api/pol-price` proxy, caching, and fallback behavior |

## Contracts

| Doc | What it covers |
| --- | --- |
| [`contract-architecture-plan.md`](contract-architecture-plan.md) | Contract inventory, rename map, per-contract responsibilities, POL formula, custody invariants, deployment order |
| [`polygon-contract-roadmap.md`](polygon-contract-roadmap.md) | Shipped vs planned contracts and the recommended build/deploy order |
| [`polygon-staking-model.md`](polygon-staking-model.md) | Native POL staking, rarity-based NFT boosts, reward reserve accounting, appraiser valuation |
| [`veRune-tokenomics.md`](veRune-tokenomics.md) | 100M REN allocation, veRUNE accrual (power/health/energy stats, 24h activation, streaks, consumable abilities), veSneaker primary-sale pricing, redemption economics |
| [`security-and-performance.md`](security-and-performance.md) | Pre-launch hardening record: security headers, the enforced CSP, the Redis rate limiter, the daily spend budget, and the performance pass (skeletons, transform-only transitions, the `/mint` scroll fix) |
| [`mod-artwork-prompts.md`](mod-artwork-prompts.md) | Image-generation prompts for the 7 equippable mods, 7 consumables, and level-gated skill chips, plus the shared retro-futuristic pixel style block |
| [`player-progression.md`](player-progression.md) | PlayerProgress XP/levels, skill NFTs (free claims + store copies + skill slot + consumable abilities), hybrid profile identity, seed-skills script |
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
| `airen-upgrade-economy` | The mod/badge economy: SneakerMods, Workshop slots, consumable abilities, swaps, rentals, ModStore, power/health/energy stats |
| `airen-player-progression` | PlayerProgress XP/levels, the `/profile` hybrid identity, level-gated skill NFTs, and the seed-skills script |
| `airen-mint-studio` | The AI photo → artwork → mint pipeline and local collection storage |
| `airen-subgraph-activity` | Activity indexing, schema introspection, the subgraph proxy |
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
npx hardhat test          # 379 tests (271 Solidity + 108 TypeScript)
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
