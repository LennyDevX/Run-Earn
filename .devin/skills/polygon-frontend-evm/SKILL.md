---
name: polygon-frontend-evm
description: Build Run-Earn's Polygon frontend with viem, EIP-1193/EIP-6963 wallet discovery, MetaMask Connect, OKX Universal Provider, native POL staking, SneakerMint NFT minting, RUNE reads, subgraph activity, and Amoy-first defaults.
---

# Run-Earn Polygon Frontend

Use this skill for wallet UX, RPC reads, native POL staking, SneakerMint NFT minting, RUNE reads, subgraph activity, and cross-platform EVM wallet integrations.

## Current routes and contracts

- NFT: `SneakerMint` at `NEXT_PUBLIC_SNEAKER_MINT_ADDRESS`.
- RUNE token: `RUNEToken` at `NEXT_PUBLIC_REWARD_TOKEN_ADDRESS`.
- Staking vault: `SneakerStaking` at `NEXT_PUBLIC_STAKING_VAULT_ADDRESS`.
- Staking UI: `/staking`.
- Subgraph proxy: `/api/subgraph?address=0x...`.
- Subgraph server config: `THE_GRAPH_QUERY_URL`, `THE_GRAPH_QUERY_API_KEY`, `THE_GRAPH_SUBGRAPH_SLUG=nuxgraph`, `THE_GRAPH_SUBGRAPH_VERSION=0.1.0`.

## Wallet architecture

- Desktop and in-app browser discovery uses EIP-6963, with a safe fallback to `window.ethereum`.
- Main wallet options are `OKX Wallet` and `MetaMask`.
- MetaMask mobile/extension fallback uses `@metamask/connect-evm` and its automatic mobile deeplink/QR handling.
- OKX mobile fallback uses `@okxconnect/universal-provider`; the SDK manages the app handoff and return strategy.
- The app wraps SDK providers behind the same EIP-1193 interface, so viem/RPC reads and transaction code remain wallet-agnostic.
- Do not construct arbitrary wallet deeplinks from user input. Use official SDK handoff and allowlisted dApp origin/chain configuration.

## Wallet security and lifecycle

1. Discover EIP-6963 providers before selecting a desktop provider.
2. Never silently choose an unexpected extension when multiple providers are installed.
3. On mobile without an injected provider, let the user explicitly choose OKX or MetaMask.
4. Re-read `eth_accounts` and `eth_chainId` after SDK return, account change, and chain change.
5. Verify the active chain before every transaction.
6. Wait for receipts before reporting success.
7. Disconnect local state and attempt SDK session disconnect; EIP-1193 cannot universally revoke permissions.
8. Treat `NEXT_PUBLIC_*` values as public. Never put private keys, Graph keys, verifier secrets, or server credentials there.

## POL staking UI flow

1. Read `polPositions`, `pendingPOLRewards`, `effectiveApyBps`, `positions`, `stakedTokenIds`, and `availablePOLRewards` from RPC.
2. Use `depositPOL()` with a native transaction value.
3. Use `withdrawPOL(amount)` only after the contract lock period.
4. Use `claimPOLRewards()` only when pending rewards are nonzero and the reserve is funded.
5. Read owned SneakerMint IDs via ERC-721 enumerable functions.
6. Lock NFTs through `stake(tokenId)` and unlock through `unstake(tokenId)`.
7. Show confirmed local transaction activity immediately, then refresh `/api/subgraph` after indexing.

## Subgraph integration

- Do not query The Graph directly from the browser with a secret key.
- Use the Next Route Handler proxy and server-only environment variables.
- The dynamic adapter introspects the schema and finds address-indexed activity entities.
- If the schema does not expose new POL events, show RPC state and an empty indexed activity state rather than inventing history.
- Recommended indexed events: `POLDeposited`, `POLWithdrawn`, `POLRewardsClaimed`, `Staked`, and `Unstaked`.

## Required approach

1. Use viem and the EIP-1193 provider; keep RPC configuration in `src/components/Providers.tsx`.
2. Default development to Polygon Amoy; mainnet requires explicit configuration and a visible network indicator.
3. Validate EVM addresses, reject zero/invalid POL amounts, and use bigint for token values.
4. Keep interactive wallet code in Client Components.
5. Handle wrong chain, rejected signatures, insufficient POL, failed receipts, stale subgraph indexing, missing wallet apps, and empty reserves.
6. Use the official MetaMask Connect and OKX Universal Provider APIs instead of undocumented custom schemes.

## Verification checklist

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npx hardhat compile`
- `npx hardhat test`
- Verify EIP-6963 desktop selection.
- Verify OKX in-app browser and mobile app handoff.
- Verify MetaMask extension, MetaMask Mobile deeplink, cancellation, and return flow.
- Verify `/staking` deposit, withdrawal, claim, NFT lock/unlock, APY update, and activity refresh on Amoy.
