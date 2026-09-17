# RUN&EARN tokenomics — 100M REN and veRUNE points

This document describes the economic design for the REN reward token (ERC-20, symbol `REN`, 18 decimals, 100M hard cap) and the virtual veRUNE points earned through the SneakerGame gamification system. It is a design proposal, not a promise of returns. Mainnet launch requires economic review and multisig controls.

## Two layers: REN (real) and veRUNE (virtual)

| Layer | Type | Where it lives | Convertible? |
| --- | --- | --- | --- |
| **REN** | ERC-20 token, 100M hard cap | On-chain (`RUNEToken.sol`) | Tradable, transferable |
| **veRUNE** | Virtual points (not tokenized) | Contract state in `SneakerGame.sol` | Redeemable 1:rate for REN once redemption is enabled |

veRUNE is intentionally **not** an ERC-20: it avoids creating an unregulated liquid asset while the product is in beta, keeps gas costs near zero for point accrual, and lets the protocol tune issuance before real value is at stake.

## REN supply allocation (100M hard cap)

| Allocation | % | REN | Purpose | Emission |
| --- | --- | --- | --- | --- |
| Staking reward reserve | 35% | 35M | Funds the POL staking APY (base 2.80% + NFT boosts up to 8%) | Released by admin `mint()` as the reserve is consumed; budgeted per epoch |
| Play-to-earn (veRUNE redemption pool) | 20% | 20M | Backs veRUNE → REN redemption in `SneakerGame` | Minted/transferred into the game contract before enabling redemption |
| Marketplace & treasury | 15% | 15M | Liquidity incentives, buy-backs, marketplace campaigns | Multisig-controlled |
| Team & advisors | 10% | 10M | Core development | 12-month cliff + 24-month linear vesting |
| Liquidity (DEX/CEX) | 10% | 10M | POL/REN and REN/stable pairs | Seeded at launch; LP tokens locked |
| Community, airdrops & quests | 10% | 10M | Retention campaigns, referral rewards, sneaker drops | Epoch-based |

Total: **100M REN**. The cap is enforced on-chain by `RUNEToken.MAX_SUPPLY`.

## veRUNE accrual (SneakerGame)

Each SneakerMint NFT behaves like a physical sneaker: it must be **activated every 24 hours** to keep earning, it **wears out** with use, and its earn rate grows with daily streaks.

### Base earn rate by tier

| Tier | Label | veRUNE / day (at 1x streak) |
| --- | --- | --- |
| 0 | Common | 100 |
| 1 | Rare | 200 |
| 2 | Epic | 400 |
| 3 | Mythic | 800 |

### Mechanics

1. **Activation (every 24h):** the owner calls `activate(tokenId)` once per 24h. Activation starts a 24h earning window.
2. **Streak bonus:** activating within 48h of the previous activation increments the streak. Each streak day adds +1% to the earn rate, capped at +50% (streak 51+). Missing more than 48h resets the streak to 1.
3. **Durability (wear):** each activation consumes 1 durability point (max 10). At 0 durability the sneaker stops earning until repaired.
4. **Repair:** costs 50 veRUNE and restores full durability — a point sink that recycles value back into the economy.
5. **Passive accrual:** points accrue per second while the sneaker is inside its 24h window and durability > 0. Points accumulate per NFT and are claimed by the owner to their veRUNE balance.

### Example: Mythic sneaker with a 30-day streak

- Base: 800 veRUNE/day
- Streak multiplier at day 30: 1 + min(29 × 1%, 50%) = 1.29x
- Daily rate: 800 × 1.29 = 1,032 veRUNE/day
- Monthly (30 days): ~30,960 veRUNE

## veRUNE → REN redemption

- Rate: **100 veRUNE = 1 REN** (`redemptionRate`, admin-configurable).
- Redemption is **disabled at deployment**. The admin funds the game contract with REN and calls `setRedemptionEnabled(true)`.
- Redemption burns nothing: points are deducted from the user's balance and REN is transferred from the game contract's funded pool.
- The 20M play-to-earn allocation caps total redemption supply. At 100 veRUNE/REN, the pool backs up to 200M veRUNE of redemptions.

### Emission budget sanity check

With the default rates, a fully active user with one Mythic sneaker earns ~800–1,200 veRUNE/day (≈ 8–12 REN/day at the default rate). The 20M play-to-earn pool supports roughly:

- ~2,000 user-years of a single active Mythic sneaker, or
- ~10,000 user-years of a single active Common sneaker (100 veRUNE/day ≈ 1 REN/day).

The admin can tune `tierBasePointsPerDay`, `streakBonusStepBps`, and `redemptionRate` before enabling redemption to match actual retention and treasury capacity.

## Marketplace economy (SneakerMarketplace)

- Payments in native POL; the marketplace charges a **2.5% fee** (`feeBps = 250`) on sales, auctions, and accepted offers.
- Suggested listing price = `SneakerAppraiser` valuation × 1.2 (`appraiserPremiumBps`).
- NFTs locked in `SneakerStaking` cannot be listed or auctioned — they must be unstaked first. This keeps the staking APY backing honest: a sneaker either boosts APY or is for sale, never both.
- Value-improvement recommendations (`valueRecommendations`) guide holders to mint higher tiers, raise rarity, keep sneakers staked or active in the game — all of which increase appraiser valuations over time.

## Primary sale: veSneakers (VeSneakerStore)

**veSneakers** are the virtual version of the sneakers. Anyone can buy them with POL —
no physical pair required — and they behave exactly like minted NFTs afterwards.

### Pricing (USD targets, geometric progression)

Prices are defined in **USD** and converted to POL with `POL_USD_PRICE`, so a POL move is
a single env change. The targets run geometrically from **$40 (Common) to $150 (Mythic)**:

| Tier | Rarity score | USD target | Sale price @ POL $0.09764 | Appraiser value | Multiple |
| --- | --- | --- | --- | --- | --- |
| Common | 20 | $40 | **410 POL** | 0.70 POL | 586× |
| Rare | 45 | $62 | **635 POL** | 1.95 POL | 326× |
| Epic | 65 | $97 | **993 POL** | 4.15 POL | 239× |
| Mythic | 85 | $150 | **1536 POL** | 9.35 POL | 164× |

Overrides: `VE_PRICE_COMMON_USD` / `_RARE_` / `_EPIC_` / `_MYTHIC_` for the USD targets,
or `VE_PRICE_*_POL` to pin an exact POL price. The live POL/USD rate is served by
`/api/pol-price` (Uniswap Trading API); see
[`uniswap-price-feed.md`](uniswap-price-feed.md).

> **Note on the appraiser gap.** The primary price is far above the on-chain
> `SneakerAppraiser` valuation, so a veSneaker does **not** resell at cost on the
> marketplace (which suggests 1.2× the appraiser value). The primary price should be read
> as an entry ticket to the staking/game loops — the APY boost, veRUNE emissions, and
> future rarity upgrades are what the buyer is paying for. If secondary liquidity is a
> goal, either raise `appraiserPremiumBps` or lower the USD targets.

### Supply

- 9 genesis designs × 1,000 copies = **9,000 veSneakers** maximum (`VE_MAX_SUPPLY`).
- Minted on demand: the buyer pays POL and `VeSneakerStore` mints through
  `SneakerMint.mintAuthorized`, so no upfront gas is needed for the whole collection.
- `reserveMint` lets the admin allocate copies to the treasury (airdrops, partnerships,
  marketplace seeding) while still counting against the design cap.

### Revenue flow

- 100% of sale proceeds go to the store treasury (`treasury`), controlled by the admin.
- `POL_USD_PRICE` is a deploy-time display value only; on-chain prices are fixed in POL.
- Re-pricing is done with `updateDesign` (admin) without redeploying.

### Why it matters for the token economy

Primary sales are the protocol's **POL revenue line**: they fund the staking reward
reserve and the veRUNE redemption pool without selling REN on the open market. Every
veSneaker sold also increases demand for the staking and game loops, since the asset only
produces yield once it is locked or activated.

## Value loops

1. **Mint → Game:** activate daily → build streak → earn veRUNE → repair to sustain → redeem REN.
2. **Mint → Stake:** lock NFT → +0.5% to +1.8% APY on staked POL (30-day lock).
3. **Mint → Marketplace:** appraiser valuation → sell, auction, or accept offers in POL.
4. **Stake ↔ Marketplace tension:** staked sneakers earn APY but cannot be sold; the owner chooses between yield and liquidity.

## Sustainability guardrails

- REN hard cap: 100M, enforced on-chain.
- veRUNE redemption gated by a funded pool — the protocol can never owe more REN than it holds.
- Staking APY capped at 8% with a funded POL reserve separate from principal.
- All game/marketplace/appraiser parameters are admin-configurable before mainnet; mainnet requires multisig + timelock governance.
