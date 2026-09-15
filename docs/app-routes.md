# RUN&EARN app routes — developer guide

This document is the reference for every user-facing route in the Next.js App Router
app under `src/app/`, plus the two API route handlers. Use it to understand what each
route does, which files own it, which contracts and hooks it depends on, and where to
extend it.

Deep-dive companions:

| Topic | Doc |
| --- | --- |
| Contracts and architecture | [`contract-architecture-plan.md`](contract-architecture-plan.md) |
| POL staking model and boosts | [`polygon-staking-model.md`](polygon-staking-model.md) |
| REN + veRUNE tokenomics | [`veRune-tokenomics.md`](veRune-tokenomics.md) |
| Subgraph activity proxy | [`subgraph-integration.md`](subgraph-integration.md) |
| Wallet connectivity | [`wallet-connectivity.md`](wallet-connectivity.md) |
| Contract deployment/testing | [`polygon-contract-roadmap.md`](polygon-contract-roadmap.md), [`polygon-test-runbook.md`](polygon-test-runbook.md) |

## Route map

| Route | Page | Main component | Contracts used | Hooks |
| --- | --- | --- | --- | --- |
| `/` | `src/app/page.tsx` | `SneakerCarousel`, `PolygonTransferCard` | — | — |
| `/mint` | `src/app/mint/page.tsx` | `SneakerMintStudio` | `SneakerMint` | `usePolygonWallet`, `useMintedSneakers` |
| `/my-nfts` | `src/app/my-nfts/page.tsx` | `MyNftsGallery` | — (local storage) | `useMintedSneakers` |
| `/collection` | `src/app/collection/page.tsx` | `VeSneakerStorefront` | `VeSneakerStore`, `SneakerMint` | `useVeSneakerStore`, `useSubgraphActivity` |
| `/marketplace` | `src/app/marketplace/page.tsx` | `MarketplaceDashboard` | `SneakerMarketplace`, `SneakerMint`, `SneakerAppraiser`, `SneakerStaking` | `useMarketplace`, `useSubgraphActivity` |
| `/game` | `src/app/game/page.tsx` | `SneakerGameDashboard` | `SneakerGame`, `SneakerMint`, `RUNEToken` | `useSneakerGame`, `useSubgraphActivity` |
| `/staking` | `src/app/staking/page.tsx` | `StakingVaultDashboard` | `SneakerStaking`, `SneakerMint` | `useStakingVault`, `useNftAppraisal`, `useSubgraphActivity` |
| `/defi` | `src/app/defi/page.tsx` | `StakingVaultDashboard`, `PolygonTransferCard` | `SneakerStaking` | same as `/staking` |
| `/roadmap` | `src/app/roadmap/page.tsx` | static milestones | — | — |
| `/api/generate-sneaker` | `src/app/api/generate-sneaker/route.ts` | — | — | — |
| `/api/subgraph` | `src/app/api/subgraph/route.ts` | — | The Graph Studio | — |

Every page follows the same shell: `Navbar` → `<main>` → `Footer`, wrapped by
`Providers` in `src/app/layout.tsx`.

## Shared building blocks

### Wallet context — `src/components/Providers.tsx`

The single source of truth for wallet state and RPC access. Everything else reads from
it via the `usePolygonWallet()` hook.

- Exports: `NETWORK`, `CHAIN`, `NETWORK_LABEL`, `EXPLORER`, `publicClient`,
  `explorerAccountUrl`, `explorerTransactionUrl`.
- Context shape: `address`, `chainId`, `isConnected`, `isConnecting`, `isMobile`,
  `walletType`, `walletOptions`, `error`, `publicClient`, `connect`, `disconnect`,
  `switchToPolygon`, `sendNative`, `sendContractCall`.
- Discovery: EIP-6963 (`eip6963:announceProvider` / `requestProvider`) with a
  `window.ethereum` fallback. Options are OKX, MetaMask, then any other injected provider.
- Mobile fallback: `connectMetaMaskMobile` (`@metamask/connect-evm`) and
  `connectOkxMobile` (`@okxconnect/universal-provider`) from `src/lib/wallet-connect.ts`.
- **Chain guard:** `getActiveProvider()` re-reads `eth_chainId` before every signature
  and throws `Wrong network...` if it does not match `CHAIN.id`. Never bypass this.
- `sendContractCall(to, data, value?)` is the only way transactions are sent; it returns
  the tx hash. Hooks wait for the receipt before reporting success.

### Contract ABIs — `src/lib/contracts.ts`

Hand-written minimal ABIs (no codegen) for `sneakerMintAbi`, `stakingAbi`,
`sneakerAppraiserAbi`, `sneakerMarketplaceAbi`, `sneakerGameAbi`, `erc721BalanceAbi`,
`erc721ApproveAbi`. When you add a contract function, add the ABI entry here **and**
export the inferred type. `uint16` outputs are inferred as `number` by viem — wrap with
`BigInt(...)` (see `useSneakerGame`).

### NFT metadata + local collection — `src/lib/sneaker-nft.ts`

- `RARITIES` maps rarity levels to `multiplier`, `boostBps`, and `boostLabel`
  (Common +0.5%, Rare +0.8%, Epic +1.5%, Mythic +1.8%).
- `PALETTES` defines the four AI art palettes.
- `buildTokenUri(metadata)` builds the base64 `data:application/json` token URI.
- `getMintedSneakers` / `saveMintedSneaker` persist the user's minted list in
  `localStorage` under `runearn:my-nfts:<address>`.

### Subgraph client — `src/lib/subgraph.ts`

Server-only. `fetchSubgraphActivity(address)` introspects the GraphQL schema, finds
address-indexed activity roots, and normalizes rows into `SubgraphActivity[]`. It is
exposed to the browser only through `/api/subgraph`. See
[`subgraph-integration.md`](subgraph-integration.md).

### Pixel art — `src/components/PixelSneaker.tsx`

7 hand-authored pixel designs (`design={0..6}`), each with its own default palette.
Props: `design`, `palette` (per-cell color overrides), `className`, `style`. Dashboards
pick a design with `Number(tokenId) % 7` so every sneaker looks distinct.

### Hooks inventory — `src/hooks/`

| Hook | Purpose |
| --- | --- |
| `usePolygonWallet` (in Providers) | Wallet state, chain guard, tx sending |
| `useContractTransaction` | `execute({to, data, value})` → waits for receipt, tracks pending/error |
| `useOwnedSneakers` | Reads the connected wallet's ERC-721 IDs + traits (`balanceOf`, `tokenOfOwnerByIndex`, `traitsOf`) |
| `useMintedSneakers` | Reads the local minted list; `notifyMintedSneakersUpdated()` broadcasts changes |
| `useWalletOverview` | Native POL balance for the connected wallet |
| `useNftAppraisal` | Batch `SneakerAppraiser.appraise(tokenId)` reads + global params |
| `useStakingVault` | Staking reads + `depositPOL`/`withdrawPOL`/`claimPOLRewards`/`stake`/`unstake` |
| `useMarketplace` | Marketplace reads + list/buy/auction/offer txs + `approveNft` |
| `useSneakerGame` | Game reads + `activate`/`claimPoints`/`repair`/`redeem` |
| `useVeSneakerStore` | veSneaker catalog reads + `buy(designIndex, price, quantity)` |
| `useSubgraphActivity` | `/api/subgraph` feed + `addLocalActivity` optimistic entries |

Conventions every hook follows:

1. `"use client"` at the top.
2. `configured` is true only when the required `NEXT_PUBLIC_*` addresses are present and
   valid (`isAddress`). Pages must handle `configured === false` with a demo-mode notice.
3. Reads run inside `useEffect` wrapped in `requestAnimationFrame` (avoids the
   `react-hooks/set-state-in-effect` lint error).
4. `isLoading = isReading || transaction.isPending`; `error` merges read + tx + dependency errors.
5. `refresh()` re-runs reads; call it after every confirmed transaction.

## Route details

### `/` — Home

- **Files:** `src/app/page.tsx`, `src/components/SneakerCarousel.tsx`, `src/components/PolygonTransferCard.tsx`.
- **Purpose:** marketing landing page with the sneaker carousel and a POL transfer card.
- **Contracts:** none (the transfer card uses `sendNative`).
- **Notes:** fully static; safe to edit copy without touching hooks.

### `/mint` — AI mint studio

- **Files:** `src/app/mint/page.tsx`, `src/components/SneakerMintStudio.tsx`.
- **Purpose:** photo → AI artwork → metadata → on-chain mint, in a 4-step wizard
  (`Photo → AI Art → Details → Mint`).
- **Contracts:** `SneakerMint.mintWithProof(uri, proofHash, rarity, tier)` — requires
  `NEXT_PUBLIC_SNEAKER_MINT_ADDRESS` and `publicMintEnabled === true` on the contract.
- **Hooks:** `usePolygonWallet`, `useMintedSneakers` (`notifyMintedSneakersUpdated`).
- **Flow:**
  1. `selectPhoto` validates `image/*` and previews with `URL.createObjectURL`.
  2. `generateArtwork` POSTs `FormData{photo, style}` to `/api/generate-sneaker` and
     stores the returned base64 data URL.
  3. `mintSneaker` computes the SHA-256 of the data URL as the one-time `proofHash`,
     encodes `mintWithProof`, waits for the receipt, then saves to `localStorage`.
  4. Step 3 shows the tx link via `explorerTransactionUrl`.
- **Rarity → tier:** `RARITIES.findIndex(id)` — Common 0 … Mythic 3. The tier drives the
  staking boost and the game earn rate, so keep this mapping stable.
- **Edge cases:** missing `GEMINI_API_KEY` (503), image > 8 MB (413), non-image (400),
  duplicate proof hash (contract revert), wallet not connected, wrong chain.
- **Dev notes:** the API key is server-only. The proof is derived from the generated
  artwork, so regenerating produces a different proof and a different NFT.

### `/my-nfts` — Local collection

- **Files:** `src/app/my-nfts/page.tsx`, `src/components/MyNftsGallery.tsx`.
- **Purpose:** gallery of sneakers minted from this browser.
- **Data source:** `localStorage` only (not chain state). On-chain ownership lives in
  `useOwnedSneakers`, used by `/staking`, `/marketplace`, and `/game`.
- **States:** not connected → prompt; empty → CTA to `/mint`; populated → cards with
  rarity badge and explorer link.

### `/collection` — veSneakers store

- **Files:** `src/app/collection/page.tsx`, `src/components/VeSneakerStorefront.tsx`, `src/lib/ve-sneakers.ts`.
- **Purpose:** primary sale of **veSneakers** — virtual sneakers anyone can buy with POL,
  with or without a physical pair. Bought veSneakers behave like minted NFTs: lock them
  in staking for a POL APY boost, activate them daily for veRUNE, trade them on the
  marketplace.
- **Contracts:** `VeSneakerStore` (`NEXT_PUBLIC_VE_SNEAKER_STORE_ADDRESS`) mints on demand
  through `SneakerMint.mintAuthorized`, so the store holds `MINTER_ROLE`.
- **Hooks:** `useVeSneakerStore`, `useSubgraphActivity`.
- **Catalog:** `VE_SNEAKER_CATALOG` in `src/lib/ve-sneakers.ts` is the display source of
  truth (name, pixel design, palette, rarity, tier). **Its order must match
  `veSneakerDesigns()` in `scripts/deployment-config.ts`**, because the array position is
  the on-chain `designIndex`.
- **Buy flow:** pick a quantity (1–20) → `buy(designIndex)` for one or
  `buyBatch(designIndex, quantity)` for many, sending exactly `price × quantity` POL.
  Proceeds go straight to the store treasury.
- **Pricing:** defaults are **2× the `SneakerAppraiser` value** at the default rarity
  scores — Common 1.4, Rare 3.9, Epic 8.3, Mythic 18.7 POL. Overridable with
  `VE_PRICE_*_POL`. Supply: `VE_MAX_SUPPLY` (default 1000) per design.
- **Fallbacks:** when the store is not configured, the page renders the full catalog with
  the fallback prices and shows a demo-mode notice instead of crashing.
- **Dev notes:** the on-chain design list wins over the static catalog for name, rarity,
  tier, price, and supply. To add a design, register it on-chain **and** append to
  `VE_SNEAKER_CATALOG` at the same index.

### `/marketplace` — Buy, sell, auction, offer

- **Files:** `src/app/marketplace/page.tsx`, `src/components/MarketplaceDashboard.tsx`.
- **Contracts:** `SneakerMarketplace` (`NEXT_PUBLIC_SNEAKER_MARKETPLACE_ADDRESS`),
  `SneakerMint`, and indirectly `SneakerAppraiser` + `SneakerStaking` (sale locks and
  staked checks).
- **Hooks:** `useMarketplace`, `useSubgraphActivity`.
- **Tabs:** `Sell / Auction`, `My Listings`, `Make an Offer`.
- **Flows:**
  - **List:** `approve(marketplace, tokenId)` on SneakerMint, then
    `list(tokenId, price)` — two transactions, both awaited.
  - **Auction:** `approve`, then `createAuction(tokenId, startPrice, duration)`.
  - **Buy:** `buy(listingId)` with `value === price`.
  - **Cancel listing:** `cancelListing(listingId)` returns the NFT from escrow.
  - **Offer:** `makeOffer(tokenId, duration)` with escrowed `value`; the NFT stays with
    its owner until they call `acceptOffer(offerId)`.
- **Reads:** `tokenSaleKind(tokenId)` (0 free / 1 listed / 2 in auction) and
  `suggestedPrice(tokenId)` per owned NFT; `listings(id)` scanned over the last 64 slots
  for the "My Listings" tab.
- **Edge cases:** staked NFTs cannot be listed/auctioned; wrong payment reverts;
  auctions need a 1% higher bid; offers expire.
- **Dev notes:** the contract has no enumerable listing index — the 64-slot scan is a
  known limitation. If the marketplace grows, add an index or use the subgraph.

### `/game` — Sneaker game (veRUNE)

- **Files:** `src/app/game/page.tsx`, `src/components/SneakerGameDashboard.tsx`.
- **Contracts:** `SneakerGame` (`NEXT_PUBLIC_SNEAKER_GAME_ADDRESS`), `SneakerMint`,
  `RUNEToken` (redemption).
- **Hooks:** `useSneakerGame`, `useSubgraphActivity`.
- **Flows:** `activate(tokenId)` (24h cooldown per sneaker), `claimPoints(tokenId)`,
  `repair(tokenId)` (costs veRUNE), `redeem(points)` (only when `redemptionEnabled`).
- **Reads:** `sneakers(tokenId)` (streak, durability, pending, lifetime),
  `pendingPoints`, `canActivate`, `secondsUntilActivation`, `veRuneBalance(owner)`,
  `tierBasePointsPerDay`, `maxDurability`, `wearPerActivation`, `repairCostPoints`,
  `redemptionRate`, `redemptionEnabled`.
- **UI states per sneaker:** READY (can activate) / COOLDOWN (countdown) / WORN OUT
  (durability 0 → repair). Durability bar turns magma at ≤ 30%.
- **Dev notes:** veRUNE is virtual contract state, not an ERC-20 — never render it as a
  transferable token. The countdown is computed client-side from
  `lastActivationAt + 86_400`, refreshed every 30s.

### `/staking` — POL staking vault

- **Files:** `src/app/staking/page.tsx`, `src/components/StakingVaultDashboard.tsx`.
- **Contracts:** `SneakerStaking` (`NEXT_PUBLIC_STAKING_VAULT_ADDRESS`), `SneakerMint`.
- **Hooks:** `useStakingVault`, `useNftAppraisal`, `useSubgraphActivity`.
- **Tabs:** `Deposit POL`, `Claim Rewards`, `Withdraw Principal`, `Protocol Economics`.
- **Flows:** `depositPOL()` (payable), `withdrawPOL(amount)` (after the 30-day lock),
  `claimPOLRewards()`, `stake(tokenId)` / `unstake(tokenId)` for boosts.
- **Reads:** `polPositions`, `pendingPOLRewards`, `effectiveApyBps`, `positions`,
  `stakedTokenIds`, `availablePOLRewards`, `minLockSeconds`.
- **Dev notes:** boost is rarity-based and applied only while the NFT is locked in the
  vault. See [`polygon-staking-model.md`](polygon-staking-model.md).

### `/defi` — DeFi overview + staking

- **Files:** `src/app/defi/page.tsx`.
- **Purpose:** marketing overview of the yield model plus the full staking dashboard and
  the POL transfer card.
- **Notes:** the tier table in this page is static copy. Keep the APY/boost numbers in
  sync with `SneakerStaking` defaults (base 2.80%; boosts +0.5/+0.8/+1.5/+1.8%).

### `/roadmap` — Public roadmap

- **Files:** `src/app/roadmap/page.tsx`.
- **Purpose:** static quarter-by-quarter milestones with a `Status` of
  `done | active | next | planned`.
- **Notes:** pure data — update the `QUARTERS` array. Keep it aligned with
  [`polygon-contract-roadmap.md`](polygon-contract-roadmap.md).

### `/api/generate-sneaker` — AI artwork

- **File:** `src/app/api/generate-sneaker/route.ts` (`runtime = "nodejs"`, `maxDuration = 120`).
- **Input:** multipart `photo` (image/*, ≤ 8 MB) + optional `style` hint.
- **Output:** `{ imageBase64, mimeType }`.
- **Model:** `gemini-3.1-flash-image` via `@google/genai` (`ai.interactions.create`).
- **Errors:** 503 no `GEMINI_API_KEY`, 400 invalid request/image, 413 too large, 502
  model failure/no image.
- **Dev notes:** `GEMINI_API_KEY` must stay server-side. See the `gemini-api-dev` skill
  for model/SDK specifics.

### `/api/subgraph` — Activity proxy

- **File:** `src/app/api/subgraph/route.ts`.
- **Input:** `?address=0x...`.
- **Output:** `{ activities: SubgraphActivity[], error? }`.
- **Dev notes:** never query The Graph from the browser with the key; the deploy key is
  not a query key. Endpoint comes from `THE_GRAPH_QUERY_URL` or
  `THE_GRAPH_QUERY_API_KEY` + slug + version.

## Environment variables used by the app

| Variable | Used by |
| --- | --- |
| `NEXT_PUBLIC_POLYGON_NETWORK` | `Providers` (polygon \| amoy) |
| `NEXT_PUBLIC_POLYGON_RPC_URL` | `Providers` public client |
| `NEXT_PUBLIC_POLYGON_EXPLORER` | explorer links |
| `NEXT_PUBLIC_SNEAKER_MINT_ADDRESS` | mint, staking, marketplace, game |
| `NEXT_PUBLIC_STAKING_VAULT_ADDRESS` | staking, defi, marketplace |
| `NEXT_PUBLIC_SNEAKER_APPRAISER_ADDRESS` | staking, marketplace |
| `NEXT_PUBLIC_SNEAKER_MARKETPLACE_ADDRESS` | marketplace |
| `NEXT_PUBLIC_SNEAKER_GAME_ADDRESS` | game |
| `NEXT_PUBLIC_VE_SNEAKER_STORE_ADDRESS` | veSneakers store (`/collection`) |
| `NEXT_PUBLIC_REWARD_TOKEN_ADDRESS` | REN reads/redemption |
| `GEMINI_API_KEY` | `/api/generate-sneaker` (server-only) |
| `THE_GRAPH_QUERY_URL` / `_API_KEY` / `_SLUG` / `_VERSION` | `/api/subgraph` (server-only) |

## Adding a new route

1. Create `src/app/<route>/page.tsx` with `metadata` and the `Navbar` → `main` → `Footer`
   shell.
2. Add the interactive logic in a `"use client"` component under `src/components/`.
3. Put contract reads/writes in a hook under `src/hooks/` following the conventions above.
4. Add any new function signatures to `src/lib/contracts.ts`.
5. Add the link to `LINKS` in `src/components/Navbar.tsx`.
6. Document the route in this file and update the route map table.
7. Verify: `npm run lint`, `npm run typecheck`, `npm run build`.

## Verification

```bash
npm run lint
npm run typecheck
npm run build
npx hardhat test
```

Manual checks per route are listed in the `.devin/skills/polygon-frontend-evm` skill.
