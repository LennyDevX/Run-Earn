---
name: polygon-frontend-evm
description: Build Run-Earn's Polygon frontend with viem, EIP-1193/EIP-6963 wallet discovery, MetaMask Connect, OKX Universal Provider, native POL staking, SneakerMint NFT minting, RUNE reads, subgraph activity, and Amoy-first defaults.
---

# Run-Earn Polygon Frontend

Use this skill for wallet UX, RPC reads, native POL staking, SneakerMint NFT minting, RUNE reads, subgraph activity, and cross-platform EVM wallet integrations.

## Current routes and contracts

| Route | Main component | Hook |
| --- | --- | --- |
| `/` | `SneakerCarousel`, `PolygonTransferCard` | — |
| `/mint` | `SneakerMintStudio` | `useMintedSneakers` |
| `/my-nfts` | `MyNftsGallery` | `useMintedSneakers` |
| `/collection` | `VeSneakerStorefront` (veSneakers store) | `useVeSneakerStore` |
| `/marketplace` | `MarketplaceDashboard` | `useMarketplace` |
| `/game` | `SneakerGameDashboard` | `useSneakerGame` |
| `/staking` | `StakingVaultDashboard` | `useStakingVault`, `useNftAppraisal` |
| `/defi` | `StakingVaultDashboard`, `PolygonTransferCard` | same as `/staking` |
| `/roadmap` | static milestones | — |

Full route documentation: `docs/app-routes.md`.

- NFT: `SneakerMint` at `NEXT_PUBLIC_SNEAKER_MINT_ADDRESS`.
- REN token: `RUNEToken` at `NEXT_PUBLIC_REWARD_TOKEN_ADDRESS` (symbol `REN`).
- Staking vault: `SneakerStaking` at `NEXT_PUBLIC_STAKING_VAULT_ADDRESS`.
- NFT appraiser: `SneakerAppraiser` at `NEXT_PUBLIC_SNEAKER_APPRAISER_ADDRESS`.
- Marketplace: `SneakerMarketplace` at `NEXT_PUBLIC_SNEAKER_MARKETPLACE_ADDRESS` — UI at `/marketplace`.
- Game: `SneakerGame` at `NEXT_PUBLIC_SNEAKER_GAME_ADDRESS` — UI at `/game`.
- veSneaker store: `VeSneakerStore` at `NEXT_PUBLIC_VE_SNEAKER_STORE_ADDRESS` — UI at `/collection`.
- Subgraph proxy: `/api/subgraph?address=0x...` (see the `runearn-subgraph-activity` skill).
- AI mint route: `/api/generate-sneaker` (see the `runearn-mint-studio` skill).
- POL price feed: `/api/pol-price` (Uniswap Trading API proxy) — see
  [`docs/uniswap-price-feed.md`](../../docs/uniswap-price-feed.md). Server-only key; the
  browser must never call Uniswap directly (no CORS on the Trading API). Use the
  `usePolPrice` hook for USD hints.
- Subgraph server config: `THE_GRAPH_QUERY_URL`, `THE_GRAPH_QUERY_API_KEY`, `THE_GRAPH_SUBGRAPH_SLUG=nuxgraph`, `THE_GRAPH_SUBGRAPH_VERSION=0.1.0`.

## Hooks inventory and conventions

`src/hooks/`: `useContractTransaction`, `useOwnedSneakers`, `useMintedSneakers`,
`useWalletOverview`, `useNftAppraisal`, `useStakingVault`, `useMarketplace`,
`useSneakerGame`, `useVeSneakerStore`, `usePolPrice`, `useSubgraphActivity`. Wallet state
lives in `Providers.tsx` via `usePolygonWallet`.

Every hook must:

1. Start with `"use client"`.
2. Expose `configured` (all required `NEXT_PUBLIC_*` addresses present and valid via
   `isAddress`); pages render a demo-mode notice when false instead of crashing.
3. Run reads in `useEffect` wrapped in `requestAnimationFrame` — a direct `setState`
   inside the effect body trips the `react-hooks/set-state-in-effect` lint error.
4. Compute `isLoading = isReading || transaction.isPending` and merge read/tx/dependency
   errors into one `error`.
5. Expose `refresh()` and call it after every confirmed transaction.

Transactions go through `useContractTransaction().execute({ to, data, value })`, which
encodes with viem, waits for the receipt, and surfaces the hash. `Providers.getActiveProvider()`
re-verifies `eth_chainId` before every signature — never send a raw `eth_sendTransaction`
that skips it.

## Adding a route

1. `src/app/<route>/page.tsx` — `metadata` + `Navbar` → `main` → `Footer`.
2. Interactive logic in a `"use client"` component under `src/components/`.
3. Contract reads/writes in a hook under `src/hooks/` (conventions above).
4. New ABIs in `src/lib/contracts.ts` (note: `uint16` outputs infer as `number`; wrap with `BigInt(...)`).
5. Add the link to `LINKS` in `src/components/Navbar.tsx`.
6. Document it in `docs/app-routes.md`.

## Design system notes

- `PixelSneaker` ships 7 designs; pick one with `Number(tokenId) % 7` so NFTs look distinct.
  Use the exported `PIXEL_SNEAKER_DESIGNS` for the count.
- Shared shell: `Navbar`, `Footer`, `ThemeToggle`, `WalletButton`, `MobileNav`, `MoreSheet`.
- Reuse the existing card/tab/KPI patterns from the dashboards instead of inventing new ones.
- Rarity copy must match the contracts: Common +0.5%, Rare +0.8%, Epic +1.5%, Mythic +1.8%;
  base staking APY 2.80%. The ERC-20 symbol is `REN`.

## Mobile conventions (required)

Full detail: `docs/mobile-experience.md`.

- **Bottom nav:** `MobileNav` is mounted once in `src/app/layout.tsx` with five primary
  destinations (Home, Mint, veSneakers, Game, Market). Everything else goes in
  `SECONDARY_LINKS` in `Navbar.tsx`, surfaced through the "More" bottom sheet. Never let a
  route become unreachable on mobile.
- **Sheets:** use `MoreSheet` for mobile dialogs. It portals to `<body>`, locks scroll,
  traps focus, closes on Escape/backdrop, and respects the safe area.
- **Safe areas:** `viewportFit: "cover"` is set in `layout.tsx`; use `.pb-safe`/`.pt-safe`
  or the `--safe-*` tokens. Never add your own bottom padding for the nav — `body`
  already reserves `calc(var(--mobile-nav-height) + var(--safe-bottom))` below `md`.
- **Tap targets:** ≥ 44px for primary controls (`min-h-11`, `size-11`), ≥ 36px for
  secondary chips, plus `active:scale-95` feedback.
- **Horizontal rows:** filters, tabs, and step bars use the `.scroll-x` class with
  `-mx-6 px-6` instead of `flex-wrap`, so they scroll rather than stacking.
- **Motion:** respect `prefers-reduced-motion` in CSS (handled globally) **and** in JS for
  timers/observers (`SneakerCarousel` pattern: `matchMedia` + `IntersectionObserver`).
- **Inputs:** always set `inputMode`, `enterKeyHint="done"`, `autoComplete="off"`,
  `autoCapitalize="none"`, `spellCheck={false}`.
- **Images:** `loading="lazy" decoding="async"` with an aspect-ratio box to avoid CLS.
- **Timers:** re-sync on `visibilitychange` so returning to the tab never shows stale data.
- **RPC fan-out:** prefer batched/multicall reads; mobile scans shorter windows (see
  `useMarketplace`).
- **PWA:** `src/app/manifest.ts`, `src/app/favicon.ico`, `src/app/apple-icon.png` and
  `public/icon-192|512.png` are generated by `scripts/generate-icons.mjs`.

## Wallet architecture

- Desktop and in-app browser discovery uses EIP-6963, with a safe fallback to `window.ethereum`.
- Main wallet options are `OKX Wallet` and `MetaMask`.
- MetaMask mobile/extension fallback uses `@metamask/connect-evm` and its automatic mobile deeplink/QR handling.
- OKX mobile fallback uses `@okxconnect/universal-provider`; the SDK manages the app handoff and return strategy.
- The app wraps SDK providers behind the same EIP-1193 interface, so viem/RPC reads and transaction code remain wallet-agnostic.
- Do not construct arbitrary wallet deeplinks from user input. Use official SDK handoff and allowlisted dApp origin/chain configuration.

## Wallet security and lifecycle

1. Discover EIP-6963 providers before selecting a desktop provider.
2. Never silently choose an unexpected extension when multiple providers are installed.
3. On mobile without an injected provider, let the user explicitly choose OKX or MetaMask.
4. Re-read `eth_accounts` and `eth_chainId` after SDK return, account change, and chain change.
5. Verify the active chain before every transaction.
6. Wait for receipts before reporting success.
7. Disconnect local state and attempt SDK session disconnect; EIP-1193 cannot universally revoke permissions.
8. Treat `NEXT_PUBLIC_*` values as public. Never put private keys, Graph keys, verifier secrets, or server credentials there.

## POL staking UI flow

1. Read `polPositions`, `pendingPOLRewards`, `effectiveApyBps`, `positions`, `stakedTokenIds`, and `availablePOLRewards` from RPC.
2. Use `depositPOL()` with a native transaction value.
3. Use `withdrawPOL(amount)` only after the contract lock period.
4. Use `claimPOLRewards()` only when pending rewards are nonzero and the reserve is funded.
5. Read owned SneakerMint IDs via ERC-721 enumerable functions.
6. Lock NFTs through `stake(tokenId)` — this is a **manual action** by the user. The NFT is transferred to the vault. Unlock through `unstake(tokenId)`.
7. APY boost is rarity-based: Common +0.5%, Rare +0.8%, Epic +1.5%, Mythic +1.8%. No flat per-NFT bonus.
8. Use `useNftAppraisal` hook to read on-chain POL value estimates from `SneakerAppraiser.appraise(tokenId)` for each owned NFT.
9. Show confirmed local transaction activity immediately, then refresh `/api/subgraph` after indexing.

## Marketplace UI flow (`/marketplace`, `useMarketplace` hook)

1. Read owned NFTs via `useOwnedSneakers`; read `tokenSaleKind(tokenId)` (0 = free, 1 = listed, 2 = in auction) and `suggestedPrice(tokenId)` per token.
2. Listing flow requires two transactions: `approve(marketplace, tokenId)` on SneakerMint, then `list(tokenId, price)` on the marketplace.
3. Auction flow: `approve` then `createAuction(tokenId, startPrice, durationSeconds)` (1h–30d).
4. Buying: `buy(listingId)` with `value == listing.price`. Bidding: `bid(auctionId)` with `value >= minBid`; the previous bidder is refunded automatically.
5. Offers: `makeOffer(tokenId, duration)` with `value` escrows POL; the NFT stays with its owner until `acceptOffer(offerId)`.
6. Staked NFTs cannot be listed or auctioned — surface the "unstake first" error clearly.
7. `valueRecommendations(tokenId)` returns 4 on-chain tips; show them as guidance text.

## Game UI flow (`/game`, `useSneakerGame` hook)

1. Read `sneakers(tokenId)` state (streak, durability, pending, lifetime), `pendingPoints`, `canActivate`, `secondsUntilActivation`, and `veRuneBalance(owner)`.
2. `activate(tokenId)` is the core retention loop — once per 24h per sneaker. Show a countdown when in cooldown and a "worn out" state at 0 durability.
3. Durability bar: max from `maxDurability`, wear per activation from `wearPerActivation`. Repair costs `repairCostPoints` veRUNE.
4. Streak multiplier: +1%/day capped at +50% — display the effective ×multiplier and boosted daily rate (`tierBasePointsPerDay[tier] × multiplier`).
5. `claimPoints(tokenId)` moves pending points to the user's veRUNE balance.
6. `redeem(points)` converts veRUNE to REN at `redemptionRate` — only when `redemptionEnabled` is true; disable the button otherwise.
7. veRUNE is virtual (not an ERC-20) — never treat it as a transferable token in the UI.

## Subgraph integration

- Do not query The Graph directly from the browser with a secret key.
- Use the Next Route Handler proxy and server-only environment variables.
- The dynamic adapter introspects the schema and finds address-indexed activity entities.
- If the schema does not expose new POL events, show RPC state and an empty indexed activity state rather than inventing history.
- Recommended indexed events: `POLDeposited`, `POLWithdrawn`, `POLRewardsClaimed`, `Staked`, `Unstaked`, plus marketplace and game events.
- Full detail lives in the `runearn-subgraph-activity` skill.

## Required approach

1. Use viem and the EIP-1193 provider; keep RPC configuration in `src/components/Providers.tsx`.
2. Default development to Polygon Amoy; mainnet requires explicit configuration and a visible network indicator.
3. Validate EVM addresses, reject zero/invalid POL amounts, and use bigint for token values.
4. Keep interactive wallet code in Client Components.
5. Handle wrong chain, rejected signatures, insufficient POL, failed receipts, stale subgraph indexing, missing wallet apps, and empty reserves.
6. Use the official MetaMask Connect and OKX Universal Provider APIs instead of undocumented custom schemes.

## Verification checklist

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npx hardhat compile`
- `npx hardhat test`
- Verify EIP-6963 desktop selection.
- Verify OKX in-app browser and mobile app handoff.
- Verify MetaMask extension, MetaMask Mobile deeplink, cancellation, and return flow.
- Verify `/staking` deposit, withdrawal, claim, NFT lock/unlock, APY update, and activity refresh on Amoy.
- Verify `/marketplace` list (approve + list), buy, auction bid/settle, offer make/accept/cancel, and suggested prices on Amoy.
- Verify `/game` activate (24h cooldown), streak display, durability bar, repair, claim points, and redemption gating on Amoy.
- **Mobile:** 320/390/430px + landscape + 768px tablet; bottom nav reachable on every route with correct `aria-current`; nothing hidden behind the bar; no horizontal overflow; reduced motion honoured; sheets trap focus and close on Escape; `/manifest.webmanifest`, `/favicon.ico`, `/apple-icon.png` return 200.
