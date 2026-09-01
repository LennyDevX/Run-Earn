---
name: polygon-security
description: Review Run-Earn Polygon contracts, native POL staking, RUNE rewards, NFT boosts, subgraph activity, and wallet flows for custody, arithmetic, and deployment risks.
---

# Run-Earn Polygon Security

Use this skill before merging or deploying any EVM contract, NFT mint flow, native POL staking flow, RUNE reward distribution, subgraph integration, or wallet transaction change.

## Current system under review

- `SneakerMint.sol`: ERC-721 for AI-generated sneaker artwork with role-authorized production minting.
- `RUNEToken.sol`: ERC-20 `RUNE`, 18 decimals, 100M hard cap, role-gated minting.
- `SneakerStaking.sol`: native POL vault with separate principal/reward accounting, optional SneakerMint NFT APY boosts, and legacy RUNE NFT rewards.
- `/api/subgraph`: server-only proxy for the `nuxgraph` Studio deployment.
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

### RUNE compatibility

- Confirm `RUNEToken.MAX_SUPPLY`, minter role, pause behavior, and the separate legacy reward vault.
- Ensure RUNE recovery cannot accidentally drain user POL or NFT custody.

### Subgraph and API security

- The Graph deploy key and query API key are different credentials.
- Keep `THE_GRAPH_QUERY_URL` and `THE_GRAPH_QUERY_API_KEY` server-only.
- Validate wallet addresses at `/api/subgraph` and never proxy arbitrary client-supplied GraphQL.
- Do not use indexed activity as the source of truth for balances or ownership; use RPC contract reads.
- Handle stale indexing, schema mismatch, endpoint errors, and query key rotation.

### Wallet and frontend

- Validate `NEXT_PUBLIC_SNEAKER_MINT_ADDRESS` and `NEXT_PUBLIC_STAKING_VAULT_ADDRESS` with viem.
- Confirm the EIP-1193 connected wallet is the signer.
- Check wrong chain, rejected signatures, insufficient POL, failed receipts, and stale UI state.

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
4. Verify `/staking` on Polygon Amoy with a disposable wallet and funded test reserve.
5. Verify subgraph events after indexing and compare them against RPC receipts.
6. Report residual custody, solvency, economic, key-management, and indexing risks.
7. Do not mark financial logic production-ready without multisig administration and independent smart-contract/economic review.
