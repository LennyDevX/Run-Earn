# Airen treasury

Where protocol money comes from, where it lands, and what has to happen for it to
get there.

**Treasury address:** `0xe7448bC8c43379402308C3D95A62e0cD6Bd48cd7`

A dedicated wallet, separate from the deployer and from the admin that controls the
contracts. Receiving needs no gas, so an empty treasury is fine — but anything that
*spends* from it will need POL.

Every fact below was read from the deployed contracts, not from `.env`. The two
disagree more often than you would expect: the deploy script fills unset treasury
variables with the admin address, so a deployment that "never configured a
treasury" usually did, silently. That is exactly what happened here.

---

## The shape of it

Money reaches the treasury two ways. **Direct** paths are one hop and need nobody.
**Routed** paths are three hops and the first one needs the admin key — which is
the single most important thing to understand about this treasury.

```
  DIRECT — one hop, no key, nothing to remember

    veSneaker sale ──┐
    mod sale       ──┼──── .call{value:} ────►  ┌──────────────────────────┐
    x402 (USDC)    ──┘                          │  TREASURY                │
                                                │  0xe7448bC8…d48cd7       │
                                                └──────────────────────────┘


  ROUTED — three hops, and the first one is privileged

    marketplace sale
      (2.5% fee)
          │
          ▼
    ┌───────────────────────────────┐
    │  SneakerMarketplace           │
    │  accumulatedFees              │  ◄── money is HERE, not in the treasury
    └───────────────┬───────────────┘
                    │
                    │  ① withdrawFeesToCollector()
                    │     ADMIN ONLY — nobody else can move it
                    ▼
    ┌───────────────────────────────┐
    │  FeeSplitter                  │
    │  pendingFees                  │  ◄── money is HERE now
    │  recipients: [treasury] 100%  │
    └───────────────┬───────────────┘
                    │
                    │  ② distribute()
                    │     ANYONE — the split is deterministic, no griefing vector
                    ▼
    ┌───────────────────────────────┐
    │  TREASURY                     │
    └───────────────────────────────┘
```

### Why the distinction matters

A treasury balance of **0 POL** does not mean the protocol earned nothing. On the
routed path it can mean the money is sitting in the marketplace or the splitter,
waiting for a transaction nobody has sent.

Nothing reverts when that happens. No error appears anywhere. The balance just
stays at zero. That is the failure mode this document exists to make visible, and
it is why the public view shows `accumulatedFees` and `pendingFees` next to the
balance rather than only the balance.

---

## Where the money comes from

| Source | Contract | Path |
| --- | --- | --- |
| veSneaker sales — Sol $62, Luna $97, Astra $150 | `VeSneakerStore` | direct |
| Premium mod sales | `ModStore` | direct |
| AI collectible generation — $0.75 | `/api/generate-sneaker` | direct (USDC) |
| Marketplace sales — 2.5% fee | `SneakerMarketplace` | routed |

`SneakerSwap`, `SneakerTabArena`, `SneakerStaking`, `SneakerWorkshop` and
`SneakerMods` take no fees — checked in the source, not assumed.

---

## Current wiring

```
VeSneakerStore.treasury          0xe7448bC8…d48cd7
ModStore.treasury                0xe7448bC8…d48cd7
SneakerMarketplace.feeCollector  0xA0c71204…bC00e4   (FeeSplitter)
FeeSplitter recipients           [0xe7448bC8…d48cd7] @ 100%
```

Repointed in three admin transactions when the treasury wallet was replaced:

| Contract | Transaction |
| --- | --- |
| `VeSneakerStore.setTreasury` | `0x0b25d3421f7ff63ade08c54c802aef863299b69b38a0ec29a3704e8273bf6351` |
| `ModStore.setTreasury` | `0x246ff607840db664245056494a9f33b756f5173a1c46687d3e1332234c2bc2a5` |
| `FeeSplitter.setRecipients` | `0x5ce396e36d354d77912ff2d76906509fd123418d12bf0f131222bb68cec5e767` |

```bash
npx hardhat run scripts/treasury-audit.ts --network polygon
```

That script prints the same block above, read from the contracts. It is the cheap
way to answer "where does the money go?" without reading Solidity — and the way to
notice if a redeploy moved a destination.

### Why the splitter has one recipient

It was deployed with four slots at the recommended 40/30/20/10 — all four filled
with the same address, because `FEE_SPLITTER_*_ADDRESS` were unset and defaulted to
the admin. Four slots pointing at one wallet is not a split: `distribute()`
performed four transfers and three of them went to the same place.

Collapsed to a single 100% recipient (tx `0x5d13f270…`), then repointed to the
current treasury. That is what the deployment actually is.

**Reversible.** When distinct treasury / staking / redemption / team wallets exist,
re-run `scripts/set-treasury.ts` with the recipients re-expanded and the real split
comes back in one transaction.

---

## Moving the money

```bash
npx hardhat run scripts/collect-fees.ts --network polygon
```

Does both hops of the routed path. Run it after trading starts — it is a keeper,
not a one-off. It reports "nothing to move" when there is nothing, rather than
sending a transaction that reverts.

**Possible improvement:** making `withdrawFeesToCollector` permissionless on a
future redeploy would remove the admin dependency entirely. It is safe to open —
the destination is fixed and the amount is whatever accrued — and it would let the
same keeper that calls `distribute()` finish the job without a privileged key.

---

## Scripts

| Script | What it does | Privilege |
| --- | --- | --- |
| `treasury-audit.ts` | Prints every payout address, read from the contracts | none |
| `set-treasury.ts` | Repoints every payout address; idempotent | admin |
| `collect-fees.ts` | Withdraws marketplace fees and distributes them | admin |
| `treasury-yield.ts` | Reports idle POL and what it would earn | none |

---

## The public view

Built, at **`/treasury`** — linked from the Navbar (Project) and the Footer.

`src/hooks/useTreasury.ts` reads the balances and contract state; the page renders
them. It shows:

- POL and stablecoin balances
- **`accumulatedFees` and `pendingFees`** — the money that exists but has not moved
- Every payout destination, read from the contracts, with a warning if one points
  somewhere other than the treasury
- The fee split, read on-chain
- Movement, from the subgraph

Nothing on it is hardcoded. A treasury view exists so people can check the
protocol's finances without trusting a screenshot, and one that could drift from
the chain would be worse than none.

**Known gap:** the deployed subgraph schema has no address-indexed activity
entities, so the movement list is empty for every address — not just this one. The
page says so rather than pretending. The balances and pending figures are read
directly from the chain and are unaffected.

---

## Server Wallet: what it is good for here, and what it is not

thirdweb's Server Wallet (`Engine.createServerWallet`) is a wallet whose key
material thirdweb manages, reached through the project secret key.

**Not for holding the treasury.** It is a hot wallet reached with a backend secret.
Putting protocol funds in one would be a downgrade from the dedicated EOA the
treasury uses now, and it would move custody to a third party.

**Not for the arena signer either — and this was tested, not assumed.** A Server
Wallet was created successfully (`0x304870DCF5742b6120203Ad8D8b6A5Df1f4Cc466`,
label "Airen arena signer"), but the arena signer does not send transactions; it
**signs a digest**, and `SneakerTabArena._recover` is plain ECDSA:

```solidity
ecrecover(keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest)), v, r, s)
```

Measured with `scripts/verify-server-wallet-signing.mjs`:

| Signing with | Signature | Recovers to |
| --- | --- | --- |
| the signer address | 65 bytes | **a different address** (`0xEDE8c980…`) |
| the smart account address | 564 bytes | not ECDSA — an ERC-1271 blob |

Neither verifies. The contract would reject both, so **plan item 3.2 is not
implementable as written.** Swapping the signer without changing the contract would
break session completion, and the failure would appear at the player's wallet, far
from the cause.

The path that would work is **ERC-1271** (`isValidSignature`) instead of
`ecrecover`, which accepts both plain EOAs and smart accounts. That is a contract
change and an arena redeploy. Until then the raw `ARENA_SIGNER_PRIVATE_KEY` stays:
it works, and its blast radius is already bounded — the arena recomputes the
multiplier and clamps the score, so a leaked signer cannot mint unbounded boost.

**Not for the fee keeper.** `collect-fees.ts` needs the admin key solely because
`withdrawFeesToCollector()` is `DEFAULT_ADMIN_ROLE`. A Server Wallet would still
need that role — handing a hosted hot wallet full admin over the marketplace. The
better fix is the opposite: make the withdraw permissionless.

**Not for the public view.** It is read-only. Nothing signs.

---

## Known risks

**The treasury is a plain EOA.** One key controls it. A Safe multisig is the
standard for protocol funds and is the highest-value hardening step left. It was
considered and deliberately deferred — the current contracts already accept a
contract-address treasury (every payout uses `.call{value:}`, and there is not a
single `.transfer()` in the codebase that would break under a 2300-gas stipend), so
switching later is one idempotent script run.

**One key still administers all 15 contracts.** The treasury is now separate, which
removes the worst part of the previous setup — but the admin key can still repoint
the treasury, change fees, and mint. It should not also be a hot key.

**Marketplace fees need an admin transaction to move.** See the routed path above.
Until `withdrawFeesToCollector` is opened up, that revenue depends on someone
remembering to run the keeper.

**The treasury wallet is empty.** Nothing has been sold yet, so every figure here is
zero. The wiring is verified; the flow is not, because it has never run.
