---
name: polygon-security
description: Review Run-Earn Polygon contracts, native POL staking, RUNE rewards, NFT boosts, subgraph activity, and wallet flows for custody, arithmetic, and deployment risks.
---

# Run-Earn Polygon Security

Use this skill before merging or deploying any EVM contract, NFT mint flow, native POL staking flow, REN reward distribution, marketplace escrow, game point accounting, subgraph integration, or wallet transaction change.

## Current system under review

- `SneakerMint.sol`: ERC-721 for AI-generated sneaker artwork with role-authorized production minting. Tiers 0–3 (Common, Rare, Epic, Mythic).
- `RUNEToken.sol`: ERC-20 `REN`, 18 decimals, 100M hard cap, role-gated minting.
- `SneakerStaking.sol`: native POL vault with separate principal/reward accounting, rarity-based SneakerMint NFT APY boosts (Common +0.5%, Rare +0.8%, Epic +1.5%, Mythic +1.8%), and legacy REN NFT rewards.
- `SneakerAppraiser.sol`: read-only NFT valuation contract that estimates POL value based on rarity and tier. Admin-configurable parameters.
- `SneakerMarketplace.sol`: fixed-price listings, English auctions, and escrowed POL offers with a 2.5% fee and a staked-NFT sale guard.
- `SneakerGame.sol`: virtual veRUNE points (24h activation, streaks, durability, repair) with a funded REN redemption path.
- `VeSneakerStore.sol`: on-demand primary sale of virtual sneakers for POL, with per-design pricing, supply caps, and a treasury payout.
- `/api/generate-sneaker`: server-only Gemini image generation for the mint studio.
- `/api/subgraph`: server-only proxy for the `nuxgraph` Studio deployment.
- `/api/pol-price`: server-only proxy for the Uniswap Trading API POL/USD quote.
- Wallet layer: EIP-6963/EIP-1193 discovery, MetaMask Connect EVM, and OKX Universal Provider with mobile handoff.

## Review areas

### Native POL solvency

- Verify `totalPOLPrincipal` always equals reserved user principal.
- Confirm `recoverPOLRewards` can withdraw only `address(this).balance - totalPOLPrincipal`.
- Confirm POL withdrawals cannot be reentered and state updates happen before external calls.
- Verify `fundPOLRewards` is explicit, admin-controlled, budgeted, and not confused with user deposits.
- Test zero deposits, zero withdrawals, lock periods, partial withdrawals, full withdrawals, empty reserves, rounding, and overflow.
- Treat the APY as a parameter, not a guaranteed return.

### NFT boosts and custody

- Confirm only the NFT owner can stake.
- Verify traits are read from `SneakerMint.traitsOf`, never trusted from the browser.
- Confirm exact token IDs and depositor addresses are preserved through `stakedOwner`, receipts, and `stakedTokenIds`.
- Verify `safeTransferFrom`, `IERC721Receiver`, pause behavior, minimum lock, emergency recovery, and swap-and-pop array removal.
- Test that adding/removing NFTs accrues rewards before APY weight changes.

### REN compatibility

- Confirm `RUNEToken.MAX_SUPPLY` (100M), symbol `REN`, minter role, pause behavior, and the separate legacy reward vault.
- Ensure REN recovery cannot accidentally drain user POL or NFT custody.

### Marketplace escrow and payments

- Confirm listed/auctioned NFTs are escrowed by `SneakerMarketplace` and returned on cancel/no-bid settle.
- Verify every POL transfer uses the checks-effects-interactions order and `nonReentrant`; bids refund the previous bidder before state settles.
- Confirm `buy` requires `msg.value == listing.price` and the seller cannot buy their own listing.
- Verify auction minimum increments, that bids after `endTime` revert, and that settle cannot run before `endTime`.
- Confirm offers escrow POL, cannot target own or listed tokens, expire correctly, and that accepting an offer requires NFT approval (the NFT is not in escrow).
- Verify the fee split (`feeBps`, cap 20%) credits `accumulatedFees` and that `withdrawFees` cannot touch user funds.
- Confirm `stakedOwner(tokenId) != address(0)` blocks listing and auctioning staked NFTs.
- Check reentrancy on NFT receiver callbacks and that a malicious NFT/collection cannot re-enter settle/buy.

### Game points, durability, and redemption

- Confirm veRUNE is tracked in contract state only — it must never be minted as a transferable token by this contract.
- Verify `activate` enforces the 24h cooldown, ownership, and the worn-out guard; durability cannot underflow.
- Confirm accrual stops at the 24h window boundary and at 0 durability, and that already-earned points remain claimable.
- Verify streak logic (build within 48h, reset beyond, cap +50%) cannot be gamed by warping or repeated calls in one block.
- Confirm `repair` deducts the exact `repairCostPoints` and cannot be called at full durability.
- Confirm `redeem` is disabled by default, converts with integer division, and can never pay more REN than the contract holds (funded pool invariant).
- Verify `fundREN` is admin-only and that `setRedemptionEnabled` is the only gate.

### veSneaker primary sale

- Confirm `buy`/`buyBatch` require `msg.value == price × quantity` exactly and revert otherwise.
- Verify the design supply cap is enforced and that `updateDesign` cannot set a cap below `minted`.
- Confirm minting happens before the treasury transfer and that the whole flow is `nonReentrant`.
- Verify the store holds `MINTER_ROLE` on SneakerMint and that `addDesign`/`reserveMint`/`updateDesign` are admin-only.
- Confirm proof hashes are unique per (design, serial) and cannot collide with studio-minted proofs.
- Confirm `treasury` cannot be set to the zero address and that proceeds always reach it.
- Confirm `receive()` reverts so POL cannot be stranded, and that `withdrawProceeds` is a last-resort admin hatch.
- Verify the frontend catalog order matches the on-chain design index; a mismatch would mis-price designs.

### Subgraph and API security

- The Graph deploy key and query API key are different credentials.
- Keep `THE_GRAPH_QUERY_URL` and `THE_GRAPH_QUERY_API_KEY` server-only.
- Validate wallet addresses at `/api/subgraph` and never proxy arbitrary client-supplied GraphQL.
- Do not use indexed activity as the source of truth for balances or ownership; use RPC contract reads.
- Handle stale indexing, schema mismatch, endpoint errors, and query key rotation.

### Uniswap price feed security

- Keep `UNISWAP_API_KEY` server-only — the Trading API has no CORS support, so it must never be called from the browser.
- Never cache a fallback price as if it were live; surface `source: "fallback"` to the UI.
- Do not let the price feed drive on-chain state: contract prices are fixed in POL and only the USD display is derived.
- Treat the quote as untrusted input: validate the output amount is a positive integer before dividing.
- Do not use the feed for settlement, accounting, or oracle-style decisions without a dedicated, reviewed oracle.

### AI mint route security

- Keep `GEMINI_API_KEY` server-only; never expose it to `NEXT_PUBLIC_*` or logs.
- Enforce the image content-type and the 8 MB cap before calling the model.
- Do not persist or log raw user photos; only the generated artwork goes on-chain.
- Treat the proof hash as single-use: never reuse a proof across mints, and never trust a client-supplied proof without the contract's duplicate check.

### Wallet and frontend

- Validate `NEXT_PUBLIC_SNEAKER_MINT_ADDRESS`, `NEXT_PUBLIC_STAKING_VAULT_ADDRESS`, `NEXT_PUBLIC_SNEAKER_APPRAISER_ADDRESS`, `NEXT_PUBLIC_SNEAKER_MARKETPLACE_ADDRESS`, `NEXT_PUBLIC_SNEAKER_GAME_ADDRESS`, and `NEXT_PUBLIC_VE_SNEAKER_STORE_ADDRESS` with viem.
- Confirm the EIP-1193 connected wallet is the signer.
- Check wrong chain, rejected signatures, insufficient POL, failed receipts, and stale UI state.
- Confirm the UI never treats veRUNE or local-storage entries as on-chain ownership.

### Deployment and funding scripts

- Require explicit `--network polygon` or `--network amoy`; never silently deploy to an unknown network.
- Confirm `DEPLOYER_PRIVATE_KEY` is supplied outside source control and the deployer has sufficient gas.
- Verify constructor arguments match the saved deployment manifest before explorer verification.
- Treat `POLYGONSCAN_API_KEY` as a terminal secret; do not log it.
- For `fund-staking.ts`, confirm the signer has `DEFAULT_ADMIN_ROLE` for POL funding and that only reward reserve surplus changes.
- For RUNE funding, check the wallet balance and the staking vault address before sending.
- Do not treat a successful transaction as proof of economic solvency; review reserve budgets separately.

## Review workflow

1. Consult current official Polygon, OpenZeppelin, Solidity, Hardhat 3, viem, and The Graph documentation.
2. Inspect Solidity and TypeScript tests, including negative and fuzz cases.
3. Run `npx hardhat compile`, `npx hardhat test`, `npm run lint`, `npm run typecheck`, and `npm run build`.
4. Verify `/staking`, `/marketplace`, and `/game` on Polygon Amoy with a disposable wallet and funded test reserve/pools.
5. Verify subgraph events after indexing and compare them against RPC receipts.
6. Report residual custody, solvency, economic, key-management, and indexing risks.
7. Do not mark financial logic production-ready without multisig administration and independent smart-contract/economic review.
