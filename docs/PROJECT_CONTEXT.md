# Airen — project context for an AI agent

> **Purpose of this file.** A single, self-contained brief for handing Airen's
> context to another agent. Everything here was read from the repository, the
> deployed contracts, or verified against Polygon mainnet — not recalled. Where a
> fact is a design decision rather than an observation, it says so.
>
> **Last verified:** 2026-10-21 · package `airen@2.1.0` · branch `master`

---

## 1. What Airen is

**In one sentence.** A virtual sneaker universe in pixel art on Polygon: collect
veSneakers, wear them out by playing, keep them alive with mods, stake them for
yield, and trade them — with the artwork generated from photographs by AI.

**In one paragraph.** Airen is a game economy rather than a collectible drop. Each
sneaker is an ERC-721 with live state: it earns a virtual currency while
activated, decays whether you play or not, and can be repaired, upgraded with
equippable mods, staked to boost a native-POL yield position, or sold. The
protocol's revenue comes from primary sales (POL), marketplace fees, and
pay-per-call AI generation (USDC via x402). A separate ERC-20 (`REN`) backs the
game currency, with a hard cap and a funded redemption pool so the protocol can
never owe more than it holds.

**The pitch that matters.** Most NFT games die when the floor does. Airen's
sneakers have a *reason to be used* that is not price: they wear out, and wearing
them out is how you earn. The mod economy exists because of the decay, not beside
it.

---

## 2. Current state — what is real today

| | |
| --- | --- |
| Chain | Polygon mainnet (`137`) |
| Contracts | **15, all deployed and verified on PolygonScan** |
| Tests | **394 Solidity (forge-std) + 136 Mocha**, all passing |
| App | Next.js 16 App Router, **14 routes + 6 API routes**, all 200 |
| Version | `airen@2.1.0` |
| Audit | **None.** See §12. |
| Revenue so far | **Zero.** Nothing has been sold. The treasury is at 0 POL. |

### Deployed addresses

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
**Admin (all 15 contracts):** `0x581A41c663223bAE563134C67151CdC2C274f06A`
**Arena signer (server-side, scoped):** `0xf827853De614A5d745658A789abd2c093d75a720`

> **`ModRental` does not exist.** `docs/contract-architecture-plan.md` still lists
> it; it was deleted along with its wiring. Trust the deployed list above over that
> document.

---

## 3. The product surface

**Routes (14):** `/` · `/mint` · `/collection` · `/my-nfts` · `/marketplace` ·
`/workshop` · `/game` · `/play` · `/staking` · `/defi` · `/badges` · `/profile` ·
`/roadmap` · `/treasury`

**API routes (6):**

| Route | What it does | Cost gate |
| --- | --- | --- |
| `/api/generate-sneaker` | Photo → Gemini vision grade → pixel-art render → metadata | **x402, $0.75 USDC** (optional) + rate limit + daily budget |
| `/api/tab-session` | Signs a tab-arena score server-side | Rate limited |
| `/api/pol-price` | POL/USD via the Uniswap Trading API | Cached, `max-age=60, stale-while-revalidate=300` |
| `/api/subgraph` | Server-only Graph proxy | Rate limited |
| `/api/verify-sponsorship` | thirdweb gas-sponsorship allowlist | None by design (see §9) |
| `/api/x402-manifest` | Serves `/.well-known/x402` | None |

---

## 4. How the contracts fit together

```
                    ┌──────────────┐
   photo ──AI──►    │ SneakerMint  │◄── mintAuthorized ── VeSneakerStore
                    │  (ERC-721)   │
                    └──────┬───────┘
                           │ traitsOf(rarity, tier, kind)
        ┌──────────────────┼──────────────────┬─────────────────┐
        ▼                  ▼                  ▼                 ▼
  ┌───────────┐    ┌─────────────┐    ┌─────────────┐   ┌──────────────┐
  │SneakerGame│    │SneakerStake │    │  Appraiser  │   │ SneakerVault │
  │ veRUNE    │◄──►│  POL vault  │◄──►│  valuation  │   │  perks       │
  └─────┬─────┘    └──────┬──────┘    └─────────────┘   └──────────────┘
        │  spendEnergy     │ APY boost
        ▼                  ▲
  ┌──────────────┐   ┌─────┴────────┐
  │SneakerWorkshop│──►│ SneakerTabArena│  daily tap → time-boxed boost
  │ 7 slots       │   └────────────────┘
  │ consumables   │
  └──────┬────────┘
         │ ISneakerBoosts (skillBonusBps, earnBonusBps, stakingBoostBps…)
         ▼
  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
  │ SneakerMods  │──►│  ModStore    │   │ Marketplace  │
  │  (ERC-721)   │   │  primary     │   │ 2.5% fee     │
  └──────────────┘   └──────────────┘   └──────┬───────┘
                                               │ withdrawFeesToCollector()
                                               ▼
                                        ┌──────────────┐
                                        │ FeeSplitter  │──► recipients
                                        └──────────────┘
```

**`ISneakerBoosts` is the shared seam.** The workshop is the single source of truth
for what a sneaker's equipped mods do; the game, staking, appraiser and
marketplace all read it through one interface. Adding a new mod effect means
touching the workshop, not four contracts.

**The custody invariant that matters:** a staked sneaker earns APY but cannot be
listed; a listed sneaker cannot be staked. A sneaker either produces yield or is
for sale, never both.

---

## 5. The economy

### Two layers

| Layer | Type | Convertible |
| --- | --- | --- |
| **REN** | ERC-20, 100M hard cap, 18 decimals | Tradable |
| **veRUNE** | Virtual points in `SneakerGame` state — deliberately **not** a token | Redeemable at 100:1 once enabled |

veRUNE is not tokenized on purpose: no unregulated liquid asset while the product
is in beta, near-zero gas for accrual, and issuance can be tuned before real value
is at stake.

### REN allocation (100M)

| Allocation | % | Purpose |
| --- | --- | --- |
| Staking reward reserve | 35% | Funds the POL APY |
| Play-to-earn (redemption pool) | 20% | Backs veRUNE → REN |
| Marketplace & treasury | 15% | Liquidity, campaigns |
| Team & advisors | 10% | 12-month cliff + 24-month linear |
| Liquidity | 10% | DEX/CEX pairs, LP locked |
| Community & airdrops | 10% | Quests, referrals |

### veRUNE accrual

Each sneaker has three live stats:

- **Power** — the mining rate: `tierBase × (50% + effectiveRarity%)`. Rarity 50 ≈
  1.0×, rarity 100 ≈ 1.5×. Condition scales effective rarity.
- **Health** — decays 1/day of real time plus 1 per activation. At 0 the sneaker
  stops earning and cannot activate.
- **Energy** — capacity `2 + effectiveRarity/20`; refilled on activation; spent by
  consumable abilities.

| Tier | veRUNE/day at 1× streak, before power |
| --- | --- |
| Common | 100 |
| Rare | 200 |
| Epic | 400 |
| Mythic | 800 |

Activate once per 24h. Activating within 48h of the last one increments a streak
(+1% per day, capped at +50%). Missing more than 48h resets it to 1. Repair costs
50 veRUNE and restores full health — the point sink that recycles value.

### veSneaker pricing

Three family designs — **Astra** (Mythic, $150), **Sol** (Rare, $62), **Luna**
(Epic, $97) — 1,000 supply each. Prices are **USD targets** converted to POL by a
Chainlink feed, so a POL move is a sync, not a redeploy.

> **Known tension.** The primary price is far above the `SneakerAppraiser`
> valuation, so a veSneaker does **not** resell at cost. The primary price is an
> entry ticket to the staking and game loops; the yield is what the buyer is paying
> for. If secondary liquidity is a goal, raise `appraiserPremiumBps` or lower the
> USD targets.

### The mod economy

Seven slots, each a different lever:

| Slot | Effect |
| --- | --- |
| Sole | −wear per activation |
| Upper | +earn rate |
| Lining | −repair cost |
| Skin | +appraisal |
| Core | auto-activation (earns without the daily tap) |
| Boost | +staking APY |
| Skill | passive +earn rate from level-gated skill NFTs |

**Consumables burn on use.** `useAbility` destroys the NFT: repair kits, surges
(skip the cooldown), boost capsules, service kits, Overdrive, Stim packs. That
burn is the demand engine — every repair is a purchase.

### The 365-day condition cycle

Condition decays linearly from 100% to 50% over a season and scales rarity, so
earn rate, appraisal and tab power all fall together. Repair and service kits reset
it. **There is no forge** — an earlier concept that was removed entirely.

### Staking

Native POL, no wrapping. Base 2.80%, tier boosts `[50, 80, 150, 180]` bps
(+0.5% to +1.8%), workshop Boost-slot mods add more, hard cap 8%. 30-day minimum
lock on withdrawals. The admin funds a **separate POL reward reserve**; claims can
never consume `totalStakedPrincipal`.

### Player progression

Ten levels aggregated from live protocol state: sneakers ×100, mods ×40, lifetime
veRUNE ÷1000 ×10, marketplace trades ×60, workshop actions ×30, staked POL ×20.
Thresholds `0 → 21,000`. **Levels are live standing** — selling NFTs or unstaking
lowers them, which keeps skill gates honest.

### Tab Arena

Once per 24h, a player with a **staked** veSneaker and **non-zero POL principal**
opens a session, taps through a point ladder, and receives a time-boxed APY boost
written into the staking contract. The server signs the score; the contract
recomputes the multiplier and **clamps** it, so a leaked signer cannot mint
unbounded boost.

---

## 6. Revenue model

| Source | Lands in | Status |
| --- | --- | --- |
| veSneaker primary sales | `VeSneakerStore.treasury` | Live, zero sales |
| Mod primary sales | `ModStore.treasury` | Live, zero sales |
| Marketplace 2.5% fee | `FeeSplitter` → recipients | Live, zero volume |
| AI generation, $0.75 USDC | x402 `payTo` | Verified end-to-end on mainnet |

**Marketplace revenue takes two hops and the first is privileged.** A sale accrues
`accumulatedFees`; an **admin** call to `withdrawFeesToCollector()` moves it to the
FeeSplitter; then `distribute()` — callable by anyone — pays the recipients. Skip
step one and the money sits in the marketplace indefinitely with no error anywhere.
`scripts/collect-fees.ts` is the keeper that closes it.

---

## 7. Technology

**Contracts.** Solidity 0.8.36, OpenZeppelin 5.6, Hardhat 3, forge-std for the
Solidity tests.

**Frontend.** Next.js 16.3.8 (App Router, Turbopack), React 19.3, Tailwind 4.3,
viem 2.55. Wallet layer is a **custom EIP-1193 wrapper** — not wagmi/RainbowKit —
with three providers behind one interface: MetaMask (EIP-6963), OKX (universal
provider), and a thirdweb in-app wallet.

**AI.** `@google/genai` 2.17 — a two-pass Gemini pipeline: a vision pass grades the
source photo and assigns tier/rarity, a render pass produces the pixel art. Tier is
**assigned, never chosen**; a picker would make it meaningless.

**Payments.** `@x402/*` 2.28 for USDC pay-per-call. `0xtrails` 0.18 for
cross-chain funding (card/Apple Pay/any token → POL).

**Data.** The Graph Studio, project `nuxgraph` 0.1.0, behind a server-only proxy.

**Infra.** Upstash Redis for rate limiting (in-memory fallback), Chainlink for
POL/USD, PolygonScan for verification.

---

## 8. What is genuinely distinctive

1. **Wear as the retention mechanic.** Sneakers decay whether you play or not. That
   single choice creates the mod economy, the repair sink, the seasonal cycle and
   the daily habit — instead of bolting a shop onto a static JPEG.
2. **Assigned rarity.** The AI decides tier and rarity; the buyer cannot pick. It
   removes the "everyone buys Mythic" failure mode and makes the pull meaningful.
3. **veRUNE is not a token.** No unregulated liquid asset, no gas per point, and
   issuance stays tunable until there is real demand.
4. **USD-anchored prices with an on-chain oracle.** The store holds a USD target
   and derives the POL price from Chainlink. `buy` deliberately still reads the
   *stored* price, so the quote a buyer sees and the transaction they sign cannot
   diverge.
5. **A gas-sponsorship verifier.** Unconstrained `sponsorGas` is an unbounded,
   unauthenticated gas budget — the in-app wallet is created by anyone with an email
   address. `/api/verify-sponsorship` restricts it to Airen's own contracts.
6. **An x402 discovery manifest derived from the payment config.** `/.well-known/x402`
   is built from `x402RouteConfig()`, the same object the wrapper charges with, so
   it cannot quote a price the endpoint does not charge.
7. **A public treasury view that shows what is *owed*, not just what is held.**
   `accumulatedFees` and `pendingFees` sit next to the balance, because a 0 POL
   balance can mean money is waiting, not missing.

---

## 9. The agentic surface

- **x402 on `/api/generate-sneaker`** — verified end to end on mainnet: a real
  0.75 USDC EIP-3009 payment was signed, settled by the facilitator, and the
  generation returned 200.
- **`/.well-known/x402`** — price, `payTo`, network, and the input/output shape, so
  an agent can build a valid request without reading the app.
- **ERC-8004 (Trustless Agents) — not implemented.** Three blockers, all real: the
  standard is in **Draft**, the reference registries are on Ethereum/Base/BNB/
  Avalanche/Mantle and **not Polygon**, and the `tokenURI` must point at an
  agent card on a public URL. Nothing was built speculatively.
- **Polygon Agentic Services catalog — not listed.** The catalog is self-serve and
  supports a `catalogOnly` mode pointing at your own URL, but an endpoint on
  `localhost` cannot be listed.

---

## 10. Operations

| Script | What it does | Privilege |
| --- | --- | --- |
| `scripts/deploy.ts` | Full deploy + wiring + verification; `VERIFY_ONLY` mode re-verifies without redeploying | admin |
| `scripts/treasury-audit.ts` | Prints every payout address **read from the contracts** | none |
| `scripts/set-treasury.ts` | Repoints every payout address; idempotent | admin |
| `scripts/collect-fees.ts` | The two-hop fee keeper | admin |
| `scripts/treasury-yield.ts` | Reports idle POL and what it would earn | none |
| `scripts/mint-veSneakers.ts` | Registers the three designs, maps USD targets **by tier** | admin |
| `scripts/seed-skills.ts` | Seeds the level-gated skill catalog | admin |
| `scripts/fund-staking.ts` | Funds the POL reward reserve | admin |
| `scripts/x402-smoke-test.mjs` | Full paid x402 cycle against a running server | — |
| `scripts/generate-icons.mjs` | Regenerates PWA icons from the pixel chevron | — |

**Deploy gotcha, learned the hard way:** the deploy script fills unset treasury
variables with the admin address. A deployment that "never configured a treasury"
usually did, silently. Always read the wiring from the contracts, never from `.env`.

---

## 11. Environment shape

~120 variables. The ones an agent must not confuse:

- **`NEXT_PUBLIC_*`** — published to the browser. Only addresses and network
  config belong here.
- **Server-only** — `ALCHEMY_API_KEY`, `GEMINI_API_KEY`, `ARENA_SIGNER_PRIVATE_KEY`,
  `UNISWAP_API_KEY`, `PINATA_JWT`, `NEXT_SECRET_KEY_THIRDWEB`, `THE_GRAPH_*_KEY`.
- **`X402_PAY_TO`** — empty disables x402 entirely; the route then serves free,
  rate-limited generations.
- **`POL_USD_FEED_ADDRESS`** — empty disables oracle pricing; designs keep their
  stored POL price.

---

## 12. Known constraints — read this before proposing work

| Constraint | Detail |
| --- | --- |
| **Unaudited** | No independent contract or economic review. 394 + 136 tests are not an audit. |
| **One key administers everything** | All 15 contracts share one admin EOA. It can repoint the treasury, change fees, and mint. A multisig is the highest-value hardening left. |
| **Treasury is a plain EOA** | One key. A Safe was considered and deliberately deferred; the contracts already accept a contract-address treasury (every payout uses `.call{value:}`, and there is no `.transfer()` anywhere), so switching later is one idempotent script run. |
| **No public domain** | Everything runs on `localhost`. This blocks: veSneaker NFT metadata (minted tokens would point at a laptop, permanently), the Polygon catalog listing, and the ERC-8004 agent card. |
| **Subgraph has no address-indexed entities** | The activity feed returns empty for every address. Balances and pending figures are read directly from the chain and are unaffected. |
| **No CI** | `lighthouserc.json` carries a mobile budget but there is no runner. |
| **`fetchPriority` is inert** | Verified against a production build; removed rather than left as dead code. |
| **Zero revenue** | Nothing has been sold. The flow is verified; the demand is not. |
| **npm audit: 39 findings, 14 high, none critical** | Mostly Hardhat/Mocha tooling and the `0xtrails → @meshconnect → axios` chain. `thirdweb` added 163 `@solana*` packages via an optional peer, reachable only through a stubbed import — never bundled. |

---

## 13. Roadmap

**Shipped (v2.0 / v2.1):** x402 payments · Chainlink USD pricing · Trails funding ·
thirdweb in-app wallet · gas-sponsorship verifier · transaction batching ·
treasury wiring, scripts and public view · x402 discovery manifest · mobile v2.0
(error/loading/404 boundaries, View Transitions, multicall everywhere, IndexedDB
mint draft, haptics, share, install prompt).

**Blocked, with reasons:**

| Item | Blocker |
| --- | --- |
| veSneaker design registration with real metadata | Needs a public domain |
| Polygon Agentic Services listing | Needs a public domain |
| ERC-8004 agent identity | Draft standard + no Polygon registry + needs a domain |
| Session keys for the daily loop | Needs an Engine server wallet and a hot key over user wallets — batching was chosen instead |
| Server Wallet for the arena signer | The contract verifies with `ecrecover`; the server wallet's signature does not recover to its address. Needs ERC-1271 verification + an arena redeploy |
| Treasury yield | The treasury is at 0. Nothing to put to work. `sPOL` is on Ethereum, so it would also need a bridge |

**Open product questions:** raise `appraiserPremiumBps` or lower USD targets for
secondary liquidity · whether to pay FeeSplitter recipients in a yield-bearing
asset · whether `withdrawFeesToCollector` should be permissionless (it is safe to
open, and it removes the admin dependency from the keeper).

---

## 14. Glossary

| Term | Meaning |
| --- | --- |
| **veSneaker** | A playable ERC-721 sneaker. Astra / Sol / Luna families. |
| **Collectible** | An AI-minted NFT. Marketplace-only; **excluded** from staking, the arena, the game and the workshop. |
| **REN** | The ERC-20 reward token, 100M cap. |
| **veRUNE** | Virtual points earned by playing. Not a token. Redeemable 100:1 for REN. |
| **Condition** | 100% → 50% over a 365-day season; scales rarity, so earn/appraisal/power fall together. |
| **Durability / Health** | The decay clock. At 0 the sneaker stops earning. |
| **Power** | The veRUNE mining multiplier. |
| **Energy** | Charges for consumable abilities. |
| **Tab Arena** | The daily tap challenge that grants a time-boxed staking APY boost. |

---

## 15. Reading order for an agent

1. `docs/README.md` — the documentation index.
2. `docs/contract-architecture-plan.md` — per-contract responsibilities *(stale on `ModRental`)*.
3. `docs/veRune-tokenomics.md` — the full economic design.
4. `docs/polygon-staking-model.md` — the APY formula and custody invariants.
5. `docs/app-routes.md` — every route, hook and flow.
6. `docs/treasury.md` — the money paths, with a diagram.
7. `docs/mobile-experience.md` — the mobile surface and what shipped in v2.0.
8. `docs/Plan_Update_v2.0.md` — what the protocol update did and what blocked.
9. `docs/thirdweb-gas-sponsorship.md` — the paymaster policy.
10. `.devin/skills/*/SKILL.md` — nine task-scoped skills with the traps written down.

---

## 16. If you are picking this up

**The three things most likely to trip you up:**

1. **A Solidity function returning a struct declares one `tuple` output, not flat
   members.** With dynamic members (`string`/`bytes`) the flat form decodes every
   field one slot late. This broke `/collection` and `/badges` on mainnet with a
   1401 POL price landing in a `uint16`.
2. **The CSP is enforced.** An origin missing from `buildCsp()` fails in the
   browser, usually as a wallet that will not connect with no visible error. Adding
   a wallet means adding its origins to `next.config.ts` in the same change.
3. **The treasury in `.env` and the treasury on-chain can disagree.** The deploy
   script defaults to the admin address. `scripts/treasury-audit.ts` is the only
   source of truth.

**Before proposing a feature, ask what it costs the treasury.** There is no revenue
yet; every added on-chain write is a real POL cost paid by the owner.
