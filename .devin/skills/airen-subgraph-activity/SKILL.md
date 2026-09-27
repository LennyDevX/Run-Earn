---
name: airen-subgraph-activity
description: Work with Airen's The Graph activity feed — the nuxgraph Studio deployment, the server-only /api/subgraph proxy, dynamic schema introspection, the field allowlist, address matching, and the useSubgraphActivity hook used by the staking, marketplace, game, workshop, and badges dashboards.
---

# Airen Subgraph Activity

Use this skill for `/api/subgraph`, `src/lib/subgraph.ts`, `src/hooks/useSubgraphActivity.ts`,
and the "Recent activity" feeds in `StakingVaultDashboard`, `MarketplaceDashboard`,
`SneakerGameDashboard`, `WorkshopDashboard`, and `BadgesDashboard`.

## Files

| File | Role |
| --- | --- |
| `src/lib/subgraph.ts` | Server-only client: schema introspection, query building, normalization |
| `src/app/api/subgraph/route.ts` | Route handler: `?address=0x...` → `{ activities, error? }` |
| `src/hooks/useSubgraphActivity.ts` | Client feed + `addLocalActivity` optimistic entries |
| `docs/subgraph-integration.md` | Deployment/config reference |

## Configuration

Resolved in this order inside `getSubgraphUrl()`:

1. `THE_GRAPH_QUERY_URL` — full endpoint, used as-is.
2. Otherwise `https://api.studio.thegraph.com/query/<THE_GRAPH_QUERY_API_KEY>/<THE_GRAPH_SUBGRAPH_SLUG>/<THE_GRAPH_SUBGRAPH_VERSION>`
   with defaults `nuxgraph` / `0.1.0`.

`THE_GRAPH_QUERY_API_KEY` is also sent as `Authorization: Bearer …`.

## Hard rules

- **Never** query The Graph from the browser. The key is server-only; the proxy exists so
  the key never reaches the client.
- The Graph **deploy key is not a query key**. Do not reuse it as
  `THE_GRAPH_QUERY_API_KEY`.
- Never commit Graph keys.
- If the schema does not expose an activity entity, return RPC state and an empty feed —
  never invent history.

## How the dynamic adapter works

`fetchSubgraphActivity(address)`:

1. `isAddress` validates the input; invalid → `{ configured: false, activities: [], error }`.
2. Introspects the schema (`__schema { queryType { fields } types { fields } }`).
3. Selects query roots whose name matches `ACTIVITY_ROOT_PATTERN`
   (`stake|unstake|deposit|withdraw|claim|reward|activity|position`).
4. Keeps roots that accept only `first|skip|where|orderBy|orderDirection` and that expose
   `first` when they take arguments; skips the rest.
5. Resolves the entity type, keeps scalar/enum fields present in `FIELD_ALLOWLIST`, and
   requires at least one address-like field (`ADDRESS_FIELD_PATTERN`).
6. Runs one combined query with `(first: 50)` on each selection.
7. Filters rows that actually contain the wallet address (recursive `findAddress`),
   normalizes via `normalizeActivity`, sorts by timestamp desc, and slices to 20.

`normalizeActivity` maps a row to `{ id, kind, label, amount?, tokenId?, timestamp?, transactionHash? }`,
preferring explicit `eventType|action|type` for the label and
`amount|value|principal|reward|rewards|newPrincipal` for the amount.

## Extending the adapter

- New scalar field on an entity → add it to `FIELD_ALLOWLIST`.
- New event root that does not match the pattern → extend `ACTIVITY_ROOT_PATTERN`.
- New address-bearing field name → extend `ADDRESS_FIELD_PATTERN`.
- Keep changes additive; a rejected root just drops that entity from the feed.

## Recommended indexed events

| Contract | Events |
| --- | --- |
| `SneakerStaking` | `POLDeposited`, `POLWithdrawn`, `POLRewardsClaimed`, `Staked`, `Unstaked` |
| `SneakerMarketplace` | `ListingCreated`, `NFTSold`, `AuctionSettled`, `OfferAccepted` |
| `SneakerGame` | `Activated`, `PointsClaimed`, `Repaired`, `Redeemed` |
| `SneakerMods` | `ModMinted`, `ModBurned`, `AchievementClaimed` |
| `SneakerWorkshop` | `ModEquipped`, `ModUnequipped`, `AbilityUsed`, `Forged` |
| `SneakerSwap` | `SwapCreated`, `SwapAccepted`, `SwapCancelled` |
| `ModRental` | `RentalListed`, `ModRented`, `ModReturned`, `RentalExtended`, `RentalCancelled` |
| `ModStore` | `ModPurchased` |

Until these are indexed, the dashboards still show RPC state and the local optimistic
entries from `addLocalActivity(label, hash)`.

## Client hook

`useSubgraphActivity(address)` returns `{ activities, isLoading, error, refresh, addLocalActivity }`.

- `refresh()` fetches `/api/subgraph?address=…` with `cache: "no-store"`.
- `addLocalActivity(label, hash)` prepends an optimistic entry (max 20) so a confirmed
  transaction shows instantly, before indexing catches up.
- Pattern in dashboards: `runAction()` → send tx → `addLocalActivity` → `refresh()` +
  `refreshActivity()`.

## Failure modes

- Endpoint missing → `configured: false`, feed empty, no crash.
- Invalid address → explicit error, feed empty.
- Schema without activity entities → `"The subgraph schema has no address-indexed activity entities yet."`
- Graph errors → joined `errors[].message` surfaced in `error`.

## Verification

- `npm run lint`, `npm run typecheck`, `npm run build`.
- `GET /api/subgraph?address=0x<valid>` and `?address=not-an-address` should return
  structured JSON, never a 500.
- Confirm the key never appears in the built client bundle (`grep` the `.next` output).
