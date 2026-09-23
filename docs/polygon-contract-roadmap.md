# RUN&EARN Polygon contract roadmap

RUN&EARN targets Polygon with standard EVM tooling. The current foundation is a Hardhat 3 / Solidity 0.8.36 project for Polygon Amoy first.

## Current foundation (shipped Q3 2026)

### 1. `RENToken` ERC-20

`contracts/RENToken.sol` is the REN token (symbol `REN`, 18 decimals) with role-gated minting, pausable transfers, a 100M hard cap, and user burn support. It backs the legacy NFT reward path and the future veRUNE redemption pool. Before production, treasury issuance must be controlled by a multisig and explicit emission budget.

### 2. `SneakerMint` ERC-721

`contracts/SneakerMint.sol` owns token IDs, metadata URI, proof uniqueness, rarity (0–100), and tier (0–3: Common, Rare, Epic, Mythic). Production minting uses `MINTER_ROLE`; public proof minting is an explicitly gated Amoy/beta path.

### 3. `SneakerStaking` POL vault

`contracts/SneakerStaking.sol` accepts native POL deposits, tracks principal separately, calculates passive POL rewards (2.80% base APY, 8% cap, 30-day lock), and pays them only from an admin-funded reserve. Users can lock SneakerMint NFTs for rarity-based boosts: Common +0.5%, Rare +0.8%, Epic +1.5%, Mythic +1.8%. `stakedTokenIds(owner)` supports the frontend unlock flow.

### 4. `SneakerAppraiser` valuation

`contracts/SneakerAppraiser.sol` is a read-only valuation contract: `(baseValue + tierValues[tier] + rarity * rarityWeight) * globalMultiplierBps / 10_000`, all parameters admin-configurable. It powers suggested marketplace prices and the NFT value UI.

### 5. `SneakerMarketplace`

`contracts/SneakerMarketplace.sol` supports fixed-price listings, English auctions (1% min bid increment), and escrowed POL offers, with a 2.5% marketplace fee. NFTs locked in staking cannot be listed or auctioned. `suggestedPrice` derives from the appraiser; `valueRecommendations` returns on-chain improvement tips.

### 6. `SneakerGame` gamification

`contracts/SneakerGame.sol` runs the retention loop around three stats — **power** (rarity-scaled veRUNE mining, Common 100 → Mythic 800/day base), **health** (decays 1/day of real time plus wear per activation; at 0 the sneaker stops mining until repaired for 50 veRUNE or a burned repair kit), and **energy** (charges that fuel consumable abilities, refilled on each manual activation). Daily streaks add +1%/day (cap +50%), and `redeem` converts veRUNE to REN at 100:1 once the admin funds and enables the pool. `SneakerWorkshop.useAbility` burns consumable mod NFTs for repair kits, surge activations, 24h boost capsules, forge stones, 48h Overdrives, Stim pack energy refills, and Lucky repairs — each use destroys the NFT, driving repeat demand. Tokenomics: `docs/veRune-tokenomics.md`.

### 7. Subgraph activity index

The deployed `nuxgraph` Studio subgraph is consumed through the server-only `/api/subgraph` proxy. It should index staking events (`POLDeposited`, `POLWithdrawn`, `POLRewardsClaimed`, `Staked`, `Unstaked`) plus marketplace and game events (`ListingCreated`, `NFTSold`, `AuctionSettled`, `OfferAccepted`, `Activated`, `PointsClaimed`, `Redeemed`).

### 8. `VeSneakerStore` primary sale

`contracts/VeSneakerStore.sol` sells **veSneakers** — the playable NFTs of the virtual
sneaker economy — for native POL to anyone. It mints on demand through
`SneakerMint.mintAuthorized` (the store holds `MINTER_ROLE`), so no copies need to be
pre-minted. Each design carries its own name, token URI, rarity, tier, POL price, and
supply cap (default 1000). Prices are USD targets converted at `POL_USD_PRICE` — $40
(Common) to $150 (Mythic), geometric progression, i.e. 410 / 635 / 993 / 1536 POL at POL
= $0.09764. Proceeds go to the store treasury. `reserveMint` lets the
admin allocate copies to the treasury for airdrops or marketplace listings without
payment. The 9 genesis designs are configured and optionally pre-minted by
`scripts/mint-veSneakers.ts`.

### 9. Upgrade economy — shipped in v1.0

- `contracts/SneakerMods.sol` — ERC-721 mod/badge collection with on-chain achievement claims (including `ReqKind.PlayerLevel` skill claims).
- `contracts/SneakerWorkshop.sol` — seven-slot equipment (six upgrade slots + passive Skill slot), repair kits, and the veRUNE forge (implements `ISneakerBoosts`).
- `contracts/SneakerSwap.sol` — atomic NFT↔NFT trades (± POL) across collections.
- `contracts/ModRental.sol` — time-boxed mod rentals paid in POL.
- `contracts/ModStore.sol` — primary sale of premium mod designs, with `requiredLevel` gates.
- `SneakerMarketplace` is collection-aware (listings, auctions, offers keyed by `(collection, tokenId)`); `SneakerGame`, `SneakerStaking`, and `SneakerAppraiser` consume workshop effects through `ISneakerBoosts`.

### 9b. `PlayerProgress` — levels and skill gating

`contracts/PlayerProgress.sol` aggregates live protocol state into a 10-tier
player level: owned veSneakers (×100), owned mods (×40), lifetime claimed veRUNE
(10 XP per 1,000 via `SneakerGame.lifetimeEarned`), completed marketplace trades
(×60 via `tradesCount`, both sides), workshop actions (×30 via `actionsCount`),
and staked POL principal (×20 per POL). Levels gate skill NFTs — free claims via
`SneakerMods` `PlayerLevel` achievements and purchasable copies via
`ModStore`/`VeSneakerStore` `requiredLevel` designs — and host the public
profile (`setUsername`, `setNftAvatar`). Level is live standing: selling NFTs or
unstaking POL lowers it. Full reference: [`player-progression.md`](player-progression.md).

### 10. Mint verifier authorization — next production hardening

Public `mintWithProof` stays behind `publicMintEnabled`. Before opening it, a verifier
service or registry should authorize the wallet, URI, rarity, and tier — raw photos and
personal data stay off-chain.

## Planned contracts

11. **Sneaker upgrades:** shipped — `SneakerWorkshop.forge` burns veRUNE for permanent rarity/earn-rate levels, and equipped mods add slot-based effects on top.
12. **Benefits vault:** separate `SneakerVault` for discount, special-offer, early-access, and gift eligibility.
13. **REN redemption pool:** fund `SneakerGame` with REN and enable `redeem(points)` so veRUNE converts to the live token at `redemptionRate`.
14. **Treasury and fee splitter:** distribute protocol-fee shares (the 2.5% marketplace fee, rental fee, and store proceeds) to rewards, operations, and reserves.
15. **Governance and parameter registry:** timelock APY, tier, fee, veSneaker price, treasury, pause, and migration changes; REN-weighted voting; multisig on mainnet.
16. **Referral and transfer attribution:** prevent self-referrals, replay, spoofing, and unauthorized claims.
17. **Quest/activity attestations:** signed activity proofs without storing personal data.
18. **Merkle distribution:** optional one-time genesis claims with expiry and pause controls.

## Suggested order

1. Run Solidity + TypeScript tests for all thirteen contracts (`npx hardhat test`).
2. Deploy `RENToken`, `SneakerMint`, `SneakerStaking`, `SneakerAppraiser`, `SneakerMarketplace`, `SneakerGame`, `SneakerMods`, `SneakerWorkshop`, `SneakerSwap`, `ModRental`, `ModStore`, `VeSneakerStore`, and `PlayerProgress` to Polygon Amoy — `DEPLOY_TARGET=all` handles order and wiring.
3. The deploy script grants `MINTER_ROLE` on `SneakerMint` to `VeSneakerStore` and on `SneakerMods` to `ModStore`, links the workshop into game/staking/appraiser/marketplace/mods, connects the rental source, allows the mods collection on the marketplace and swap venue, and wires `setProgress` on mods/both stores to `PlayerProgress`. Register the 9 veSneaker designs with `scripts/mint-veSneakers.ts` and the skill catalog with `scripts/seed-skills.ts`.
4. Fund the POL reward reserve and the veRUNE redemption pool; verify deposit, claim, withdrawal, NFT boost, listing, bidding, activation, redemption, veSneaker purchase, mod purchase, equip, rental, and swap behavior.
5. Configure the `nuxgraph` query endpoint and verify `/api/subgraph` activity, including marketplace and game events.
6. Add verifier authorization before production minting.
7. Complete custody, economic, and independent security review.
8. Add multisig/timelock governance before mainnet.
9. Build the benefits vault, treasury splitter, referrals, quests, and airdrops only after core invariants are stable.

## Toolchain

- Hardhat 3, ESM/declarative configuration, build profiles.
- Solidity 0.8.36 and OpenZeppelin Contracts 5.6.
- viem 2 and EIP-1193 wallets (EIP-6963 discovery, MetaMask Connect, OKX Universal Provider).
- Hardhat Solidity tests in `test/*.t.sol`.
- Mocha/viem integration tests in `test/*.ts`.
- The Graph Studio `nuxgraph` query proxy.
- Polygon Amoy for testnet deployment; Polygon mainnet only with multisig, deterministic builds, protected RPC endpoints, and independent audit.
