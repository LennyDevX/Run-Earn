# RUN&EARN Subgraph integration

## Current deployment

The deployed Subgraph Studio project is configured as:

- Slug: `nuxgraph`
- Version label: `0.1.0`
- Network: Polygon
- Frontend route: `/staking`
- Server proxy: `/api/subgraph?address=<wallet>`

The deployment key shown in Subgraph Studio is for Graph CLI deployment and administration. It is **not** the query API key and must not be committed or placed in a public `NEXT_PUBLIC_*` variable.

## Environment configuration

Use a query API key created from the Studio API Keys section, or paste the exact query endpoint shown by Studio:

```env
THE_GRAPH_QUERY_URL=https://api.studio.thegraph.com/query/<QUERY_API_KEY>/nuxgraph/0.1.0
THE_GRAPH_QUERY_API_KEY=<QUERY_API_KEY>
THE_GRAPH_SUBGRAPH_SLUG=nuxgraph
THE_GRAPH_SUBGRAPH_VERSION=0.1.0
```

`THE_GRAPH_QUERY_URL` and `THE_GRAPH_QUERY_API_KEY` are server-only values. The Next.js route handler forwards the request to The Graph and keeps the key out of the browser bundle.

If `THE_GRAPH_QUERY_URL` is omitted, the app builds the Studio endpoint from the query API key, slug, and version. If no query key is configured, the staking UI continues to work from RPC reads and displays an empty indexed activity state.

## API route

`src/app/api/subgraph/route.ts` accepts a wallet address and calls `fetchSubgraphActivity` from `src/lib/subgraph.ts`:

```text
GET /api/subgraph?address=0x...
```

The server client first introspects the deployed schema, discovers address-indexed activity entities, queries scalar activity fields, normalizes them, and returns the latest 20 events. This avoids hard-coding a schema that may change between subgraph versions.

The normal response shape is:

```json
{
  "configured": true,
  "activities": [
    {
      "id": "...",
      "kind": "stakes",
      "label": "Stake",
      "amount": "1000000000000000000",
      "tokenId": "1",
      "timestamp": 1720000000,
      "transactionHash": "0x..."
    }
  ],
  "error": null
}
```

The UI also adds locally confirmed transactions immediately, then refreshes from the subgraph. This makes the activity panel responsive while indexing catches up.

## Expected schema behavior

The dynamic adapter looks for root query fields containing terms such as `stake`, `unstake`, `deposit`, `withdraw`, `claim`, `reward`, `activity`, or `position`. It filters rows by address-like fields (`owner`, `user`, `account`, `wallet`, `staker`, `depositor`, and related fields).

For best results, the subgraph should index the current contract events:

- `POLDeposited(owner, amount, newPrincipal)`
- `POLWithdrawn(owner, amount, remainingPrincipal)`
- `POLRewardsClaimed(owner, amount)`
- `Staked(owner, tokenId, rarity, tier)`
- `Unstaked(owner, tokenId)`
- `RewardsClaimed(owner, amount)`
- Marketplace: `ListingCreated`, `NFTSold`, `AuctionSettled`, `OfferAccepted`
- Game: `Activated`, `PointsClaimed`, `Repaired`, `Redeemed`
- Upgrade economy: `ModMinted`, `ModBurned`, `AchievementClaimed`, `ModEquipped`,
  `ModUnequipped`, `AbilityUsed`, `Forged`, `SwapCreated`, `SwapAccepted`,
  `SwapCancelled`, `RentalListed`, `ModRented`, `ModReturned`, `ModPurchased`

Recommended entity fields are `id`, an address field, `amount`/`value`, `tokenId`, `timestamp`/`blockTimestamp`, and `transactionHash`.

If the current deployed schema does not expose these fields yet, publish a new subgraph version after updating the mappings. The staking route will still read the live contract state through RPC, but indexed activity will remain empty until the schema includes address-indexed entities.
