---
name: polygon-testing
---

# Airen Polygon Contract Testing

Use this skill whenever modifying contracts, deployment configuration, ABIs, wallet flows, minting, native POL staking, REN rewards, NFT boosts, the mod upgrade economy, or subgraph activity.

## Test locations

- Solidity tests: `test/*.t.sol` using Hardhat 3's built-in Solidity test runner and `condition-std`.
- TypeScript integration tests: `test/*.ts` using `@nomicfoundation/hardhat-mocha` and `@nomicfoundation/hardhat-viem`.
- `test/sneaker-artwork.ts` covers the Astra/Sol/Luna catalog order, tokenURI family resolution, legacy `pixel://` mapping, and preservation of embedded user artwork.
- Do not place new Solidity tests in the old `tests/` directory; Hardhat 3 discovers Solidity tests from `test/` by default.

## Hardhat 3 test patterns

Use ESM imports and a network connection:

```ts
import hre from "hardhat";
const connection = await hre.network.create();
const { viem } = connection;
const [admin, user] = await viem.getWalletClients();
const contract = await viem.deployContract("SneakerMint", constructorArgs);
```

Use `viem.deployContract`, not Hardhat 2 `getContractFactory`. Use `connection.viem.getTestClient()` for time manipulation/mining and bigint values for POL/RUNE amounts and timestamps.

## Required contract test matrix

### `SneakerMint`

- Roles, nonzero admin, authorized mint, public mint toggle.
- Duplicate/zero proof hash, rarity `0..100`, tier `< 4` (Common, Rare, Epic, Mythic).
- Sequential IDs, traits, pause/unpause, fuzz bounds.

### `RENToken`

- ERC-20 name, symbol `REN`, decimals, roles, 100M cap.
- Authorized/unauthorized mint, zero recipient, cap boundary.
- Burn, insufficient balance, paused minting and transfers.

### `SneakerStaking`

- Constructor addresses and APY bounds.
- `depositPOL` principal accounting, zero deposit, and total principal.
- `fundPOLRewards`, reserve solvency, empty reserve, claim rounding, and funded POL claims.
- Minimum lock, partial/full `withdrawPOL`, paused-state fund safety, and reentrancy.
- Ownership, approval, duplicate NFT stake, on-chain trait reads, rarity-based APY boost (Common +0.5%, Rare +0.8%, Epic +1.5%, Mythic +1.8%), and max cap.
- Exact NFT return, `stakedTokenIds` add/remove behavior, emergency recovery.
- Legacy RUNE accrual/claims, pending rewards, admin parameter changes, unauthorized calls.

### `SneakerAppraiser`

- Constructor addresses, zero admin/NFT/multiplier reverts.
- `appraise(tokenId)` returns correct value, rarity, and tier for each NFT tier.
- `appraiseRaw(rarity, tier)` matches the formula for arbitrary inputs.
- Global multiplier applies correctly (1x, 1.5x, etc.).
- Admin `updateParams` works and reverts for non-admin and zero multiplier.
- `tierLabel`, `tierBoostBps`, and `tierValueList` view functions return expected values.
- Fuzz: rarity 0..100, tier 0..3.

### `SneakerMarketplace` (multi-collection)

- Constructor addresses, fee cap (max 20%), zero premium reverts, `allowedCollections` gating (`setCollectionAllowed`, disallowed collection reverts).
- All primitives take `collection` first: `list(collection, tokenId, price)`, `createAuction(collection, ...)`, `makeOffer(collection, tokenId, duration)`; locks keyed by `(collection, tokenId)` via `tokenSaleKind`.
- Listings: escrow NFT, buy splits payment (fee to `accumulatedFees`), cancel returns NFT, wrong payment reverts, seller cannot buy. Repeat for `SneakerMods` tokens.
- Staked NFTs cannot be listed or auctioned (`stakedOwner` check); sneakers with equipped workshop mods cannot be listed (`workshop.hasEquippedMods`) — test the unequip-then-list path.
- Auctions: create escrows NFT, bid refunds previous bidder, 1% min increment, settle pays seller minus fee, no-bid settle returns NFT, settle reverts while running, seller cannot bid, bid after end reverts.
- Offers: make escrows POL (NFT stays with owner), accept pays seller minus fee and transfers NFT, cancel refunds bidder, own-token/listed-token reverts, expiry reverts.
- Views: `suggestedPrice` = appraiser × premium; `valueRecommendations` returns 4 tips.
- Admin: `updateParams`, `withdrawFees`, non-admin reverts.

### `SneakerGame` (power / health / energy)

- Constructor addresses, zero durability/rate reverts, redemption disabled by default.
- Activation: first activation initializes durability + `lastDecayAt` + refills energy to max, 24h cooldown, streak builds within 48h, resets after break, worn-out reverts, not-owner reverts.
- Power: `powerOf` = `5000 + effectiveRarity × 100` bps; verify rarity 50 ≈ 1.0x, rarity 90 ≈ 1.4x; `earnRatePerSecond` = tier base × power × streak × workshop earn bonus.
- Health: decays 1 unit per `HEALTH_DECAY_PERIOD` (1 day) via `lastDecayAt`, plus wear per activation; at 0 the sneaker is dead — accrual caps at the death timestamp, `canActivate` false, `earnRatePerSecond` 0; `repair` resets the decay clock.
- Energy: `maxEnergyOf` = `2 + effectiveRarity/20`; manual `activate` refills, `activateFromWorkshop` (surge) does NOT refill (free-energy exploit check); `spendEnergy` reverts for non-workshop callers and on insufficient energy.
- Accrual: points accrue per second while active (tier base × power × streak), stop after the 24h window, stop at 0 health, already-earned points remain claimable.
- Claim: adds to `veRuneBalance`, clears pending, not-owner reverts.
- Repair: costs veRUNE (Lining discount via boosts), restores health, insufficient-balance reverts, never-activated sneaker reverts.
- Redemption: disabled by default, converts points to REN at `redemptionRate` (integer division), insufficient balance/zero points reverts, requires funded pool.
- `sneakers()` tuple has 8 fields — destructure `lastDecayAt` and `energy` too.
- Views: `streakMultiplierBps` caps at +50%, `canActivate`, `earnRatePerSecond`, `pendingPoints`, `powerOf`, `healthOf`, `energyOf`, `maxEnergyOf`.
- Note: `increaseTime` offsets accumulate across Mocha tests — compute deltas from a fresh block timestamp read. Old tests assuming 10 activations before wear-out now fail after ~5 (1 wear + ~1 day decay per cycle).

### `VeSneakerStore`

- Constructor zero admin/NFT/treasury reverts.
- `addDesign` stores name/uri/rarity/tier/price/supply; reverts on non-admin, invalid tier, zero price.
- `buy` mints on demand, transfers the exact price to the treasury, writes design rarity/tier into the NFT traits, and uses a unique proof per copy.
- `buyBatch` (2–20) mints multiple copies and charges `price × quantity`; reverts on quantity 1 or > 20.
- Wrong payment, inactive design, unknown design, and paused states revert.
- Supply cap enforced; `updateDesign` reverts when the new cap is below `minted`.
- `reserveMint` counts against supply and reverts for non-admin.
- Views: `quote`, `isAvailable`, `priceOf`, `remaining`, `designCount`, `designs`.
- `receive()` reverts — test stranded-funds recovery with `setBalance`, not a plain transfer.
- Fuzz: batch quantity bounds.

### `SneakerMods`

- `mintAuthorized` takes a `ModTraits` struct (`slot`, `rarity`, `tier`, `effectBps`, `consumable`, `aux`, `proofHash`) — never positional trait args.
- `claim` achievement path: on-chain requirements (streak, lifetimePoints, balance, staked POL, `PlayerLevel` via `progress.levelOf`), one claim per wallet per achievement, requirement-not-met reverts.
- `burnAuthorized` reverts for non-workshop callers; `equippedTo` blocks burn of escrowed mods.
- `setWorkshop` admin wiring.

### `SneakerWorkshop`

- `equip`: one mod per slot, escrow custody (`equippedTo`), owner-of-sneaker check (or renter via `rentalSource`), consumable mods rejected, approval required.
- `unequip`: returns the mod, clears the slot bonus; staked/listed sneaker edge cases.
- Bonus views per slot: Sole −wear, Upper +earn (`earnBonusBps` + `tempBoostBps` while unexpired), Lining −repair cost, Skin +appraisal, Core auto-activation, Boost +staking APY, Skill passive earn (`skillBonusBps`, folded into `earnBonusBps`).
- `useAbility` per `aux` kind: repair kit → `repairFromWorkshop` (0 energy), surge → `activateFromWorkshop` bypassing cooldown without energy refill (2⚡), boost capsule → `tempBoostBps`/`boostExpiresAt` 24h (1⚡), condition stone → free condition level (2⚡), Overdrive → 48h boost (3⚡), Stim pack → `refillEnergyFromWorkshop` (0⚡, reverts on dead sneaker), Lucky repair → full health + 24h boost (1⚡). Every use burns the mod; insufficient energy reverts.
- `condition`: burns `conditionCostPoints` veRUNE via `game.spendPoints`, increments `conditionLevel`, raises effective rarity.
- `hasEquippedMods` gating used by the marketplace.
- `actionsCount` increments on each successful action — feeds `PlayerProgress` XP.

### `SneakerSwap`

- `create` escrows the offered NFT (+optional POL), `accept` executes atomically both directions, `cancel` returns escrow.
- Expired swaps revert; only allowed collections; counterparty NFT must be owned/approved by the acceptor.
- Works across collections (sneaker↔mod, mod↔mod).


- `list` escrows the mod (3 args — price/day, max duration; consumables rejected), `cancelListing` returns it, `rent` pays upfront POL (fee to `feeCollector`), `extend` tops up days.
- `equipRented(rentalId, sneakerId)` equips through `workshop.rentalSource`; `releaseEarly` (renter) and `returnExpired` (anyone, after `rentedUntil`) end the rental, unequip, pay the owner, and return the mod.
- `rentals()` getter returns a positional tuple — index access, not named fields.

### `ModStore`

- `addDesign` takes a params struct (stack-too-deep pattern) — name/uri/slot/rarity/tier/effectBps/consumable/aux/price/supply/requiredLevel.
- `buy` mints via `SneakerMods.mintAuthorized` (store needs `MINTER_ROLE`), charges `msg.value == price`, sends proceeds to treasury.
- `requiredLevel` designs revert `"ModStore: level required"` when `progress.levelOf(buyer)` is below the gate (or `progress` unset) — test with a mock/real PlayerProgress.
- Consumable designs mint usable ability mods; supply caps and inactive designs revert.

### `PlayerProgress`

- `xpOf`/`xpBreakdown` per signal: sneaker balance, mod balance, `lifetimeEarned` (only on `claimPoints`), `tradesCount` (both sides of a completed sale), `actionsCount`, staked POL principal.
- `levelOf`/`progressOf` against the threshold table — boundary values (xp == threshold → level up) and `nextLevelXp == 0` at max.
- Live-state behavior: selling NFTs / unstaking POL lowers the level.
- `setUsername` 3–20 byte bounds; `setNftAvatar` ownership check + zero-address clear.
- `setLevelThresholds` admin-only, must start at 0, strictly increasing.
- `PlayerLevel` achievement claim gates on `levelOf`; slot-6 skill equip raises `earnRatePerSecond`.

### `FeeSplitter`

- `setRecipients` weights sum exactly to 10_000; rejects zero addresses, zero weights, empty lists, more than 16 recipients, and non-admin calls.
- `distribute()` pro-rata exact: 1 ETH across 40/30/20/10 pays 0.4/0.3/0.2/0.1; dust stays for the next round.
- `shareOf` last recipient absorbs division dust; `distribute` with zero balance reverts; pause blocks distribution.
- `receive()` accumulates balance; `pendingFees` reflects the contract POL balance; `recipientAt(index)` reads a single recipient.
- Marketplace/rental: `withdrawFeesToCollector` pays the configured `feeCollector` and leaves user escrow untouched (`test_WithdrawFeesToCollector`).

### `SneakerVault`

- `setPerk` validates kind (0=discount, 1=access), discount range (1–5000 bps), tier ≤ 3, sequential ids, and the `MAX_PERKS` cap; admin-only.
- `discountBps`/`bestDiscountBps` per gate: tier via `traitsOf`, condition via `workshop.conditionLevel`, POL via `polPositions`, level via `levelOf`, mods via `balanceOf` — gates are additive.
- Inactive perk or failed gate returns 0 (full price); `bestDiscountBps` picks the highest eligible discount; `perks(id)` returns a flat 8-field tuple.
- `claimPerk` (access kind) succeeds once per wallet, reverts on inactive/discount-kind/requirements-not-met/already-claimed.
- Store integration: `quote` applies the buyer's best discount; `buy` with the discounted value succeeds, full value reverts; zero vault address means full price.
- Perk gates: `setDesignRequiredPerk` is admin-only and rejects unknown perks; a gated design reverts `*: perk required` for ineligible buyers in both `buy`/`buyBatch` and `quote`, and unlocks once the vault marks the wallet eligible (covered by `MockVault` in `test/VeSneakerStore.t.sol` and `test/ModStore.t.sol`).

## Subgraph/API checks

- Configure a real query endpoint/API key server-side; never use the Graph deploy key in frontend code.
- Test `GET /api/subgraph?address=0x...` with a valid and invalid address.
- Verify the route handles missing credentials, schema introspection errors, stale indexing, and empty activity safely.
- Compare indexed `POLDeposited`, `POLWithdrawn`, `POLRewardsClaimed`, `Staked`, and `Unstaked` events against RPC receipts.

## Commands

```bash
npx hardhat compile
npx hardhat test solidity
npx hardhat test mocha
npx hardhat test
npm run lint
npm run typecheck
npm run build
```

Before Amoy deployment, all local tests must pass. Before mainnet, add adversarial/invariant coverage, verify deterministic artifacts, use multisig administration, and obtain independent contract/economic reviews.


## Tab arena and condition coverage

`test/SneakerTabArena.t.sol` (34 tests) covers the full arena surface:

- **Gate:** no POL, no locked runner, a runner locked by someone else, and the
  open case; `gateStatus` reporting each missing piece.
- **Power:** derived from rarity and condition, raised by equipped mods, and
  dragged down by a full season of wear.
- **Sessions:** start records runner/multiplier/expiry, a second concurrent
  session reverts, `abandonSession` reopens the gate.
- **Signatures:** wrong signer, expired deadline, tampered score, and a replayed
  signature are all rejected.
- **Boost:** granted from the cleared level, capped by the runner's ceiling,
  raises `effectiveApyBps`, lapses after 24h, and is absorbed by the 8% cap for a
  wallet already near it.
- **Clamping:** an inflated signed score is clamped to `multiplier * 600`.
- **Recompute:** equipping mods mid-session changes the multiplier because the
  contract recomputes it at completion.
- **Cooldown:** one session per day, reopened after 24h.
- **Admin:** pause, `setSigner`, `setMaxTabBoostBps` bounds, `TAB_ARENA_ROLE`.

`test/SneakerWorkshop.t.sol` covers condition: pristine until first use, linear
decay across the season, clamping at the floor, repair/service kits restoring it,
effective rarity scaling, `secondsUntilFullyWorn`, and `updateCareParams`.

**Trap:** `SneakerMint.traitsOf` returns a 3-field struct (`rarity`, `tier`,
`proofHash`). Declaring four return values in a minimal interface compiles but
reverts at call time with "Function returned an unexpected amount of data".

**Trap:** `lastCompletedAt == 0` must not be read as "completed at the epoch" —
that gates every wallet until timestamp 86400. The arena guards this in
`_cooldownElapsed`.
