---
name: runearn-mint-studio
description: Build and debug Run-Earn's AI mint studio — the photo → Gemini artwork → metadata → SneakerMint NFT pipeline on /mint, the /api/generate-sneaker route, proof hashing, rarity→tier mapping, and the local minted-sneaker collection store.
---

# Run-Earn AI Mint Studio

Use this skill for the `/mint` route, `SneakerMintStudio`, the `/api/generate-sneaker`
route handler, `src/lib/sneaker-nft.ts`, and the local minted-sneaker store.

## Files

| File | Role |
| --- | --- |
| `src/app/mint/page.tsx` | Route shell (metadata, Navbar/main/Footer) |
| `src/components/SneakerMintStudio.tsx` | 4-step wizard: Photo → AI Art → Details → Mint |
| `src/app/api/generate-sneaker/route.ts` | Server-only Gemini image generation |
| `src/lib/sneaker-nft.ts` | Rarities, palettes, token URI/metadata, localStorage store |
| `src/hooks/useMintedSneakers.ts` | React store for the local collection |
| `src/components/MyNftsGallery.tsx` | `/my-nfts` gallery (reads the same store) |
| `src/components/SneakerArtwork.tsx` | Shared PNG artwork display for the Astra/Sol/Luna family designs |
| `src/lib/sneaker-artwork.ts` | Resolves tokenURI metadata while preserving embedded AI artwork |
| `src/lib/contracts.ts` | `sneakerMintAbi` (mint, traits, enumerable reads, `tokenURI`) |

## Pipeline

1. **Photo** — `selectPhoto` accepts `image/*`, previews via `URL.createObjectURL`, and
   moves to step 1. Reject non-images with a clear error.
2. **AI Art** — `generateArtwork` POSTs `FormData{ photo, style }` to
   `/api/generate-sneaker`. The `style` hint carries the selected rarity label and the
   palette colors so the artwork theme matches the metadata.
3. **Details** — name, description, rarity, palette. `RARITIES` supplies the label,
   multiplier, and boost label.
4. **Mint** — `mintSneaker` computes the proof, encodes `mintWithProof`, sends it through
   `wallet.sendContractCall`, waits for the receipt, then persists locally.

## `/api/generate-sneaker`

- `runtime = "nodejs"`, `maxDuration = 120`.
- Model: `gemini-3.1-flash-image` through `@google/genai`:
  `ai.interactions.create({ model, input: [{ type: "text" }, { type: "image", mime_type, data }] })`
  and read `interaction.output_image` (`{ data, mime_type }`).
- Response: `{ imageBase64, mimeType }`; the client wraps it as
  `data:<mime>;base64,<data>`.
- Guard rails: require `GEMINI_API_KEY` (503), validate `image/*` (400), enforce the 8 MB
  cap (413), surface model failures as 502.
- The `BASE_PROMPT` preserves the sneaker's silhouette and colorway and forbids text,
  watermarks, and extra objects. Keep it if you change the style hint.

## Proof hash and duplicate prevention

- The proof is the SHA-256 of the generated data URL:
  `crypto.subtle.digest("SHA-256", new TextEncoder().encode(dataUrl))`, hex-encoded as
  `0x…`.
- `SneakerMint` stores used proofs and reverts on reuse, so regenerating the artwork
  yields a new proof and therefore a new token.
- Never derive the proof from the original photo — it would leak nothing but would make
  retries collide with the first mint.

## Rarity → tier mapping

`SneakerMint` bounds tier to `0..3` (Common, Rare, Epic, Mythic). The studio maps rarity
with `RARITIES.findIndex(item => item.id === rarity)`. That tier drives:

- staking APY boost (`SneakerStaking` tier bonuses `[50, 80, 150, 180]` bps),
- game earn rate (`SneakerGame.tierBasePointsPerDay` — the tier base is then scaled by
  the rarity-derived `powerOf` multiplier),
- appraiser tier value (`SneakerAppraiser.tierValues`).

The chosen rarity value itself also feeds `powerOf` (`5000 + rarity × 100` bps) and
`maxEnergyOf` (`2 + rarity/20`), so a higher-rarity mint earns faster and holds more
energy charges.

Keep the order stable; changing it silently re-prices every existing NFT.

## Local collection store

- Key: `runearn:my-nfts:<lowercased address>` (or `guest`), JSON array of `MintedSneaker`.
- `saveMintedSneaker` prepends and writes; `notifyMintedSneakersUpdated()` dispatches
  `runearn:nfts-updated`, which `useMintedSneakers` listens for (plus the `storage` event
  for cross-tab sync).
- This store is a UX convenience, not ownership. On-chain ownership is
  `useOwnedSneakers` (`balanceOf` + `tokenOfOwnerByIndex` + `traitsOf` + `tokenURI`).
  `resolveSneakerArtwork` preserves embedded AI-generated image data; it only substitutes
  the Astra/Sol/Luna catalog art for family-tagged or legacy `pixel://vesneaker/` store NFTs.

## Failure modes to handle

- `NEXT_PUBLIC_SNEAKER_MINT_ADDRESS` missing → mint is skipped and the NFT is saved
  locally only (`mintedHash = "local"`). Keep this demo path working.
- Wallet not connected or wrong chain → `sendContractCall` throws; show the error inline.
- `publicMintEnabled === false` on the contract → `mintWithProof` reverts; surface the
  revert reason rather than a generic failure.
- AI timeout / no image → keep the user on step 1 so they can retry without re-uploading.

## Security rules

- `GEMINI_API_KEY` is server-only. Never move it to `NEXT_PUBLIC_*` or log it.
- Do not persist raw photos. Only the generated artwork is embedded in the token URI.
- Production minting should go through `mintAuthorized` with `MINTER_ROLE` once the
  verifier registry exists; `mintWithProof` is the gated beta path.
- Token URIs are base64 data URLs — keep images reasonably sized to avoid blowing up
  transaction calldata.

## Verification

- `npm run lint`, `npm run typecheck`, `npm run build`.
- Manual: upload a photo → generate → change rarity/palette → mint → confirm the tx link
  and that `/my-nfts` shows the new card.
- Contract side: `npx hardhat test solidity` covers `mintWithProof`, proof reuse, rarity
  and tier bounds.
