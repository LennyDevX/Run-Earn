# thirdweb gas sponsorship — policies and the server verifier

Everything needed to configure, constrain, and verify gas sponsorship for Airen's
in-app wallet. Written against thirdweb v5 and the project as deployed to Polygon
mainnet.

---

## What is being sponsored

The in-app wallet is created with:

```ts
inAppWallet({ executionMode: { mode: "EIP7702", sponsorGas: true } })
```

`EIP7702` upgrades the account in place — same address, no second deployment — and
`sponsorGas` makes thirdweb's paymaster pay the gas. The user needs **no POL**.

Polygon activates EIP-7702 through **PIP-61** (the Pectra EIPs), so the mainnet
configuration is valid. On a chain without 7702, thirdweb falls back to ERC-4337
and the address changes.

---

## The risk that makes a verifier mandatory

**`sponsorGas: true` with no policy sponsors every transaction from every in-app
wallet.**

The in-app wallet is created by anyone with an email address. Without a policy,
the project pays the gas for *any* transaction that wallet chooses to send, to
*any* contract, forever. That is an unbounded, unauthenticated spend — the
sponsorship equivalent of an open proxy.

A policy is therefore not a tuning knob. It is the control that makes turning
sponsorship on safe at all.

---

## Where policies live

**Dashboard → your project → Account Abstraction → Settings.**

Five kinds, combinable:

| Policy | What it does | Fit for Airen |
| --- | --- | --- |
| **Global spend limit** | Caps total sponsorship spend | Useful backstop |
| **Chain restriction** | Sponsors only on listed chains | Pin to Polygon (137) |
| **Contract restriction** | Sponsors only calls to listed contracts | **The main control** |
| **Wallet allow/deny** | Includes or excludes specific addresses | For support cases, not abuse |
| **Server verifier** | Your backend decides per transaction | **Implemented here** |

The dashboard's contract restriction and the server verifier overlap. The verifier
is preferred because the decision lives in version control next to the contracts,
rather than in a dashboard list that silently drifts when a contract is redeployed.

---

## The server verifier contract

Configure it in the dashboard by pointing at Airen's endpoint and adding any
headers it needs.

### thirdweb → your endpoint

```http
POST https://<your-domain>/api/verify-sponsorship
Content-Type: application/json
Referer: https://api.thirdweb.com
# + any custom headers configured in the dashboard

{
  "clientId": "string",
  "chainId": 137,
  "userOp": {
    "sender": "0x...",
    "targets": ["0x..."],
    "gasLimit": "string",
    "gasPrice": "string",
    "data": {
      "targets": ["0x..."],
      "callDatas": ["0x..."],
      "values": ["0x..."]
    }
  }
}
```

A single call arrives under `userOp.targets`; a **batched** call arrives under
`userOp.data.targets` with the calldata in `userOp.data.callDatas`. Both must be
read — checking only one silently breaks either the single-call or the batched
path.

### Your endpoint → thirdweb

```json
{ "isAllowed": true }
{ "isAllowed": false, "reason": "optional, for your own logs" }
```

Return **HTTP 200** either way. A non-200 is read as a verifier outage, not as a
decision.

---

## Airen's implementation

`src/app/api/verify-sponsorship/route.ts`

**The policy: sponsor calls to Airen's own contracts, refuse everything else.**

The allowlist is built from the same `NEXT_PUBLIC_*` contract addresses the
frontend already uses, so a redeploy updates the policy with no code change.

Decisions worth knowing:

- **Fails closed.** If no contract addresses are configured, every request is
  refused. An unconfigured deployment must never hand out free gas for the whole
  network.
- **`Referer` is not authentication.** thirdweb sends it, but it is a
  client-supplied header. The endpoint holds no secret and changes no state, so it
  is safe to leave public: the worst a direct caller learns is which addresses are
  allowlisted, and those are public on-chain.
- **No address or calldata in the logs.** The route runs per user transaction and
  the wallet address is personal data. Only the count of refused targets is
  logged.
- **Both target shapes are read**, so batching does not silently stop being
  sponsored.

### Not yet done: selector-level policy

Target-level allowlisting blocks the abuse that matters — spamming an unrelated
contract on Airen's gas. A second pass could pin the **function selectors**, so
only game actions are sponsored (`activate`, `equip`, `useAbility`, the tab arena)
and not, say, an NFT transfer out of the wallet.

It is a deliberate next step rather than an oversight: selectors change with every
contract edit, and a stale list stops sponsoring real gameplay — a silent
regression that only shows up as users being asked for gas.

---

## Configuring the dashboard

1. **Dashboard → project → Account Abstraction → Settings**
2. **Server verifier:** set the URL to `https://<your-domain>/api/verify-sponsorship`
3. Add any custom headers the endpoint requires (none today)
4. Set a **global spend limit** as a backstop — the verifier decides *what* is
   sponsored, the limit caps *how much*
5. Restrict the **chain** to Polygon (137)

The verifier URL must be publicly reachable. It cannot be `localhost`, so
sponsorship cannot be exercised against a local build — see the verification
section.

---

## Verifying sponsorship works

**The clean test, and it needs no POL.** `PlayerProgress.setUsername` is
`external` with no role gate — only a length bound — so any wallet can call it,
and it costs gas and nothing else.

1. Connect the in-app wallet (it has **0 POL**)
2. Go to `/profile` and set a username
3. **Succeeds with 0 POL → the gas was sponsored.** Fails for funds → it was not.

### Verifying the account really is an EIP-7702 smart account

An upgraded EOA has **code**, where a plain EOA has none. Read it directly:

```bash
cast code <wallet-address> --rpc-url $POLYGON_RPC_URL
```

A delegation designator starts with `0xef0100` followed by the delegate address.
Empty output means the account has not been upgraded — which is expected until the
first transaction, since the upgrade is applied on send.

### What cannot be verified locally

The verifier URL must be public, so a local run sponsors everything (no verifier
is reachable). That means **the policy is only exercised in a deployed
environment.** Until then, treat it as written-but-unproven and test it on the
first preview deploy, not on production traffic.

---

## Reading sponsorship activity

thirdweb's dashboard shows the transactions it executed and whether each was
sponsored. That is the fastest way to confirm the policy is behaving — a spike in
sponsored calls to an unexpected target means the allowlist is wrong.

---

## Summary of the moving parts

| Piece | Where | Status |
| --- | --- | --- |
| `sponsorGas: true` | `src/lib/in-app-wallet.ts` | Done |
| Verifier endpoint | `src/app/api/verify-sponsorship/route.ts` | Done |
| Contract allowlist | `NEXT_PUBLIC_*` addresses in `.env` | Done |
| Dashboard: verifier URL | thirdweb dashboard | **Pending** |
| Dashboard: spend limit + chain | thirdweb dashboard | **Pending** |
| Selector-level policy | `route.ts` | Deliberately deferred |
| End-to-end proof | deployed environment | **Pending** |
