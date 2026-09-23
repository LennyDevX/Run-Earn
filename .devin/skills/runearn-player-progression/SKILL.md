---
name: runearn-player-progression
description: Build and extend Run-Earn's player progression — PlayerProgress XP/levels, the hybrid on-chain + local profile, level-gated skill NFTs (claims, store copies, skill slot, consumable abilities), and the /profile and /badges surfaces.
---

# Run-Earn Player Progression

Use this skill for anything involving player levels, XP, the `/profile` route,
skill NFTs, or level gating: `PlayerProgress.sol`, `src/lib/profile.ts`,
`useProfile`, `usePlayerProgress`, `ProfileDashboard`, `BadgesDashboard`,
level-gated `ModStore`/`VeSneakerStore` designs, and `scripts/seed-skills.ts`.

## Architecture

```
SneakerMint.balanceOf ─┐
SneakerMods.balanceOf ─┤
game.lifetimeEarned ───┼─▶ PlayerProgress ──levelOf──▶ SneakerMods.claim (ReqKind.PlayerLevel)
marketplace.tradesCount┤   xpOf/progressOf            ModStore.buy (requiredLevel)
workshop.actionsCount ─┤   usernames/avatar*          VeSneakerStore.buy (requiredLevel)
staking.polPositions ──┘
```

XP is **live state**, never snapshotted: selling NFTs or unstaking POL lowers
the level. Gates must read `levelOf` at claim/buy time — never cache levels.

## XP weights (constants in PlayerProgress)

| Signal | XP | Counter maintained by |
| --- | --- | --- |
| veSneaker held | 100 | `SneakerMint.balanceOf` |
| Mod/badge held | 40 | `SneakerMods.balanceOf` |
| 1,000 veRUNE lifetime | 10 | `SneakerGame.lifetimeEarned` (+= in `claimPoints`) |
| Completed trade | 60 | `SneakerMarketplace.tradesCount` (++ both sides in `buy`/`acceptOffer`/`settleAuction`) |
| Workshop action | 30 | `SneakerWorkshop.actionsCount` (++ equip/unequip/forge/useAbility/useRepairKit) |
| 1 POL staked | 20 | `SneakerStaking.polPositions.principal` |

Default thresholds: `0,300,800,1600,2800,4500,7000,10500,15000,21000` → L1–L10
(`MAX_LEVEL = 10`, admin-tunable via `setLevelThresholds` — must start at 0,
strictly increasing). Deploy env: `PROGRESS_LEVEL_THRESHOLDS`,
`PROGRESS_ADMIN_ADDRESS`.

## Hybrid profile (identity)

- **On-chain** (`PlayerProgress`): `setUsername` (3–20 **bytes**),
  `setNftAvatar(collection, tokenId)` — `ownerOf` verified, zero address clears.
- **Local** (`src/lib/profile.ts`, key `runearn:profile:<address>`): uploaded
  avatar (square-cropped 256px JPEG data URL, never leaves the device), avatar
  source selection, local mint history.
- `useProfile` syncs via `PROFILE_UPDATED_EVENT` + `storage` events;
  `usePlayerProgress` reads `progressOf`/`xpBreakdown`/username/avatar and
  reports `configured` (false → callers use the local estimate curve).

## Skill NFTs (two forms)

- **Passive** — `slot = SLOT_SKILL (6)`, non-consumable; equips in the 7th
  workshop slot; `effectBps` → `skillBonusBps` (inside `earnBonusBps`).
- **Consumable** — `useAbility` burns it: `aux 4` Overdrive (+effectBps, 48h,
  3⚡), `aux 5` Stim pack (energy refill, free, reverts on dead sneaker),
  `aux 6` Lucky repair (full health + effectBps boost 24h, 1⚡).

Distribution paths:

- **Free claim** — `SneakerMods` achievement with `kind = ReqKind.PlayerLevel`
  and `threshold = level`; one claim per wallet.
- **Paid copies** — `ModDesign.requiredLevel` / `Design.requiredLevel` on the
  stores; `buy` reverts `"*: level required"` under the gate. `0` = open.
- Wire `setProgress` on `SneakerMods`, `ModStore`, `VeSneakerStore` after
  deploying `PlayerProgress` — level-gated claims/buys fail without it.
- Seed the genesis catalog with `scripts/seed-skills.ts` (idempotent).

## Frontend map

| Piece | Where |
| --- | --- |
| `/profile` | `ProfileDashboard` — identity card, level card (`progressOf` or local estimate), skills owned, avatar picker, activity |
| Navbar button | `ProfileButton` in `Navbar.tsx` — avatar/icon left of `ThemeToggle` |
| `/badges` skills | `BadgesDashboard` splits `kind === 4` into "Level skills" (free claim, LV chips, live level header) |
| Store gates | `ModStorefront` + `VeSneakerStorefront` — `requiredLevel` chips + disabled buy |
| Workshop slot 7 | `SLOTS`/`SLOT_COUNT` in `src/lib/mods.ts`; `skillBonusBps` in the stats snapshot |
| Labels | `ABILITY_LABELS` (aux 4–6) + `REQ_KIND_LABELS[4] = "Player level"` in `mods.ts` |
| ABI | `playerProgressAbi` in `src/lib/contracts.ts` |

## Gotchas

- `username` length is measured in **bytes** on-chain — the frontend should
  restrict to safe characters.
- `progressOf` returns `nextLevelXp = 0` at max level — treat as 100%.
- `polPositions` returns a 4-field tuple `(principal, accruedRewards,
  depositedAt, lastAccrualAt)` — destructure the first only.
- `equipped`/`useAbility` count toward `actionsCount` **before** effects —
  failed tx revert the counter too, which is correct.
- Level-gated buys check `progress != address(0)` — a gated design without a
  wired `progress` always reverts; keep `requiredLevel = 0` until wired.
- Tests: `test/PlayerProgress.t.sol` covers XP signals, level boundaries,
  thresholds validation, username/avatar, skill claim + skill-slot earn bonus.

Related: `runearn-upgrade-economy` (slots/abilities internals),
`polygon-frontend-evm` (route/hook conventions), `polygon-testing` (matrices).
