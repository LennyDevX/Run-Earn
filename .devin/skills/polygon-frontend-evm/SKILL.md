---
name: polygon-frontend-evm
description: Build Airen's Polygon frontend with viem, EIP-1193/EIP-6963 wallet discovery, MetaMask Connect, OKX Universal Provider, native POL staking, SneakerMint NFT minting, REN reads, the mod workshop economy, subgraph activity, and Amoy-first defaults.
---

# Airen Polygon Frontend

Use this skill for wallet UX, RPC reads, native POL staking, SneakerMint NFT minting, REN reads, the mod/workshop upgrade economy, subgraph activity, and cross-platform EVM wallet integrations.

## Current routes and contracts

| Route | Main component | Hook |
| --- | --- | --- |
| `/` | `SneakerCarousel`, `PolygonTransferCard` | — |
| `/mint` | `SneakerMintStudio` | `useMintedSneakers` |
| `/my-nfts` | `MyNftsGallery`, `MyModsGallery` | `useMintedSneakers`, `useOwnedMods` |
| `/collection` | `VeSneakerStorefront`, `ModStorefront` | `useVeSneakerStore`, `useModEconomy` |
| `/marketplace` | `MarketplaceDashboard`, `ModMarketTabs` | `useMarketplace`, `useModEconomy` |
| `/workshop` | `WorkshopDashboard` | `useWorkshop`, `useSneakerGame`, `useOwnedMods` |
| `/badges` | `BadgesDashboard` | `useBadges` |
| `/game` | `SneakerGameDashboard` | `useSneakerGame` |
| `/staking` | `StakingVaultDashboard` | `useStakingVault`, `useNftAppraisal` |
| `/defi` | `StakingVaultDashboard`, `PolygonTransferCard` | same as `/staking` |
| `/roadmap` | static milestones | — |
| `/play` | `TabGameScreen` → `TabChallengePanel` | `useOwnedSneakers` |

Full route documentation: `docs/app-routes.md`.

- NFT: `SneakerMint` at `NEXT_PUBLIC_SNEAKER_MINT_ADDRESS`.
- REN token: `RENToken` at `NEXT_PUBLIC_REWARD_TOKEN_ADDRESS` (symbol `REN`).
- Staking vault: `SneakerStaking` at `NEXT_PUBLIC_STAKING_VAULT_ADDRESS`.
- NFT appraiser: `SneakerAppraiser` at `NEXT_PUBLIC_SNEAKER_APPRAISER_ADDRESS`.
- Marketplace: `SneakerMarketplace` at `NEXT_PUBLIC_SNEAKER_MARKETPLACE_ADDRESS` — UI at `/marketplace`.
- Game: `SneakerGame` at `NEXT_PUBLIC_SNEAKER_GAME_ADDRESS` — UI at `/game`.
- veSneaker store: `VeSneakerStore` at `NEXT_PUBLIC_VE_SNEAKER_STORE_ADDRESS` — UI at `/collection`.
- Mods: `SneakerMods` at `NEXT_PUBLIC_SNEAKER_MODS_ADDRESS`.
- Workshop: `SneakerWorkshop` at `NEXT_PUBLIC_SNEAKER_WORKSHOP_ADDRESS` — UI at `/workshop`.
- Swap: `SneakerSwap` at `NEXT_PUBLIC_SNEAKER_SWAP_ADDRESS` — Trades tab at `/marketplace`.
- Mod store: `ModStore` at `NEXT_PUBLIC_MOD_STORE_ADDRESS` — premium mods at `/collection`.
- Subgraph proxy: `/api/subgraph?address=0x...` (see the `airen-subgraph-activity` skill).
- AI mint route: `/api/generate-sneaker` (see the `airen-mint-studio` skill).
- POL price feed: `/api/pol-price` (Uniswap Trading API proxy) — see
  [`docs/uniswap-price-feed.md`](../../docs/uniswap-price-feed.md). Server-only key; the
  browser must never call Uniswap directly (no CORS on the Trading API). Use the
  `usePolPrice` hook for USD hints.
- Benefits vault: `SneakerVault` at `NEXT_PUBLIC_SNEAKER_VAULT_ADDRESS` — perks panel at `/defi`.
- Fee splitter: `FeeSplitter` at `NEXT_PUBLIC_FEE_SPLITTER_ADDRESS` — distribution panel at `/defi`.
- Subgraph server config: `THE_GRAPH_QUERY_URL`, `THE_GRAPH_QUERY_API_KEY`, `THE_GRAPH_SUBGRAPH_SLUG=nuxgraph`, `THE_GRAPH_SUBGRAPH_VERSION=0.1.0`.

## Hooks inventory and conventions

`src/hooks/`: `useContractTransaction`, `useOwnedSneakers`, `useOwnedMods`,
`useMintedSneakers`, `useWalletOverview`, `useNftAppraisal`, `useStakingVault`,
`useMarketplace`, `useSneakerGame`, `useVeSneakerStore`, `useWorkshop`,
`useBadges`, `useModEconomy`, `usePolPrice`, `useSubgraphActivity`,
`useSneakerVault`, `useFeeSplitter`. Wallet state lives in `Providers.tsx` via
`usePolygonWallet`.

Tab challenge UI (`src/lib/tab-challenge.ts` is the single source of truth for
the level ladder, power score, boost ceiling, and APY budget):
`TabChallengeSection` on the home page, `TabChallengePanel` and
`PlayerGameProfile` on `/game`, and `HoloSneakerCard` for the holographic NFT
cards. Boost math must stay clamped by `STAKING_BUDGET.maxApyBps` (800 bps) and
must never exceed `TAB_CHALLENGE.maxBoostBps` (150 bps).

Signature gradient text: use the `.text-gradient` class (`.text-gradient-wide`
for large display type) for hero and section titles instead of ad-hoc
`bg-clip-text` gradients. Stops are theme-aware via `--gradient-from/via/to`.

Item shop: `/workshop` renders `WorkshopWorkbench` — `ModItemGallery` (the mod
NFT catalog with prices, artwork in `public/items/`, and buy/equip actions) on
top of `WorkshopDashboard` (the loadout). `src/lib/mod-items.ts` is the catalog;
the gallery matches on-chain `ModStore` designs by `slot` + `tier`, so a new item
goes live by adding a `MOD_ITEMS` entry and calling `addDesign` with the same
slot/tier — no frontend change needed. "Equip on a veSneaker" in the gallery
raises a `focusRequest` that opens the matching slot picker in the dashboard.
Item prices show a live USD hint via `usePolPrice`, same as `/collection`.

Playable route: `/play` is the tab arena, rendering `TabGameScreen` →
`TabChallengePanel` full-bleed. The launch loader is **global**, not part of the
route: `GameLaunchProvider` (`src/components/GameLaunch.tsx`, mounted in
`src/app/layout.tsx` inside `Providers`) exposes `useGameLaunch().launch(href)`
and a `LaunchLink`. Hitting Start covers the viewport with `GameLaunchOverlay`
for 6s, then pushes the route — so the loader appears *while navigating*, never
while the route renders. Any new entry point into `/play` must use `LaunchLink`
(or call `launch`), and `MobileNav` marks the item with `launch: true`.
`GameLaunchOverlay` is pure CSS: a ring of `.spinner-block` divs lighting up in
sequence (`pixel-chase`). Do not reintroduce bitmap or SVG sprite assets for it.

Store purchases always quote on-chain: `useVeSneakerStore.buy` and
`useModEconomy.buyMod` read `quote(designIndex, quantity)` with the connected
account before sending, so vault discounts and perk gates are applied by the
contract. `ProtocolBenefitsPanel` (`/defi`) surfaces perk eligibility, access
claims, pending fees, and the recipient weights.

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

- `SneakerArtwork` renders the registered Astra, Sol, and Luna PNGs with `next/image`.
  Resolve each owned NFT from its `tokenURI` via `useOwnedSneakers`; never derive artwork
  from `tokenId`. Preserve embedded AI-minted image data and map legacy `pixel://` metadata
  through `resolveSneakerArtwork`.
- Shared shell: `Navbar` uses the Airen chevron mark — `/LogoAirenBlack.webp` (black) in
  light mode and `/LogoAiren.webp` (cyan) in dark mode; `Footer` uses the Airen wordmark —
  `/AirenBlack.webp` (black) in light mode and `/AirenWhite.png` (white) in dark mode.
  `ThemeToggle`, `WalletButton`, `MobileNav`, and `MoreSheet` follow the midnight/cyan
  visual language. Keep the dark/light surface tokens, cyan accent, and restrained
  pixel-grid backdrop centralized in `src/app/globals.css`.
- Chakra Petch is the global typeface for body, headings, stats, and short labels, loaded
  through `next/font/google` with `display: "swap"`. Do not reintroduce Geist or Press Start 2P.
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
- **PWA:** `src/app/manifest.ts` references `public/icon-192.png` and
  `public/icon-512.png`; these generated files must exist for installability. Run
  `node scripts/generate-icons.mjs` if either asset is absent. Keep the manifest
  `theme_color` aligned with the light/dark colors in `src/app/layout.tsx`.

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

## Marketplace UI flow (`/marketplace`, `useMarketplace` + `useModEconomy` hooks)

The marketplace is multi-collection — every sale primitive takes the NFT
contract address first, and locks are keyed by `(collection, tokenId)`.

1. Read owned sneakers via `useOwnedSneakers` and owned mods via `useOwnedMods`; read `tokenSaleKind(collection, tokenId)` (0 = free, 1 = listed, 2 = in auction) and `suggestedPrice(tokenId)` (sneakers only).
2. Listing flow requires two transactions: `approve(marketplace, tokenId)` on the NFT contract (SneakerMint **or** SneakerMods), then `list(collection, tokenId, price)`.
3. Auction flow: `approve` then `createAuction(collection, tokenId, startPrice, durationSeconds)` (1h–30d).
4. Buying: `buy(listingId)` with `value == listing.price`. Bidding: `bid(auctionId)` with `value >= minBid`; the previous bidder is refunded automatically.
5. Offers: `makeOffer(collection, tokenId, duration)` with `value` escrows POL; the NFT stays with its owner until `acceptOffer(offerId)`.
6. Staked NFTs cannot be listed or auctioned — surface the "unstake first" error. Sneakers with equipped workshop mods cannot be listed — surface the "unequip first" error.
7. `valueRecommendations(tokenId)` returns 4 on-chain tips; show them as guidance text.

## Game UI flow (`/game`, `useSneakerGame` hook)

1. Read `sneakers(tokenId)` — the tuple has **8 fields**: `lastActivationAt`, `lastAccrualAt`, `streak`, `durability`, `pendingPoints`, `lifetimePoints`, `lastDecayAt`, `energy`. Also read `pendingPoints`, `canActivate`, `secondsUntilActivation`, `veRuneBalance(owner)`, and the live stat views `powerOf`, `healthOf`, `energyOf`, `maxEnergyOf`, `earnRatePerSecond`.
2. `activate(tokenId)` is the core retention loop — once per 24h per sneaker, refills energy to max. Show a countdown when in cooldown and a "worn out" state when `healthOf` hits 0 (health decays 1/day of real time + wear per activation — display `healthOf`, not the stored `durability` field).
3. Power: `powerOf(tokenId)` is the rarity-scaled earn multiplier (r50 ≈ 1.0x, r90 ≈ 1.4x, r100 ≈ 1.5x); `earnRatePerSecond` already includes power + streak + workshop bonuses.
4. Repair costs `repairCostPoints` veRUNE (Lining mods discount it); burned repair kits also restore health via the workshop.
5. `claimPoints(tokenId)` moves pending points to the user's veRUNE balance.
6. `redeem(points)` converts veRUNE to REN at `redemptionRate` — only when `redemptionEnabled` is true; disable the button otherwise.
7. veRUNE is virtual (not an ERC-20) — never treat it as a transferable token in the UI.

## Workshop UI flow (`/workshop`, `useWorkshop` hook)

1. Sneaker selector → seven equip slots (Sole/Upper/Lining/Skin/Core/Boost/Skill), effective-stats panel, forge card, consumables section. Full mechanics: `airen-upgrade-economy` skill.
2. Equip is two transactions: `approve(workshop, modId)` on SneakerMods, then `equip(sneakerId, modId)` — the mod goes into workshop escrow. `unequip(sneakerId, slot)` returns it.
3. Consumables (`traits.consumable`) must be filtered OUT of the equip picker and shown under `useAbility`: repair kit (0⚡), surge (2⚡), boost capsule (1⚡, +`effectBps` earn for 24h — track `tempBoostBps`/`boostExpiresAt` with a `nowSeconds` state, never `Date.now()` in render), forge stone (2⚡), Overdrive (3⚡, 48h), Stim pack (0⚡ refill), Lucky repair (1⚡, heal + boost).
4. Forge burns `forgeCostPoints` veRUNE per level — show `forgeLevel` and the rarity/effective-earn bump.
5. Blocked sneakers (staked, listed, rented out) must surface the contract revert as actionable copy.

## Subgraph integration

- Do not query The Graph directly from the browser with a secret key.
- Use the Next Route Handler proxy and server-only environment variables.
- The dynamic adapter introspects the schema and finds address-indexed activity entities.
- If the schema does not expose new POL events, show RPC state and an empty indexed activity state rather than inventing history.
- Recommended indexed events: `POLDeposited`, `POLWithdrawn`, `POLRewardsClaimed`, `Staked`, `Unstaked`, plus marketplace (list/buy/auction/offer), game (activate/repair/redeem), and upgrade-economy events (mod mint/burn, equip/unequip, ability use, forge, swap, rental, mod purchases).
- Full detail lives in the `airen-subgraph-activity` skill.

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
- Verify `/marketplace` list (approve + list) for sneakers AND mods, buy, auction bid/settle, offer make/accept/cancel, suggested prices, and mod-equipped-sneaker listing rejection on Amoy.
- Verify `/marketplace` Rentals (list/rent/return) and Trades (create/accept/cancel swap) tabs on Amoy.
- Verify `/game` activate (24h cooldown + energy refill), streak display, live health bar (time decay), power/energy stats, repair, claim points, and redemption gating on Amoy.
- Verify `/workshop` equip/unequip across all seven slots (incl. the passive Skill slot), each `useAbility` consumable burn (repair/surge/boost/forge stone/Overdrive/Stim/Lucky), forge levels, and equipped-mod custody on Amoy.
- Verify `/badges` achievement claims — including the "Level skills" section (free `PlayerLevel` claim gated by `PlayerProgress.levelOf`) — and `/collection` Astra/Sol/Luna image filters, stable store design indices, premium mod purchases, `requiredLevel` gates, and vault discount/perk badges on Amoy.
- Verify `/defi` benefits panel: perk eligibility flips when NFTs are sold or POL is unstaked, access claims are one per wallet, and the fee splitter shows pending/distributed POL with recipient weights.
- Verify the Home carousel crossfades among Astra/Sol/Luna, pauses on hover/focus, supports manual controls, and stops auto-rotation for `prefers-reduced-motion`; verify owned token artwork uses `tokenURI`, not token-ID-derived art.
- Verify `/profile`: username edit, avatar upload + NFT pick, on-chain level card (`progressOf`), skills list, and the Navbar `ProfileButton`.
- **Mobile:** 320/390/430px + landscape + 768px tablet; bottom nav reachable on every route with correct `aria-current`; nothing hidden behind the bar; no horizontal overflow; reduced motion honoured; sheets trap focus and close on Escape; verify `/manifest.webmanifest`, `/favicon.ico`, `/apple-icon.png`, `/icon-192.png`, and `/icon-512.png` return 200 after generating the PWA icon assets.


## Condition, gate, and the tab arena

`HoloSneakerCard` takes `conditionBps` (not `forgeLevel`) and renders the wear
bar: `conditionBand()` picks one of four colour bands and `conditionPercent()`
sizes the fill relative to the 50% floor. Always pair the colour with the numeric
percentage — wear must never be conveyed by colour alone.

`useRunnerRoster` reads `conditionBps` and `equippedCount` from the workshop per
sneaker and resolves them into the derived power score. `useArenaGate` mirrors
the contract's two conditions (POL principal, locked runner) so `/play` can list
exactly what is missing before a session starts.

`/play` blocked states, in order: `INSERT WALLET` → `READING ROSTER` →
`GATE CLOSED` (with the unmet requirements as a checklist) → `NO VE SNEAKER`.

`src/app/api/tab-session/route.ts` signs completed sessions. It is the only place
`ARENA_SIGNER_PRIVATE_KEY` may be read — never expose it as `NEXT_PUBLIC_*`, and
never sign a score the contract would reject (it clamps anyway, but the server
should reject first).
