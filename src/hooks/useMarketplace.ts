"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { encodeFunctionData, getAddress, isAddress, type Address } from "viem";
import { usePolygonWallet } from "@/components/Providers";
import { sneakerMarketplaceAbi, sneakerMintAbi } from "@/lib/contracts";
import { resolveSneakerArtwork } from "@/lib/sneaker-artwork";
import { useContractTransaction } from "@/hooks/useContractTransaction";
import type { OwnedSneaker } from "@/hooks/useOwnedSneakers";
import { useSneakerOwnership } from "@/components/SneakerOwnershipProvider";

const marketplaceAddressEnv = process.env.NEXT_PUBLIC_SNEAKER_MARKETPLACE_ADDRESS;
const sneakerMintAddressEnv = process.env.NEXT_PUBLIC_SNEAKER_MINT_ADDRESS;

export type Listing = {
  listingId: bigint;
  seller: Address;
  tokenId: bigint;
  price: bigint;
  listedAt: bigint;
  active: boolean;
};

export type Auction = {
  auctionId: bigint;
  seller: Address;
  tokenId: bigint;
  startPrice: bigint;
  highestBidder: Address;
  highestBid: bigint;
  endTime: bigint;
  active: boolean;
  settled: boolean;
};

export type Offer = {
  offerId: bigint;
  buyer: Address;
  tokenId: bigint;
  amount: bigint;
  expiresAt: bigint;
  active: boolean;
};

export type MyListing = Listing & OwnedSneaker;

export function useMarketplace() {
  const wallet = usePolygonWallet();
  const transaction = useContractTransaction();
  const [myListings, setMyListings] = useState<MyListing[]>([]);
  const [saleKinds, setSaleKinds] = useState<Map<string, bigint>>(new Map());
  const [suggested, setSuggested] = useState<Map<string, bigint>>(new Map());
  const [isReading, setIsReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);

  const configured = Boolean(
    marketplaceAddressEnv &&
    sneakerMintAddressEnv &&
    isAddress(marketplaceAddressEnv) &&
    isAddress(sneakerMintAddressEnv),
  );
  const marketplaceAddress = useMemo<Address | null>(
    () => (configured ? getAddress(marketplaceAddressEnv as string) : null),
    [configured],
  );
  const sneakerAddress = useMemo<Address | null>(
    () => (configured ? getAddress(sneakerMintAddressEnv as string) : null),
    [configured],
  );

  // Both kinds list here: veSneakers at a seller-set price, collectibles at the
  // appraiser's. This is the one surface that must NOT filter to `playable`.
  const owned = useSneakerOwnership();

  const refresh = useCallback(async () => {
    if (!wallet.address || !marketplaceAddress || !wallet.publicClient) {
      setMyListings([]);
      setSaleKinds(new Map());
      setSuggested(new Map());
      return;
    }

    setIsReading(true);
    setReadError(null);
    try {
      const tokenIds = owned.sneakers.map((s) => s.tokenId);

      // Read sale lock state and suggested price for each owned NFT.
      const [kinds, prices] = await Promise.all([
        Promise.all(
          tokenIds.map((tokenId) =>
            wallet.publicClient
              .readContract({
                address: marketplaceAddress,
                abi: sneakerMarketplaceAbi,
                functionName: "tokenSaleKind",
                args: [sneakerAddress as Address, tokenId],
              })
              .catch(() => 0n),
          ),
        ),
        Promise.all(
          tokenIds.map((tokenId) =>
            wallet.publicClient
              .readContract({
                address: marketplaceAddress,
                abi: sneakerMarketplaceAbi,
                functionName: "suggestedPrice",
                args: [tokenId],
              })
              .catch(() => 0n),
          ),
        ),
      ]);

      const kindMap = new Map<string, bigint>();
      tokenIds.forEach((tokenId, idx) => kindMap.set(tokenId.toString(), kinds[idx] as bigint));
      setSaleKinds(kindMap);

      const priceMap = new Map<string, bigint>();
      tokenIds.forEach((tokenId, idx) => priceMap.set(tokenId.toString(), prices[idx] as bigint));
      setSuggested(priceMap);

      // Scan recent listing IDs for active listings owned by this wallet.
      // The contract does not expose an enumerable listing index, so we scan
      // the last N listing slots and keep the ones that match. Mobile scans a
      // shorter window to keep the RPC fan-out cheap on cellular.
      const scanLimit = wallet.isMobile ? 24 : 64;
      const listingIds = Array.from({ length: scanLimit }, (_, i) => BigInt(i + 1));
      const listings = await Promise.all(
        listingIds.map((listingId) =>
          wallet.publicClient
            .readContract({
              address: marketplaceAddress,
              abi: sneakerMarketplaceAbi,
              functionName: "listings",
              args: [listingId],
            })
            .catch(() => null),
        ),
      );
      const mine = await Promise.all(listings.map(async (raw, idx): Promise<MyListing | null> => {
        if (!raw) return null;
        const [seller, , tokenId, price, listedAt, active] = raw as readonly [Address, Address, bigint, bigint, bigint, boolean];
        if (!active || seller.toLowerCase() !== wallet.address?.toLowerCase()) return null;
        const sneaker = owned.sneakers.find((item) => item.tokenId === tokenId);
        const [traits, tokenUri, kind] = sneaker
          ? [null, null, null]
          : await Promise.all([
              wallet.publicClient.readContract({
                address: sneakerAddress as Address,
                abi: sneakerMintAbi,
                functionName: "traitsOf",
                args: [tokenId],
              }).catch(() => null),
              wallet.publicClient.readContract({
                address: sneakerAddress as Address,
                abi: sneakerMintAbi,
                functionName: "tokenURI",
                args: [tokenId],
              }).catch(() => ""),
              wallet.publicClient.readContract({
                address: sneakerAddress as Address,
                abi: sneakerMintAbi,
                functionName: "kindOf",
                args: [tokenId],
              }).catch(() => 0),
            ]);
        return {
          listingId: listingIds[idx],
          seller,
          tokenId,
          price,
          listedAt,
          active,
          rarity: sneaker?.rarity ?? (traits ? BigInt(traits[0]) : 0n),
          tier: sneaker?.tier ?? (traits ? BigInt(traits[1]) : 0n),
          kind: sneaker?.kind ?? Number(kind ?? 0),
          artwork: sneaker?.artwork ?? resolveSneakerArtwork(tokenUri as string),
        };
      }));
      setMyListings(mine.filter((listing): listing is MyListing => listing !== null));
    } catch (cause) {
      setReadError(cause instanceof Error ? cause.message : "Could not read the marketplace.");
    } finally {
      setIsReading(false);
    }
  }, [marketplaceAddress, owned.sneakers, sneakerAddress, wallet.address, wallet.isMobile, wallet.publicClient]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void refresh());
    return () => window.cancelAnimationFrame(frame);
  }, [refresh]);

  const send = useCallback(
    async (
      functionName:
        | "list"
        | "listAtAppraisal"
        | "buy"
        | "cancelListing"
        | "createAuction"
        | "bid"
        | "settleAuction"
        | "cancelAuction"
        | "makeOffer"
        | "acceptOffer"
        | "cancelOffer",
      args: readonly unknown[],
      value?: bigint,
    ) => {
      if (!marketplaceAddress) throw new Error("The marketplace is not configured.");
      const data = encodeFunctionData({
        abi: sneakerMarketplaceAbi,
        functionName,
        args,
      } as never);
      return transaction.execute({ to: marketplaceAddress, data, value });
    },
    [marketplaceAddress, transaction],
  );

  const approveNft = useCallback(
    async (tokenId: bigint) => {
      if (!sneakerAddress) throw new Error("The SneakerMint contract is not configured.");
      const data = encodeFunctionData({
        abi: [
          {
            type: "function",
            name: "approve",
            stateMutability: "nonpayable",
            inputs: [
              { name: "to", type: "address" },
              { name: "tokenId", type: "uint256" },
            ],
            outputs: [],
          },
        ] as const,
        functionName: "approve",
        args: [marketplaceAddress as Address, tokenId],
      });
      return transaction.execute({ to: sneakerAddress, data });
    },
    [marketplaceAddress, sneakerAddress, transaction],
  );

  const list = useCallback(
    (collection: Address, tokenId: bigint, price: bigint) => send("list", [collection, tokenId, price]),
    [send],
  );
  /// List an AI collectible at the appraiser's price. The seller supplies no
  /// number — the contract derives it, and `list` reverts for collectibles.
  const listAtAppraisal = useCallback(
    (collection: Address, tokenId: bigint) => send("listAtAppraisal", [collection, tokenId]),
    [send],
  );
  const buy = useCallback((listingId: bigint, price: bigint) => send("buy", [listingId], price), [send]);
  const cancelListing = useCallback((listingId: bigint) => send("cancelListing", [listingId]), [send]);
  const createAuction = useCallback(
    (collection: Address, tokenId: bigint, startPrice: bigint, durationSeconds: bigint) =>
      send("createAuction", [collection, tokenId, startPrice, durationSeconds]),
    [send],
  );
  const bid = useCallback((auctionId: bigint, amount: bigint) => send("bid", [auctionId], amount), [send]);
  const settleAuction = useCallback((auctionId: bigint) => send("settleAuction", [auctionId]), [send]);
  const cancelAuction = useCallback((auctionId: bigint) => send("cancelAuction", [auctionId]), [send]);
  const makeOffer = useCallback(
    (collection: Address, tokenId: bigint, durationSeconds: bigint, amount: bigint) =>
      send("makeOffer", [collection, tokenId, durationSeconds], amount),
    [send],
  );
  const acceptOffer = useCallback((offerId: bigint) => send("acceptOffer", [offerId]), [send]);
  const cancelOffer = useCallback((offerId: bigint) => send("cancelOffer", [offerId]), [send]);

  return {
    configured,
    marketplaceAddress,
    sneakerAddress,
    owned,
    myListings,
    saleKinds,
    suggested,
    isLoading: isReading || transaction.isPending,
    error: readError ?? transaction.error ?? owned.error,
    refresh: async () => {
      await Promise.all([refresh(), owned.refresh()]);
    },
    list,
    listAtAppraisal,
    buy,
    cancelListing,
    createAuction,
    bid,
    settleAuction,
    cancelAuction,
    makeOffer,
    acceptOffer,
    cancelOffer,
    approveNft,
  };
}
