# Polygon Amoy test runbook

The frontend uses viem with an EIP-1193 injected wallet provider. The v1.0 contract set is `SneakerMint`, `RENToken`, `SneakerStaking`, `SneakerAppraiser`, `SneakerMarketplace`, `SneakerGame`, `VeSneakerStore`, `SneakerMods`, `SneakerWorkshop`, `SneakerSwap`, `ModRental`, `ModStore`, and `PlayerProgress`. Amoy is the default test environment; this runbook is not a mainnet deployment approval.

## 1. Configure the app

Copy `.env.example` to `.env.local` and fill public values only:

```env
NEXT_PUBLIC_POLYGON_NETWORK=amoy
NEXT_PUBLIC_POLYGON_RPC_URL=https://rpc-amoy.polygon.technology
NEXT_PUBLIC_POLYGON_EXPLORER=https://amoy.polygonscan.com
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=
NEXT_PUBLIC_SNEAKER_MINT_ADDRESS=<sneaker-mint-address>
NEXT_PUBLIC_REWARD_TOKEN_ADDRESS=<ren-token-address>
NEXT_PUBLIC_STAKING_VAULT_ADDRESS=<staking-vault-address>
NEXT_PUBLIC_SNEAKER_APPRAISER_ADDRESS=<appraiser-address>
NEXT_PUBLIC_SNEAKER_MARKETPLACE_ADDRESS=<marketplace-address>
NEXT_PUBLIC_SNEAKER_GAME_ADDRESS=<game-address>
NEXT_PUBLIC_VE_SNEAKER_STORE_ADDRESS=<vesneaker-store-address>
NEXT_PUBLIC_SNEAKER_MODS_ADDRESS=<mods-address>
NEXT_PUBLIC_SNEAKER_WORKSHOP_ADDRESS=<workshop-address>
NEXT_PUBLIC_SNEAKER_SWAP_ADDRESS=<swap-address>
NEXT_PUBLIC_MOD_RENTAL_ADDRESS=<rental-address>
NEXT_PUBLIC_MOD_STORE_ADDRESS=<mod-store-address>
NEXT_PUBLIC_PLAYER_PROGRESS_ADDRESS=<player-progress-address>

THE_GRAPH_QUERY_URL=https://api.studio.thegraph.com/query/<QUERY_API_KEY>/nuxgraph/0.1.0
THE_GRAPH_QUERY_API_KEY=<QUERY_API_KEY>
THE_GRAPH_SUBGRAPH_SLUG=nuxgraph
THE_GRAPH_SUBGRAPH_VERSION=0.1.0
```

Use a **query API key** from The Graph Studio API Keys page. The deployment key is for CLI deployment/admin and is not a query key. Keep both Graph values server-only. Restart Next after changing environment values.

## 2. Install and verify

```bash
npm install
npx hardhat --version
npx hardhat compile
```

The project expects Hardhat 3, Solidity 0.8.36, and OpenZeppelin Contracts 5.6.

## 3. Run all checks

```bash
npx hardhat test solidity
npx hardhat test mocha
npx hardhat test
npm run lint
npm run typecheck
npm run build
```

Do not deploy if contract tests or application checks fail.

## 4. Deploy to Polygon Amoy

Deploy from a disposable wallet outside the repository. `DEPLOY_TARGET=all` deploys
the whole v1.0 set in dependency order and runs the post-deploy wiring:

1. `RENToken` → `SneakerMint` → `SneakerStaking` → `SneakerAppraiser` → `SneakerMarketplace` → `SneakerGame` → `SneakerMods` → `SneakerWorkshop` → `SneakerSwap` → `ModRental` → `ModStore` → `VeSneakerStore` → `PlayerProgress`.
2. The script then wires: `game.setBoosts/setWorkshop(workshop)`, `staking.setBoosts(workshop)`, `appraiser.setBoosts(workshop)`, `mods.setWorkshop(workshop)`, `workshop.setRentalSource(rental)`, `marketplace.setWorkshop(workshop)` + `setCollectionAllowed(mods, true)`, `swap.setCollectionAllowed(mods, true)`, `mods.grantRole(MINTER_ROLE, modStore)`, `nft.grantRole(MINTER_ROLE, veStore)`, `mods.setProgress(progress)`, `modStore.setProgress(progress)`, `veStore.setProgress(progress)`.
3. Seed the skill catalog: `SNEAKER_MODS_ADDRESS=0x... MOD_STORE_ADDRESS=0x... npx hardhat run scripts/seed-skills.ts --network amoy` (idempotent — skips existing levels/designs).
4. Fund the POL reward reserve with `SneakerStaking.fundPOLRewards()`.
5. Fund the legacy RUNE vault only if the NFT RUNE reward path is enabled.
6. Keep public mint disabled unless deliberately testing the beta path.
7. Record deployed addresses in `.env.local` — every page degrades to demo mode when its address is missing.

## 5. Staking route demo

1. Open `/staking`.
2. Connect a Polygon Amoy wallet.
3. Deposit POL and verify `POLDeposited` in the receipt/logs.
4. Confirm the principal, pending rewards, APY, and POL reserve cards update.
5. Open the sneaker boost section and lock a SneakerMint NFT.
6. Verify `effectiveApyBps` increases according to rarity/tier.
7. Claim POL rewards only after the reward reserve is funded.
8. Withdraw POL after the minimum lock period.
9. Unlock NFTs after their minimum lock period.
10. Confirm recent activity appears through `/api/subgraph` after indexing.

## 5b. Game and workshop demo

1. Open `/game`, activate a sneaker, and confirm the streak, health bar, power, and
   energy charges update; health decays 1/day and refills nothing — only repair restores it.
2. Claim pending veRUNE and confirm `veRuneBalance` increases.
3. Open `/workshop`, pick the sneaker, equip a mod into its slot (approve + equip),
   and confirm the effective-stats panel changes.
4. Burn a consumable (`useAbility`): repair kit → full health, surge → instant
   activation, boost capsule → +earn for 24h, service kit → condition back to 100%,
   Overdrive → +earn for 48h, Stim pack → energy refill, Lucky repair → full
   health + boost. Confirm the mod NFT is burned and the energy cost was deducted.
5. Warp a year forward and confirm `conditionBps` decays to the 5000 floor, then burn a
   service kit and confirm it returns to 10000.
6. Open `/badges` and claim an achievement whose on-chain requirement is met.
   In the "Level skills" section, confirm locked skills show "Unlocks at level N"
   and a claimable skill mints for free once `PlayerProgress.levelOf` qualifies.
7. Open `/profile`: set a username, pick an NFT avatar, and confirm the level
   card shows the on-chain `progressOf` snapshot ("Verified on-chain").
8. Equip a passive skill NFT in the workshop's Skill slot (slot 6) and confirm
   the "Skill bonus" row and `earnBonusBps` increase. Buy an extra skill copy
   from `/collection` — it must revert/disable below the required level.
9. On `/marketplace`, list a mod (Mods tab), open a rental (Rentals tab), and
   create/accept a swap (Trades tab). Confirm a sneaker with equipped mods cannot
   be listed until unequipped.

## 5c. Sneaker family artwork

1. Open Home and verify the hero rotates Astra → Sol → Luna without a blank frame. Use the previous/next and family controls, pause rotation, and verify reduced-motion mode keeps a static frame.
2. Open `/collection`, filter each family, and confirm the first three store design indices map to Astra, Sol, Luna and that the purchase transaction still uses the matching index.
3. Open `/game`, `/workshop`, `/marketplace`, and `/staking` with owned sneakers. Confirm each card resolves the artwork from `tokenURI`, not `tokenId`, and user-generated metadata artwork remains intact.
4. Before registering a fresh store, set `VE_SNEAKER_ASSET_BASE_URL` to the public HTTPS origin serving the PNG files. On an already configured store, `VE_UPDATE_DESIGN_URIS=true` explicitly updates the first three design URIs for future mints; previously minted per-token URIs do not change.

## 6. Subgraph verification

The `/api/subgraph?address=0x...` route introspects the configured `nuxgraph` schema and normalizes address-indexed activity. Test the route after setting the query endpoint. The subgraph should expose entities for POL deposits, withdrawals, reward claims, NFT stakes, and NFT unstakes.

If the activity panel is empty but RPC state works, inspect the subgraph schema and publish a mapping version that indexes the new POL events.

## 7. Security gates before mainnet

- Use multisig admin and treasury controls.
- Verify deterministic build artifacts and deployed bytecode.
- Verify the POL reserve cannot be drained below user principal.
- Test pause, emergency recovery, empty reserve, unauthorized calls, replay, custody, and reentrancy cases.
- Keep the query API key server-only and rotate any key that was exposed.
- Obtain independent smart-contract and economic security reviews.

## 8. Deployment scripts

Set the terminal-only variables in `.env.local` or the deployment environment. `DEPLOYER_PRIVATE_KEY` is the signer used for gas; `DEPLOY_ADMIN_ADDRESS` can be a multisig or separate admin.

Deploy all thirteen contracts and verify them:

```bash
DEPLOY_TARGET=all npx hardhat run scripts/deploy.ts --network amoy
```

Deploy and verify one contract (`DEPLOY_TARGET` accepts `all`, `RENToken`,
`SneakerMint`, `SneakerStaking`, `SneakerAppraiser`, `SneakerMarketplace`,
`SneakerGame`, `VeSneakerStore`, `SneakerMods`, `SneakerWorkshop`, `SneakerSwap`,
`ModRental`, `ModStore`, `PlayerProgress`):

```bash
DEPLOY_TARGET=RENToken npx hardhat run scripts/deploy.ts --network amoy
DEPLOY_TARGET=SneakerMint npx hardhat run scripts/deploy.ts --network amoy
DEPLOY_TARGET=SneakerStaking \
  RUNE_TOKEN_ADDRESS=0x... \
  SNEAKER_MINT_ADDRESS=0x... \
  npx hardhat run scripts/deploy.ts --network amoy
DEPLOY_TARGET=SneakerMods \
  SNEAKER_MINT_ADDRESS=0x... \
  SNEAKER_GAME_ADDRESS=0x... \
  STAKING_VAULT_ADDRESS=0x... \
  npx hardhat run scripts/deploy.ts --network amoy
DEPLOY_TARGET=SneakerWorkshop \
  SNEAKER_MINT_ADDRESS=0x... \
  SNEAKER_MODS_ADDRESS=0x... \
  SNEAKER_GAME_ADDRESS=0x... \
  STAKING_VAULT_ADDRESS=0x... \
  npx hardhat run scripts/deploy.ts --network amoy
```

Single-target deploys read dependency addresses from the same `*_ADDRESS`
environment variables the wiring step uses, so a partial redeploy can re-run the
wiring against existing contracts.

Use `SKIP_VERIFY=true` only for local or intentionally unverified deployments. The deployment manifest is saved under `deployments/<network>.json` and is ignored by git.

## 9. Fund the staking reward reserve

The default funding asset is native POL. The signer must have `DEFAULT_ADMIN_ROLE` on `SneakerStaking` because `fundPOLRewards()` is admin-only:

```bash
FUND_ASSET=POL FUND_AMOUNT=10 STAKING_VAULT_ADDRESS=0x... \
  npx hardhat run scripts/fund-staking.ts --network amoy
```

The script validates network, signer, balance, admin role, receipt status, and reserve balance before/after funding. Set `FUNDING_PRIVATE_KEY` to use a personal funding wallet different from `DEPLOYER_PRIVATE_KEY`; otherwise it uses the configured deployer signer.

For the legacy RUNE reward vault:

```bash
FUND_ASSET=RUNE FUND_AMOUNT=1000 \
  STAKING_VAULT_ADDRESS=0x... RUNE_TOKEN_ADDRESS=0x... \
  npx hardhat run scripts/fund-staking.ts --network amoy
```

On Windows PowerShell, set variables for the command like this:

```powershell
$env:DEPLOY_TARGET = "RENToken"
npx hardhat run scripts/deploy.ts --network amoy

$env:FUND_ASSET = "POL"
$env:FUND_AMOUNT = "10"
$env:STAKING_VAULT_ADDRESS = "0x..."
npx hardhat run scripts/fund-staking.ts --network amoy
```


## Web hardening checks (before any deploy)

Run these against a production build (`npm run build && npm run start`):

1. **Headers are present.** `curl -sI http://127.0.0.1:3000/` should show
   `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
   `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, and
   `Content-Security-Policy-Report-Only`. There should be **no** `X-Powered-By`.
2. **The CSP is report-only, not enforcing.** If the header reads
   `Content-Security-Policy` (without `-Report-Only`) the policy is live — confirm
   that was intentional, because an unlisted origin will now block silently.
3. **Rate limiting fires.** Loop `/api/pol-price` 34 times; expect 30 × 200 then
   4 × 429 with a `Retry-After` header.
4. **The spend budget runs before the paid call.** POST to
   `/api/generate-sneaker` with no body seven times: the first five should be
   `400` (bad form) with **zero Gemini tokens spent**, the next two `429`. If you
   see `502` or a Gemini error instead, the throttle is running too late.
5. **Redis is actually connected.** With Upstash configured, hammering a route
   from two different instances must share one window. Without it the limiter logs
   nothing and silently degrades to per-instance — check `backend` in the
   `rateLimit()` result if you need certainty.
