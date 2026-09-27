# Airen app routes — developer guide

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
| `/collection` | `src/app/collection/page.tsx` | `VeSneakerStorefront`, `ModStorefront` | `VeSneakerStore`, `ModStore`, `SneakerMint`, `PlayerProgress` | `useVeSneakerStore`, `useModEconomy`, `usePlayerProgress`, `useSubgraphActivity` |
| `/workshop` | `src/app/workshop/page.tsx` | `WorkshopDashboard` | `SneakerWorkshop`, `SneakerMods`, `SneakerMint`, `SneakerGame` | `useWorkshop`, `useSubgraphActivity` |
| `/badges` | `src/app/badges/page.tsx` | `BadgesDashboard` | `SneakerMods`, `PlayerProgress` | `useBadges`, `usePlayerProgress`, `useSubgraphActivity` |
| `/marketplace` | `src/app/marketplace/page.tsx` | `MarketplaceDashboard` | `SneakerMarketplace`, `SneakerMint`, `SneakerMods`, `SneakerAppraiser`, `SneakerStaking` | `useMarketplace`, `useSubgraphActivity` |
| `/game` | `src/app/game/page.tsx` | `SneakerGameDashboard` | `SneakerGame`, `SneakerMint`, `RENToken` | `useSneakerGame`, `useSubgraphActivity` |
| `/staking` | `src/app/staking/page.tsx` | `StakingVaultDashboard` | `SneakerStaking`, `SneakerMint` | `useStakingVault`, `useNftAppraisal`, `useSubgraphActivity` |
| `/defi` | `src/app/defi/page.tsx` | `StakingVaultDashboard`, `PolygonTransferCard` | `SneakerStaking` | same as `/staking` |
| `/roadmap` | `src/app/roadmap/page.tsx` | static milestones | — | — |
| `/profile` | `src/app/profile/page.tsx` | `ProfileDashboard` | `SneakerMint`, `SneakerMods` (owned counts), `PlayerProgress` | `useProfile`, `usePlayerProgress`, `useMintedSneakers`, `useOwnedSneakers`, `useOwnedMods`, `useSubgraphActivity` |
| `/api/generate-sneaker` | `src/app/api/generate-sneaker/route.ts` | — | — | — |
| `/api/subgraph` | `src/app/api/subgraph/route.ts` | — | The Graph Studio | — |
| `/api/pol-price` | `src/app/api/pol-price/route.ts` | — | Uniswap Trading API | `usePolPrice` |

Every page follows the same shell: `Navbar` → `<main>` → `Footer`, wrapped by
`Providers` in `src/app/layout.tsx`. The root layout also mounts `MobileNav`, the
fixed bottom bar that carries the five primary destinations on phones — see
[`mobile-experience.md`](mobile-experience.md).

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
`sneakerAppraiserAbi`, `sneakerMarketplaceAbi`, `sneakerGameAbi`, `veSneakerStoreAbi`,
`sneakerModsAbi`, `sneakerWorkshopAbi`, `sneakerSwapAbi`, `modRentalAbi`, `modStoreAbi`,
`playerProgressAbi`, `erc721BalanceAbi`, `erc721ApproveAbi`. The marketplace ABI is collection-aware: `list`,
`createAuction`, `makeOffer`, and `tokenSaleKind` all take the NFT contract address.
When you add a contract function, add the ABI entry here **and**
export the inferred type. `uint16` outputs are inferred as `number` by viem — wrap with
`BigInt(...)` (see `useSneakerGame`).

### NFT metadata + local collection — `src/lib/sneaker-nft.ts`

- `RARITIES` maps rarity levels to `multiplier`, `boostBps`, and `boostLabel`
  (Common +0.5%, Rare +0.8%, Epic +1.5%, Mythic +1.8%).
- `PALETTES` defines the four AI art palettes.
- `buildTokenUri(metadata)` builds the base64 `data:application/json` token URI.
- `getMintedSneakers` / `saveMintedSneaker` persist the user's minted list in
  `localStorage` under `airen:my-nfts:<address>`.

### Subgraph client — `src/lib/subgraph.ts`

Server-only. `fetchSubgraphActivity(address)` introspects the GraphQL schema, finds
address-indexed activity roots, and normalizes rows into `SubgraphActivity[]`. It is
exposed to the browser only through `/api/subgraph`. See
[`subgraph-integration.md`](subgraph-integration.md).

### Sneaker artwork — `src/components/SneakerArtwork.tsx`

The initial art registry in `src/lib/ve-sneakers.ts` maps the Astra, Sol, and Luna
families to `/veSneakerAstra.png`, `/veSneakerSol.png`, and `/veSneakerLuna.png`.
`SneakerArtwork` renders these square PNGs with `next/image`, `object-contain`, and a
reserved aspect ratio. Do not choose art from a token ID.

`resolveSneakerArtwork` reads the NFT's `tokenURI`: it honors the `Collection` metadata
trait for family assets, preserves embedded AI-generated image data for user-minted
sneakers, and maps legacy `pixel://vesneaker/<design>` metadata to the closest initial
family. `useOwnedSneakers` supplies this resolved artwork to `/workshop`, `/game`,
`/marketplace`, and `/staking`. `PixelSneaker.tsx` remains a compatibility re-export;
vector UI icons and the PWA icon are separate from sneaker artwork.

### Mobile shell — `MobileNav`, `MoreSheet`, `Navbar`

- `MobileNav` (`fixed`, `md:hidden`) is mounted once in `src/app/layout.tsx` and holds the
  five primary destinations: Home, Mint, veSneakers, Game, Market. It hides on scroll
  down and returns on scroll up, and always reappears on route change.
- `MoreSheet` is the reusable bottom sheet (portal, scroll lock, focus trap, Escape,
  backdrop tap, safe-area padding). Used by the "More" menu and by the wallet dialogs on
  mobile.
- `Navbar` uses the Airen chevron mark as its home link — `/LogoAirenBlack.webp` (black)
  in light mode and `/LogoAiren.webp` (cyan) in dark mode — and keeps the desktop links
  at `md+`. It exposes a 44px menu button below `md` that opens `MoreSheet` with Staking,
  My NFTs, DeFi, Roadmap and the theme toggle.
- `Footer` replaces the legacy Airen wordmark with the Airen wordmark —
  `/AirenBlack.webp` (black) in light mode and `/AirenWhite.png` (white) in dark mode.
- `Navbar` also mounts `ProfileButton` — a round avatar/user icon to the left of the
  desktop theme toggle (and next to the wallet button on mobile) linking to `/profile`.
  It renders the profile avatar image when one is set.
- `body` reserves the bar height plus the bottom safe-area inset, so pages do not need
  their own bottom padding. Details and conventions: [`mobile-experience.md`](mobile-experience.md).

### Hooks inventory — `src/hooks/`

| Hook | Purpose |
| --- | --- |
| `usePolygonWallet` (in Providers) | Wallet state, chain guard, tx sending |
| `useContractTransaction` | `execute({to, data, value})` → waits for receipt, tracks pending/error |
| `useOwnedSneakers` | Reads ERC-721 IDs, rarity/tier traits, and `tokenURI`; resolves Astra/Sol/Luna family art, legacy `pixel://` designs, or embedded AI artwork |
| `useMintedSneakers` | Reads the local minted list; `notifyMintedSneakersUpdated()` broadcasts changes |
| `useWalletOverview` | Native POL balance for the connected wallet |
| `useNftAppraisal` | Batch `SneakerAppraiser.appraise(tokenId)` reads + global params |
| `useStakingVault` | Staking reads + `depositPOL`/`withdrawPOL`/`claimPOLRewards`/`stake`/`unstake` |
| `useMarketplace` | Marketplace reads + collection-aware list/buy/auction/offer txs + `approveNft` |
| `useOwnedMods` | Reads the wallet's mod NFTs + traits (`balanceOf`, `tokenOfOwnerByIndex`, `traitsOf`) |
| `useWorkshop` | Workshop reads (equipped slots, effective bonuses, forge) + equip/unequip/repairKit/forge txs |
| `useBadges` | Achievement registry reads + `claim` tx on `SneakerMods` |
| `useModEconomy` | `SneakerSwap` + `ModRental` + `ModStore` txs (approveMod, createSwap/acceptSwap/cancelSwap, listRental/cancelRental/rent/equipRented/releaseEarly/returnExpired, buyMod) |
| `useSneakerGame` | Game reads + `activate`/`claimPoints`/`repair`/`redeem` |
| `useVeSneakerStore` | veSneaker catalog reads + `buy(designIndex, price, quantity)` |
| `usePolPrice` | Live POL/USD from `/api/pol-price` (Uniswap proxy) for USD hints |
| `useSubgraphActivity` | `/api/subgraph` feed + `addLocalActivity` optimistic entries |
| `useProfile` | Local per-wallet profile (username, avatar: uploaded image or minted-NFT art) under `airen:profile:<address>`; `PROFILE_UPDATED_EVENT` broadcasts changes |
| `usePlayerProgress` | On-chain `PlayerProgress` reads — `progressOf` (xp/level/thresholds), `xpBreakdown`, public username + NFT avatar pointer. `configured` false until `NEXT_PUBLIC_PLAYER_PROGRESS_ADDRESS` is set |

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
- **Purpose:** retro-futuristic landing page introducing the Astra, Sol, and Luna family lines, with a POL transfer card.
- **Carousel:** `SneakerCarousel` crossfades the three family PNGs, has previous/next and family selectors plus a pause toggle, pauses on hover/focus, and stops automatic rotation for reduced-motion or when out of view.
- **Contracts:** none (the transfer card uses `sendNative`).
- **Notes:** the page copy and family carousel are client-independent of store reads; the hero uses local public PNGs.

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

### `/my-nfts` — Local collection + owned mods

- **Files:** `src/app/my-nfts/page.tsx`, `src/components/MyNftsGallery.tsx`, `src/components/MyModsGallery.tsx`.
- **Purpose:** gallery of sneakers minted from this browser plus the wallet's
  on-chain mod/badge NFTs (`MyModsGallery` reads `useOwnedMods` against `SneakerMods`).
- **Data source:** `localStorage` for the minted list (not chain state) + RPC for mods.
  On-chain sneaker ownership lives in `useOwnedSneakers`, used by `/staking`,
  `/marketplace`, and `/game`.
- **States:** not connected → prompt; empty → CTA to `/mint`; populated → cards with
  rarity badge and explorer link.

### `/collection` — veSneakers store

- **Files:** `src/app/collection/page.tsx`, `src/components/VeSneakerStorefront.tsx`, `src/lib/ve-sneakers.ts`.
- **Purpose:** primary sale of **veSneakers** — the playable NFTs of the virtual
  sneaker economy, bought with POL. Bought veSneakers behave like minted NFTs: lock them
  in staking for a POL APY boost, activate them daily for veRUNE, equip mods in the
  workshop, trade them on the marketplace.
- **Contracts:** `VeSneakerStore` (`NEXT_PUBLIC_VE_SNEAKER_STORE_ADDRESS`) mints on demand
  through `SneakerMint.mintAuthorized`, so the store holds `MINTER_ROLE`.
- **Hooks:** `useVeSneakerStore`, `useSubgraphActivity`, `usePolPrice`.
- **Catalog:** the initial `VE_SNEAKER_CATALOG` entries are Astra, Sol, Luna, in that
  order. Each entry contains its family, art path, rarity, and tier. **Its order matches
  the first three `veSneakerDesigns()` entries in `scripts/deployment-config.ts`** because
  the array position is the on-chain `designIndex`; never reorder registered indices.
- **Buy flow:** pick a quantity (1–20) → `buy(designIndex)` for one or
  `buyBatch(designIndex, quantity)` for many, sending exactly `price × quantity` POL.
  Proceeds go straight to the store treasury.
- **Pricing:** USD targets converted at `POL_USD_PRICE` — **$40 (Common) → $150 (Mythic)**,
  geometric progression, i.e. **410 / 635 / 993 / 1536 POL** at POL = $0.09764. Tune with
  `VE_PRICE_*_USD` (targets) or `VE_PRICE_*_POL` (exact POL). Supply: `VE_MAX_SUPPLY`
  (default 1000) per design.
- **Fallbacks:** when the store is not configured, the page renders the full catalog with
  the fallback prices and shows a demo-mode notice instead of crashing.
- **Dev notes:** price, rarity, tier, and supply are read from the on-chain design at
  the matching index; the initial family label and artwork come from the static catalog.
  Fresh stores register three family designs (default 1,000 copies each). Existing stores
  keep their historical indices; the storefront exposes the first three families and
  does not delete or renumber legacy entries. Append future artwork designs at new indices.
- **NFT metadata:** `veSneakerTokenUri` writes an absolute image URL using the public
  `VE_SNEAKER_ASSET_BASE_URL` origin. For an already configured store, set
  `VE_UPDATE_DESIGN_URIS=true` when running `scripts/mint-veSneakers.ts` to update the
  first three design URIs for future mints. Existing minted token URIs are immutable and
  are resolved in the app through `useOwnedSneakers`.
- **Mod storefront:** `ModStorefront` (`src/components/ModStorefront.tsx`) renders the
  `ModStore` catalog on the same page — premium mod designs (including consumables)
  bought with POL via `useModEconomy.buyMod`.
- **Level gates:** both stores support `requiredLevel` per design — gated cards show a
  `LV X+` chip and the buy button reads "Requires level X" (disabled) when
  `usePlayerProgress` reports a lower level or `PlayerProgress` is unconfigured.
  This is how extra copies of skill NFTs are sold — see
  [`player-progression.md`](player-progression.md).

### `/marketplace` — Buy, sell, auction, offer

- **Files:** `src/app/marketplace/page.tsx`, `src/components/MarketplaceDashboard.tsx`.
- **Contracts:** `SneakerMarketplace` (`NEXT_PUBLIC_SNEAKER_MARKETPLACE_ADDRESS`),
  `SneakerMint`, and indirectly `SneakerAppraiser` + `SneakerStaking` (sale locks and
  staked checks).
- **Hooks:** `useMarketplace`, `useSubgraphActivity`.
- **Tabs:** `Sell / Auction`, `My Listings`, `Make an Offer`, plus `ModMarketTabs`
  (`src/components/ModMarketTabs.tsx`) with `Mods`, `Rentals`, and `Trades` — mod
  sales, `ModRental` listings/rentals, and `SneakerSwap` NFT↔NFT offers.
- **Flows (collection-aware — every call passes the NFT contract first):**
  - **List:** `approve(marketplace, tokenId)` on the collection, then
    `list(collection, tokenId, price)` — two transactions, both awaited.
  - **Auction:** `approve`, then `createAuction(collection, tokenId, startPrice, duration)`.
  - **Buy:** `buy(listingId)` with `value === price`.
  - **Cancel listing:** `cancelListing(listingId)` returns the NFT from escrow.
  - **Offer:** `makeOffer(collection, tokenId, duration)` with escrowed `value`; the NFT
    stays with its owner until they call `acceptOffer(offerId)`.
- **Reads:** `tokenSaleKind(collection, tokenId)` (0 free / 1 listed / 2 in auction) and
  `suggestedPrice(tokenId)` per owned sneaker; `listings(id)` scanned over the last 64
  slots for the "My Listings" tab.
- **Collections:** only contracts in `allowedCollections` can trade — `SneakerMint` is
  allowed in the constructor, `SneakerMods` is enabled at deploy time. Mods list and
  auction exactly like sneakers but have no appraiser suggestion (priced by the market).
- **Edge cases:** staked NFTs cannot be listed/auctioned; sneakers with mods still
  equipped in the workshop cannot be listed or auctioned (unequip first); wrong payment
  reverts; auctions need a 1% higher bid; offers expire.
- **Dev notes:** the contract has no enumerable listing index — the 64-slot scan is a
  known limitation. If the marketplace grows, add an index or use the subgraph.

### `/workshop` — Upgrade hub

- **Files:** `src/app/workshop/page.tsx`, `src/components/WorkshopDashboard.tsx`, `src/lib/mods.ts`.
- **Contracts:** `SneakerWorkshop` (`NEXT_PUBLIC_SNEAKER_WORKSHOP_ADDRESS`),
  `SneakerMods` (`NEXT_PUBLIC_SNEAKER_MODS_ADDRESS`), `SneakerMint`, `SneakerGame`.
- **Hooks:** `useWorkshop`, `useSubgraphActivity`.
- **Slots:** seven per sneaker — `SLOTS` in `src/lib/mods.ts` mirrors the contract:
  Sole (−wear), Upper (+earn rate), Lining (−repair cost), Skin (+appraisal,
  cosmetic override), Core (auto-activation), Boost (+staking APY), Skill
  (passive +earn rate from level-gated skill NFTs).
- **Vitals card:** live `powerOf` / `healthOf` / `energyOf` reads via `useSneakerGame`
  — health decays 1/day, energy refills on manual activation.
- **Flows:**
  - **Equip:** `approve(workshop, modId)` on SneakerMods, then `equip(sneakerId, modId)`
    — the mod moves into workshop escrow, one mod per slot.
  - **Unequip:** `unequip(sneakerId, slot)` returns the mod to the owner.
  - **Consumables:** `useAbility(sneakerId, modId)` burns a consumable mod and applies
    its `aux` ability — `0`/`255` repair kit (free full health), `1` surge (instant
    activation, 2⚡), `2` boost capsule (+`effectBps` earn for 24h, 1⚡), `3` forge
    stone (free level, 2⚡), `4` Overdrive (+`effectBps` earn for 48h, 3⚡),
    `5` Stim pack (instant energy refill, free), `6` Lucky repair (full health +
    `effectBps` boost for 24h, 1⚡). `useRepairKit` remains as a repair-kit-only
    shortcut.
  - **Forge:** `forge(sneakerId)` burns claimed veRUNE (`nextForgeCost = base × (level+1)`)
    for permanent +rarity/+earn-rate levels.
- **Reads:** `equipped(sneakerId, slot)` per slot plus the bonus snapshot
  (`earnBonusBps`, `wearReductionBps`, `repairDiscountBps`, `appraisalBonusBps`,
  `stakingBoostBps`, `skillBonusBps`, `autoActive`, `skinOverride`, `forgeLevel`,
  `nextForgeCost`, `tempBoostBps`, `boostExpiresAt`).
- **Dev notes:** sneakers with equipped mods cannot be listed or auctioned — the UI
  shows the equipped state so users can unequip first. Rented mods equip through
  `ModRental.equipRented`, not `equip`.

### `/badges` — Achievement badges

- **Files:** `src/app/badges/page.tsx`, `src/components/BadgesDashboard.tsx`.
- **Contracts:** `SneakerMods` (`NEXT_PUBLIC_SNEAKER_MODS_ADDRESS`).
- **Hooks:** `useBadges`, `useSubgraphActivity`.
- **Flow:** `claim(achievementId, sneakerId)` mints the badge mod when the on-chain
  requirement is met (checked by `meetsRequirement`). One claim per wallet per
  achievement; sneaker-scoped kinds (streak, lifetime points) take the tokenId.
  `ReqKind.PlayerLevel` badges are the free skill claims — they verify
  `PlayerProgress.levelOf ≥ threshold` on-chain.
- **Reads:** `achievementCount` + `achievements(id)` (kind, threshold, slot, traits,
  active), `meetsRequirement`, `achievementClaimed`.
- **Level skills:** `ReqKind.PlayerLevel` achievements render in a dedicated
  "Level skills" section — free claim once `PlayerProgress.levelOf` reaches the
  threshold, with the player's live level shown in the header and a link to
  `/collection` for purchasable extra copies (ModStore `requiredLevel` designs).
- **Dev notes:** badges are mod NFTs — claimed badges appear in `useOwnedMods` and can
  be equipped, sold, auctioned, traded, or rented like any other mod.

### `/game` — Sneaker game (veRUNE)

- **Files:** `src/app/game/page.tsx`, `src/components/SneakerGameDashboard.tsx`.
- **Contracts:** `SneakerGame` (`NEXT_PUBLIC_SNEAKER_GAME_ADDRESS`), `SneakerMint`,
  `RENToken` (redemption).
- **Hooks:** `useSneakerGame`, `useSubgraphActivity`.
- **Flows:** `activate(tokenId)` (24h cooldown per sneaker), `claimPoints(tokenId)`,
  `repair(tokenId)` (costs veRUNE), `redeem(points)` (only when `redemptionEnabled`).
- **Reads:** `sneakers(tokenId)` (8-field state: streak, durability, pending,
  lifetime, `lastDecayAt`, `energy`), `pendingPoints`, `powerOf`, `healthOf`,
  `energyOf`, `maxEnergyOf`, `earnRatePerSecond`, `canActivate`,
  `secondsUntilActivation`, `veRuneBalance(owner)`, `tierBasePointsPerDay`,
  `maxDurability`, `wearPerActivation`, `repairCostPoints`, `redemptionRate`,
  `redemptionEnabled`.
- **UI states per sneaker:** READY (can activate) / COOLDOWN (countdown) / WORN OUT
  (live health 0 → repair). Health bar turns magma at ≤ 30%; each card shows
  power (daily veRUNE at 1x streak) and energy charges.
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

### `/profile` — Runner profile + player level

- **Files:** `src/app/profile/page.tsx`, `src/components/ProfileDashboard.tsx`,
  `src/lib/profile.ts`, `src/hooks/useProfile.ts`.
- **Purpose:** per-wallet identity — editable username, avatar (device upload or a
  minted sneaker's artwork), player level with XP bar, stats grid, and an activity
  feed combining indexed events with local mint history.
- **Data source:** `localStorage` under `airen:profile:<address>` (hybrid by design:
  identity is local UX state today and migrates on-chain with `PlayerProgress`;
  uploaded images never leave the device). Owned counts come from `SneakerMint` /
  `SneakerMods` reads; activity from `useSubgraphActivity`.
- **Username:** 3–20 chars, validated by `isValidUsername`, default `Runner #<last4>`.
- **Avatar:** `fileToAvatarDataUrl` square-crops uploads to 256px JPEG (~100 KB);
  the NFT tab picks any locally minted sneaker and stores its `MintedSneaker.id`.
  `/my-nfts` cards also expose a "Set as avatar" shortcut.
- **Levels:** when `NEXT_PUBLIC_PLAYER_PROGRESS_ADDRESS` is configured, the level card
  reads the on-chain `progressOf` snapshot (XP, level, thresholds) — verified,
  tamper-proof, and the gate for skill NFT unlocks (one free claim per skill,
  extra copies purchasable in the stores). Without it, `levelProgress` in
  `src/lib/profile.ts` shows a local estimate (owned sneakers ×100, mods ×40, mints ×60,
  activity ×30) across the same 10-tier curve.
- **Skills section:** lists owned skill NFTs — passive slot-6 mods and consumable
  skills (aux 4–6) — with a "Claim skills →" link to `/badges`. Full system
  reference: [`player-progression.md`](player-progression.md).
- **Dev notes:** safe without a wallet (guest profile) and without contract addresses
  (local signals still drive stats and the level bar).

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

### `/api/pol-price` — POL/USD feed

- **File:** `src/app/api/pol-price/route.ts`, helper in `src/lib/uniswap.ts`.
- **Input:** `?refresh=1` to bypass the cache.
- **Output:** `{ usd, source: "uniswap" | "fallback", updatedAt, note? }`.
- **Purpose:** keeps the veSneaker USD hints current. Quotes 1,000 WPOL → USDC through
  the Uniswap Trading API and derives USD-per-POL.
- **Dev notes:** server-only — the Trading API has no CORS and requires `x-api-key`, so
  the browser must never call it directly. Cached for `POL_PRICE_CACHE_SECONDS`; failures
  fall back to `POL_USD_PRICE` and are never cached. See
  [`uniswap-price-feed.md`](uniswap-price-feed.md).

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
| `NEXT_PUBLIC_SNEAKER_MODS_ADDRESS` | workshop, badges, marketplace (mods) |
| `NEXT_PUBLIC_SNEAKER_WORKSHOP_ADDRESS` | workshop |
| `NEXT_PUBLIC_SNEAKER_SWAP_ADDRESS` | NFT↔NFT trades |
| `NEXT_PUBLIC_MOD_RENTAL_ADDRESS` | mod rentals |
| `NEXT_PUBLIC_MOD_STORE_ADDRESS` | premium mod store |
| `NEXT_PUBLIC_PLAYER_PROGRESS_ADDRESS` | profile (on-chain XP/levels + public identity) |
| `NEXT_PUBLIC_REWARD_TOKEN_ADDRESS` | REN reads/redemption |
| `GEMINI_API_KEY` | `/api/generate-sneaker` (server-only) |
| `THE_GRAPH_QUERY_URL` / `_API_KEY` / `_SLUG` / `_VERSION` | `/api/subgraph` (server-only) |
| `UNISWAP_API_KEY` / `UNISWAP_TRADING_API_URL` / `UNISWAP_QUOTE_SWAPPER` / `POL_PRICE_CACHE_SECONDS` | `/api/pol-price` (server-only) |
| `POL_USD_PRICE` | Price fallback + deploy-time USD→POL conversion |

## Adding a new route

1. Create `src/app/<route>/page.tsx` with `metadata` and the `Navbar` → `main` → `Footer`
   shell.
2. Add the interactive logic in a `"use client"` component under `src/components/`.
3. Put contract reads/writes in a hook under `src/hooks/` following the conventions above.
4. Add any new function signatures to `src/lib/contracts.ts`.
5. Decide where it belongs in navigation: a primary destination goes in
   `MOBILE_NAV_ITEMS` (`MobileNav.tsx`, max five) and `LINKS` (`Navbar.tsx`); anything
   else goes in `SECONDARY_LINKS` (`Navbar.tsx`) so it stays reachable on phones.
6. Keep it mobile-safe: ≥ 44px tap targets, no fixed widths that exceed the viewport,
   horizontal rows via the `.scroll-x` class, and no bottom padding (the layout reserves
   it for the bottom bar). See [`mobile-experience.md`](mobile-experience.md).
7. Document the route in this file and update the route map table.
8. Verify: `npm run lint`, `npm run typecheck`, `npm run build`.

## Verification

```bash
npm run lint
npm run typecheck
npm run build
npx hardhat test
```

Manual checks per route are listed in the `.devin/skills/polygon-frontend-evm` skill.
