# Airen v3.0 — plan

Successor to [`Plan_Update_v2.0.md`](Plan_Update_v2.0.md). v2.0 shipped the payment
surface, the in-app wallet, the treasury and the agentic manifest; v2.1 shipped the
mobile pass. This plan is what the codebase actually needs next, written from what
was measured while building those — not from a wish list.

**State it starts from:** 397 Solidity + 159 Mocha tests passing, 15 contracts
verified on Polygon mainnet, 14 routes, zero revenue, one admin key, no audit, no
public domain.

---

## Phase 1 — Security: the things that are true today

These are not improvements. They are exposures that exist right now.

| # | Item | Why |
| --- | --- | --- |
| 1.1 | **Move all 15 contracts to a multisig admin** | One EOA can repoint the treasury, change fees and mint. This is the single largest risk in the project and it costs one script run per contract |
| 1.2 | **Redeploy `SneakerGame` with the redeem fix** | The 10^18 bug is fixed in source but mainnet still runs the old code. `redemptionEnabled` is false so it is latent — redeploy before it is ever switched on |
| 1.3 | **Independent audit** | 556 tests are not an audit. The contracts hold user funds; this is the gate before any marketing |
| 1.4 | **Rotate every credential leaked during v2.0** | Alchemy and Uniswap keys circulated in plain text. The Alchemy key is now in `NEXT_PUBLIC_*` and ships to every browser |
| 1.5 | **Alchemy domain allowlist** | Without it, the public RPC key is spendable by anyone who views source |

**Exit:** no single key controls protocol funds; no live contract runs known-buggy math.

---

## Phase 2 — Correctness: close what the tests cannot see

| # | Item | Why |
| --- | --- | --- |
| 2.1 | **Verify the event decode against a real wallet** | `src/lib/activity.ts` declares event signatures from contract names. A mismatch means that event silently never appears — no error, just an empty row |
| 2.2 | **Reconcile the mod catalog with `ModStore.addDesign`** | Boost and Skill `effectBps`/`pricePol` in `mod-items.ts` are proposals. If they differ from what the store charges, the UI advertises one price and the contract takes another |
| 2.3 | **A test for `/api/generate-sneaker`** | The grading logic is now covered (22 tests) but the route around it — validation, rate limit, daily budget, x402 gate, error paths — is not |
| 2.4 | **`verify-wiring.ts` in the deploy path** | It passes 20/20 but nothing runs it automatically. A deploy that skips it can wire two contracts that should not talk |
| 2.5 | **Fix the `mod-artwork-prompts.md` indentation** | A stray indent turned a bullet into a nested item; the doc no longer renders as intended |

---

## Phase 3 — Performance: the numbers nobody has measured

v2.0 cut RPC fan-out by an order of magnitude. What is missing is **evidence that it
helped**, and the remaining costs.

| # | Item | Why |
| --- | --- | --- |
| 3.1 | **Baseline Lighthouse — measured, budget failing** | Median of 3 mobile runs with throttling. Before 3.8: `/` perf 78, `/collection` and `/marketplace` a11y 94. Re-run after 3.8: a11y 100 on every route, perf 81–83, LCP 4.5–4.8 s (unchanged). CLS 0 everywhere. | Two assertions were broken by the config (`"//"` keys parsed as audits), now fixed. Reports stay on disk. `@lhci/cli` pinned to 0.15.1. NO_NAVSTART is intermittent: 2 of 4 runs in one session failed before a clean pass |
| 3.2 | **`/api/activity` cost — retracted** | The 0.2 s figure measured the error path, not a query. Alchemy's free tier rejects `eth_getLogs` over 10 blocks, every 5,000-block window failed, and a silent `catch` turned that into an empty list. The route now returns the error. | Caught by reading the response body, not by latency |
| 3.3 | **Bundle per route — verified** | Initial JS on `/`: 1,006 KB raw, 305 KB gzip (`/game`: 1,043 KB, 315 KB). x402 and Trails are absent from the initial chunks. thirdweb appears only in a 52 KB (11 KB gzip) initial chunk, a stub; the SDK is lazy. The remainder is shared shell, not broken down further. | Measured from the built HTML against the emitted chunk files |
| 3.4 | **Skeletons on the dashboards** — done. The activity feeds, treasury stats, the veRUNE and staking balances now show a placeholder shaped like the value until the first read completes, instead of `0`, `…`, or stale copy saying "Indexing latest events from The Graph". Gated on an `isReady` flag per hook, because `isLoading` starts `false` and cannot tell "not read yet" from "read, empty" | Measured: `useActivity` rendered "No recent activity" for the first frame, before any request existed |
| 3.5 | **`eth_getLogs` feed — fixed in code, blocked on data source** | Three bugs found while checking it against the chain. The event match never fired, because `topic0` was read from `parseAbiItem`, which does not provide it. Amounts were never decoded, so every label would read `0 POL`. The free-tier RPC also rejects any range over 10 blocks. Both code bugs are fixed and checked against the one real deposit (1 POL). The protocol has 11 logs in its entire history, so the feed has almost nothing to show yet. | Reported as done earlier; it was not. The UI now shows an explicit unavailable message instead of 'no activity'. The data source still needs a decision |
| 3.6 | **Real streaming (server-fetched first paint)** — separate project. Suspense only suspends on a promise handed to the client by the server or `use()`. Every dashboard reads inside `useEffect`, so a `<Suspense>` around them would never show its fallback. Requires moving the first read server-side and passing a promise down; touches the three hooks and their pages | Deferred deliberately: it is a refactor of the data layer, not a visual fix |
| 3.7 | **LCP on every route — diagnosed, not fixed** | Simulated LCP 4.5–4.8 s against a 2.5 s budget, which is the report's headline number. Observed in the trace it is 2.2 s, unthrottled. The element is the first STAKING BOOST paragraph: it is in the server HTML, not hidden, and not behind a Suspense boundary. Ruled out: network (no request ends after 2.5 s), fonts (`display: swap`), reveal opacity (the card is outside `.reveal`), animation delays (≤240 ms), TTFB (12 ms). Not explained: about 1.2 s between the h1 paint at 0.9 s and this paragraph at 2.2 s | Next step is a paint-level trace, or a bisect that removes the grid and re-measures. Not guessed at |
| 3.8 | **A11y — 100 on all four routes** — done. Contrast floor raised from `text-foreground/40` and `/45` to `/55` across 34 files. 40% opacity is 3.56:1 on the surface, below the 4.5:1 AA minimum for small text. Heading levels corrected where they skipped a level. Two buttons lost an `aria-label` that did not match their visible text, so their name now comes from the content | The contrast change is a visual decision: the opacity-based hierarchy is quieter now. It is one token, so it is reversible |

---

## Phase 4 — Deeper AI

The AI currently does two things: grade a photo, and render it. Both are one-shot and
stateless. The interesting work is making it *remember* and *act*.

| # | Item | Why |
| --- | --- | --- |
| 4.1 | **Collector memory** — done, narrow. The grader receives the palette counts of the collector's own NFTs (validated ids, at most 50) and uses them only for the name and the copy. Rarity signals are judged from the photo alone. Silhouette memory is not built: the local store does not keep silhouettes | Variety in naming without giving a rarity lever to the prompt |
| 4.2 | **Provenance on-chain** — done, no contract change. Each token URI now carries `provenance`: prompt version, prompt fingerprint, analysis and image models, style and timestamp. It is written by `mintCollectibleWithProof`, so it lives on-chain. Not verified with a real mint | A piece can be traced to the prompt and models that made it |
| 4.3 | **Pre-flight grade** — done. The analysis pass already ran before the paid render; it now decides usability (`isSneaker`, `usable`, `rejectReason`) and answers 422 before the render. The x402 wrapper does not settle a response of 400 or more, so a rejected photo should not be charged. That comes from reading the library source, not from a live payment | Unusable photos are refused before the $0.75 render |
| 4.4 | **Agent-readable mint** — done: `GET /api/mint-catalogue` lists tiers, inputs, outputs, rejection reasons and the prompt version. Payment stays in `/.well-known/x402`, one source. Discovery from the manifest is not wired yet | An agent can read the rules without reading the source |
| 4.5 | **Prompt/version registry** — done. Prompts, schema and the gate live in `src/lib/collectible-pipeline.ts` with `PROMPT_VERSION` and a fingerprint over the exact text, written into every token's provenance | Two pieces can be told apart by what produced them |
| 4.6 | **Verify with a live model** — blocked. The `GEMINI_API_KEY` in `.env` returns 403 on every model, including text-only calls to `gemini-2.5-flash`. The key lacks access, so generation fails in this environment. Until it is fixed, 4.1 to 4.3 are covered by unit tests but not by a real model response | The gate is fail-closed: if the model omits the new fields, every photo is refused |

---

## Phase 5 — Blockchain depth

| # | Item | Why |
| --- | --- | --- |
| 5.1 | **ERC-1271 verification in the arena** | The contract uses raw `ecrecover`, which is why a thirdweb Server Wallet cannot sign sessions. Verifying through `isValidSignature` accepts both plain EOAs and smart accounts and unblocks 3.2 of the v2.0 plan |
| 5.2 | **`withdrawFeesToCollector` permissionless** | Safe to open — the destination is fixed and the amount is whatever accrued — and it removes the admin key from the keeper entirely |
| 5.3 | **Batch the remaining approve+action pairs** | `equip`, `list`, `listAtAppraisal` and `createAuction` are batched. `SneakerSwap.create` and the offer flows still cost two prompts |
| 5.4 | **Treasury as a Safe** | The contracts already accept a contract-address treasury — every payout uses `.call{value:}` and there is no `.transfer()` anywhere. Switching is one idempotent script run |
| 5.5 | **A public domain** | It is the single blocker behind four separate items: veSneaker metadata, the Polygon catalogue listing, the ERC-8004 agent card, and any real user |

---

## Phase 6 — UI/UX

| # | Item | Why |
| --- | --- | --- |
| 6.1 | **Transaction toasts** | Feedback is inline per-component. A stack that survives navigation is what makes a multi-step flow feel like one action |
| 6.2 | **Optimistic UI on the write paths** | The nav highlight is optimistic; the contracts are not. Equipping, listing and activating all wait for a receipt before showing anything |
| 6.3 | **Skeletons that match the real cards** | `RouteSkeleton` approximates the shape. A card grid whose skeleton is a different height still jumps |
| 6.4 | **"System" theme** | The toggle is a two-position slider and cannot express three states. It needs a different control, not another option |
| 6.5 | **Empty states that teach** | A wallet with no NFTs sees "0". It should see what to do next — and that is the first screen a new user meets |
| 6.6 | **Copy-to-clipboard everywhere** | Added for the in-app wallet only. Every address in the app should copy on tap |

---

## What this plan deliberately excludes

- **Agglayer.** Evaluated in v2.0 and still wrong: Airen is single-chain, and there
  is nothing to unify. The trigger to revisit is a second chain with real assets.
- **Push notifications.** Justified by the 24h loop, but it needs a service worker,
  VAPID and a backend scheduler. Its own project.
- **Passkeys.** The biggest onboarding jump available, but it needs smart accounts
  and a contract change — and 5.1 is the prerequisite.
- **Treasury yield.** Measured at zero idle POL. There is no economy to optimise
  until something sells.

---

## Ordering, and why

**1 → 2 → 5.5 → 3 → 4 → 6.**

Security first because the exposures are live. Correctness second because several
items are silent failures that will mislead whoever debugs next. Then the domain,
because it unblocks four separate items at once. Performance only once there is a
baseline to compare against. AI and UX last, because both are worth doing well and
neither is worth doing on top of an unaudited contract set.
