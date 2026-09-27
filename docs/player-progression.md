# Player progression — XP, levels, and skill NFTs

`PlayerProgress.sol` turns verifiable on-chain activity into a deterministic XP
score and a 10-tier player level. Levels gate **skill NFTs**: free claims on
`SneakerMods` and purchasable copies on `ModStore`/`VeSneakerStore`. It also
hosts the public half of the player profile (username + NFT avatar pointer).

## XP sources

XP is **derived from live state** — no snapshots, no event indexing. Selling
NFTs or withdrawing POL lowers a player's level; gates always read
`levelOf(user)` at the moment of claim/purchase, so level cannot be farmed by
borrowed assets.

| Signal | Source of truth | XP |
| --- | --- | --- |
| veSneakers held | `SneakerMint.balanceOf` | 100 each |
| Mods/badges held | `SneakerMods.balanceOf` | 40 each |
| Lifetime veRUNE claimed | `SneakerGame.lifetimeEarned` | 10 per 1,000 |
| Completed trades | `SneakerMarketplace.tradesCount` | 60 each (buyer and seller) |
| Workshop actions | `SneakerWorkshop.actionsCount` | 30 each (equip/unequip/forge/ability/repair kit) |
| POL staked | `SneakerStaking.polPositions.principal` | 20 per POL |

The counters are incremented by each contract at the point of action —
`lifetimeEarned` in `claimPoints`, `tradesCount` in `buy`/`acceptOffer`/
`settleAuction` (both sides), `actionsCount` in every workshop action.

## Level curve

Default thresholds (`PROGRESS_LEVEL_THRESHOLDS`, index 0 = level 1):

| Level | XP | Level | XP |
| --- | --- | --- | --- |
| 1 | 0 | 6 | 4,500 |
| 2 | 300 | 7 | 7,000 |
| 3 | 800 | 8 | 10,500 |
| 4 | 1,600 | 9 | 15,000 |
| 5 | 2,800 | 10 | 21,000 |

`setLevelThresholds` (admin) replaces the table — must start at 0 and be
strictly increasing. `MAX_LEVEL` is 10.

## Reads

- `xpOf(user)` / `xpBreakdown(user)` — total and per-signal XP.
- `levelOf(user)` — `uint8` 1..10.
- `progressOf(user)` — `(xp, level, currentLevelXp, nextLevelXp)`; `nextLevelXp`
  is 0 at the cap. Powers the profile progress bar.
- `thresholds()` — the full table.

## Public identity (hybrid profile)

- `setUsername(username)` — 3–20 bytes, editable. Public on-chain identity.
- `setNftAvatar(collection, tokenId)` — avatar pointer to an NFT the caller
  owns (`ownerOf` verified); zero address clears it.
- Uploaded avatar images stay **client-side** (`localStorage` under
  `airen:profile:<address>`) — only verifiable references go on-chain. See
  `src/lib/profile.ts` and the `/profile` route in `app-routes.md`.

## Skill NFTs

Skills are regular `SneakerMods` NFTs with two delivery paths:

1. **Free claim** — a `SneakerMods` achievement with `ReqKind.PlayerLevel` and
   `threshold = requiredLevel`. `claim()` checks `progress.levelOf` on-chain;
   one claim per wallet per achievement. Rendered in the "Level skills" section
   of `/badges`.
2. **Extra copies** — `ModStore`/`VeSneakerStore` designs with `requiredLevel`
   sell additional copies for POL; `buy` reverts `"*: level required"` below the
   gate. `requiredLevel = 0` disables the gate. Admin setters:
   `setDesignRequiredLevel`, `setProgress`.

Skill effects come in two forms:

- **Passive** — `slot = SLOT_SKILL (6)`, non-consumable. Equipped in the
  workshop's seventh slot; `effectBps` feeds `skillBonusBps`, folded into
  `earnBonusBps` (higher veRUNE earn rate).
- **Consumable** — burned via `useAbility`: `aux 4` Overdrive (+`effectBps` earn
  for 48h, 3⚡), `aux 5` Stim pack (instant energy refill, free, reverts on a
  dead sneaker), `aux 6` Lucky repair (full health + `effectBps` boost 24h, 1⚡).

## Genesis skill catalog

`scripts/seed-skills.ts` registers both paths idempotently:

```bash
SNEAKER_MODS_ADDRESS=0x... MOD_STORE_ADDRESS=0x... \
  npx hardhat run scripts/seed-skills.ts --network amoy
```

| Skill | Lv | Type | Effect | Copy price |
| --- | --- | --- | --- | --- |
| Focus Chip | 2 | Passive | +2% earn | 8 POL |
| Overdrive Cell | 3 | Consumable | +15% earn ×48h | 5 POL |
| Stim Pack | 4 | Consumable | Energy refill | 3 POL |
| Lucky Repair | 5 | Consumable | Full repair +5%×24h | 6 POL |
| Momentum Core | 6 | Passive | +4% earn | 15 POL |
| Apex Instinct | 8 | Passive | +8% earn | 40 POL |

Adjust the table in `seed-skills.ts` before running — the script skips levels
that already have a `PlayerLevel` achievement and store designs matched by name.

## Frontend surfaces

| Surface | What shows |
| --- | --- |
| `/profile` | Level card (`progressOf` when configured, local estimate otherwise), skills owned, identity editor |
| `/badges` | "Level skills" section — free claims with level state (LOCKED/READY/CLAIMED) |
| `/collection` | `LV X+` chips + disabled buy on `requiredLevel` designs (both stores) |
| `/workshop` | Seventh Skill slot + "Skill bonus" row in effective stats |
| `Navbar` | `ProfileButton` avatar → `/profile` |

Hook: `usePlayerProgress` (`progressOf`, `xpBreakdown`, `usernames`,
`avatarCollection`/`avatarTokenId`); `configured` is false until
`NEXT_PUBLIC_PLAYER_PROGRESS_ADDRESS` is set — callers fall back to the local
level estimate in `src/lib/profile.ts`.

## Deployment

`DEPLOY_TARGET=PlayerProgress` (or `all`) deploys it last — it needs
`SneakerMint`, `SneakerMods`, `SneakerGame`, `SneakerMarketplace`,
`SneakerWorkshop`, and `SneakerStaking` addresses. Wiring adds
`mods.setProgress`, `modStore.setProgress`, and `veStore.setProgress`.
Constructor admin: `PROGRESS_ADMIN_ADDRESS` (defaults to deployer admin).
