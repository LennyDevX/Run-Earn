# RUN&EARN Polygon contract roadmap

RUN&EARN targets Polygon with standard EVM tooling. The current foundation is a Hardhat 3 / Solidity 0.8.36 project for Polygon Amoy first.

## Current foundation (shipped Q3 2026)

### 1. `RUNEToken` ERC-20

`contracts/RUNEToken.sol` is the REN token (symbol `REN`, 18 decimals) with role-gated minting, pausable transfers, a 100M hard cap, and user burn support. It backs the legacy NFT reward path and the future veRUNE redemption pool. Before production, treasury issuance must be controlled by a multisig and explicit emission budget.

### 2. `SneakerMint` ERC-721

`contracts/SneakerMint.sol` owns token IDs, metadata URI, proof uniqueness, rarity (0–100), and tier (0–3: Common, Rare, Epic, Mythic). Production minting uses `MINTER_ROLE`; public proof minting is an explicitly gated Amoy/beta path.

### 3. `SneakerStaking` POL vault

`contracts/SneakerStaking.sol` accepts native POL deposits, tracks principal separately, calculates passive POL rewards (2.80% base APY, 8% cap, 30-day lock), and pays them only from an admin-funded reserve. Users can lock SneakerMint NFTs for rarity-based boosts: Common +0.5%, Rare +0.8%, Epic +1.5%, Mythic +1.8%. `stakedTokenIds(owner)` supports the frontend unlock flow.

### 4. `SneakerAppraiser` valuation

`contracts/SneakerAppraiser.sol` is a read-only valuation contract: `(baseValue + tierValues[tier] + rarity * rarityWeight) * globalMultiplierBps / 10_000`, all parameters admin-configurable. It powers suggested marketplace prices and the NFT value UI.

### 5. `SneakerMarketplace`

`contracts/SneakerMarketplace.sol` supports fixed-price listings, English auctions (1% min bid increment), and escrowed POL offers, with a 2.5% marketplace fee. NFTs locked in staking cannot be listed or auctioned. `suggestedPrice` derives from the appraiser; `valueRecommendations` returns on-chain improvement tips.

### 6. `SneakerGame` gamification

`contracts/SneakerGame.sol` runs the retention loop: activate each sneaker every 24h to earn virtual veRUNE points (Common 100 → Mythic 800/day), daily streaks add +1%/day (cap +50%), each activation wears durability (repair costs 50 veRUNE), and `redeem` converts veRUNE to REN at 100:1 once the admin funds and enables the pool. Tokenomics: `docs/veRune-tokenomics.md`.

### 7. Subgraph activity index

The deployed `nuxgraph` Studio subgraph is consumed through the server-only `/api/subgraph` proxy. It should index staking events (`POLDeposited`, `POLWithdrawn`, `POLRewardsClaimed`, `Staked`, `Unstaked`) plus marketplace and game events (`ListingCreated`, `NFTSold`, `AuctionSettled`, `OfferAccepted`, `Activated`, `PointsClaimed`, `Redeemed`).

### 8. `VeSneakerStore` primary sale

`contracts/VeSneakerStore.sol` sells **veSneakers** — virtual sneakers — for native POL to
anyone, with or without a physical pair. It mints on demand through
`SneakerMint.mintAuthorized` (the store holds `MINTER_ROLE`), so no copies need to be
pre-minted. Each design carries its own name, token URI, rarity, tier, POL price, and
supply cap (default 1000). Prices are USD targets converted at `POL_USD_PRICE` — $40
(Common) to $150 (Mythic), geometric progression, i.e. 410 / 635 / 993 / 1536 POL at POL
= $0.09764. Proceeds go to the store treasury. `reserveMint` lets the
admin allocate copies to the treasury for airdrops or marketplace listings without
payment. The 9 genesis designs are configured and optionally pre-minted by
`scripts/mint-veSneakers.ts`.

### 9. Verification registry — next production hardening

A verifier registry should store one-time commitments for physical sneaker purchases. Retail validation, raw photos, and personal data stay off-chain; the registry or signed verifier authorizes the wallet, URI, rarity, and tier.

## Planned contracts

10. **Sneaker upgrades:** burn veRUNE to raise an existing sneaker's rarity score and tier — increasing its appraiser valuation, staking APY boost, and marketplace price. Closes the value-improvement loop the appraiser recommends.
11. **Benefits vault:** separate `SneakerVault` for discount, special-offer, early-access, and gift eligibility.
12. **Physical redemption bridge:** redeem veRUNE or REN for real sneakers from the online store, backed by the verifier registry for one-time physical fulfillment claims.
13. **Treasury and fee splitter:** distribute approved physical-sale or protocol-fee shares (including the 2.5% marketplace fee and veSneaker sale proceeds) to rewards, operations, and reserves.
14. **Governance and parameter registry:** timelock APY, tier, fee, veSneaker price, treasury, pause, and migration changes; REN-weighted voting; multisig on mainnet.
15. **Referral and transfer attribution:** prevent self-referrals, replay, spoofing, and unauthorized claims.
16. **Quest/activity attestations:** signed activity proofs without storing personal data.
17. **Merkle distribution:** optional one-time genesis claims with expiry and pause controls.

## Suggested order

1. Run Solidity + TypeScript tests for all seven contracts (`npx hardhat test`).
2. Deploy `RUNEToken`, `SneakerMint`, `SneakerStaking`, `SneakerAppraiser`, `SneakerMarketplace`, `SneakerGame`, and `VeSneakerStore` to Polygon Amoy.
3. Grant `MINTER_ROLE` on `SneakerMint` to `VeSneakerStore` (the deploy script does this automatically) and register the 9 veSneaker designs with `scripts/mint-veSneakers.ts`.
4. Fund the POL reward reserve and the veRUNE redemption pool; verify deposit, claim, withdrawal, NFT boost, listing, bidding, activation, redemption, and veSneaker purchase behavior.
5. Configure the `nuxgraph` query endpoint and verify `/api/subgraph` activity, including marketplace and game events.
6. Add verifier authorization before production minting.
7. Complete custody, economic, and independent security review.
8. Add multisig/timelock governance before mainnet.
9. Build upgrades, benefits vault, physical bridge, store integration, referrals, quests, and airdrops only after core invariants are stable.

## Toolchain

- Hardhat 3, ESM/declarative configuration, build profiles.
- Solidity 0.8.36 and OpenZeppelin Contracts 5.6.
- viem 2 and EIP-1193 wallets (EIP-6963 discovery, MetaMask Connect, OKX Universal Provider).
- Hardhat Solidity tests in `test/*.t.sol`.
- Mocha/viem integration tests in `test/*.ts`.
- The Graph Studio `nuxgraph` query proxy.
- Polygon Amoy for testnet deployment; Polygon mainnet only with multisig, deterministic builds, protected RPC endpoints, and independent audit.
