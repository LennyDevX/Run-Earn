# RUN&EARN Polygon contract roadmap

RUN&EARN targets Polygon with standard EVM tooling. The current foundation is a Hardhat 3 / Solidity 0.8.36 project for Polygon Amoy first.

## Current foundation

### 1. `RUNEToken` ERC-20

`contracts/RUNEToken.sol` is the RUNE token with role-gated minting, pausable transfers, a 100M hard cap, and user burn support. It remains available for the legacy NFT reward path. Before production, treasury issuance must be controlled by a multisig and explicit emission budget.

### 2. `SneakerMint` ERC-721

`contracts/SneakerMint.sol` owns token IDs, metadata URI, proof uniqueness, rarity, and tier. Production minting uses `MINTER_ROLE`; public proof minting is an explicitly gated Amoy/beta path.

### 3. `SneakerStaking` POL vault

`contracts/SneakerStaking.sol` now accepts native POL deposits, tracks principal separately, calculates passive POL rewards, and pays them only from an admin-funded reserve. Users can lock SneakerMint NFTs; on-chain rarity/tier boosts their effective APY. `stakedTokenIds(owner)` supports the frontend unlock flow.

### 4. Subgraph activity index

The deployed `nuxgraph` Studio subgraph is consumed through the server-only `/api/subgraph` proxy. It should index deposits, withdrawals, POL reward claims, NFT locks, NFT unlocks, and legacy RUNE claims.

### 5. Verification registry — next production hardening

A verifier registry should store one-time commitments for physical sneaker purchases. Retail validation, raw photos, and personal data stay off-chain; the registry or signed verifier authorizes the wallet, URI, rarity, and tier.

## Planned contracts

6. **Benefits vault:** separate `SneakerVault` for discount, special-offer, early-access, and gift eligibility.
7. **Treasury and fee splitter:** distribute approved physical-sale or protocol-fee shares to rewards, operations, and reserves.
8. **Governance and parameter registry:** timelock APY, tier, treasury, pause, and migration changes; use a multisig on mainnet.
9. **Referral and transfer attribution:** prevent self-referrals, replay, spoofing, and unauthorized claims.
10. **Quest/activity attestations:** signed activity proofs without storing personal data.
11. **Merkle distribution:** optional one-time genesis claims with expiry and pause controls.

## Suggested order

1. Run Solidity + TypeScript tests for the three contracts, including POL reserve and NFT boost cases.
2. Deploy `RUNEToken`, `SneakerMint`, and `SneakerStaking` to Polygon Amoy.
3. Fund the POL reward reserve and verify deposit, claim, withdrawal, and NFT boost behavior.
4. Configure the `nuxgraph` query endpoint and verify `/api/subgraph` activity.
5. Add verifier authorization before production minting.
6. Complete custody, economic, and independent security review.
7. Add multisig/timelock controls before mainnet.
8. Build benefits, store integration, referrals, quests, and airdrops only after core invariants are stable.

## Toolchain

- Hardhat 3, ESM/declarative configuration, build profiles.
- Solidity 0.8.36 and OpenZeppelin Contracts 5.6.
- viem 2 and EIP-1193 wallets.
- Hardhat Solidity tests in `test/*.t.sol`.
- Mocha/viem integration tests in `test/*.ts`.
- The Graph Studio `nuxgraph` query proxy.
- Polygon Amoy for testnet deployment; Polygon mainnet only with multisig, deterministic builds, protected RPC endpoints, and independent audit.
