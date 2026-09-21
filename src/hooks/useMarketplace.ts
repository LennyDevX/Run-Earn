"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { encodeFunctionData, getAddress, isAddress, type Address } from "viem";
import { usePolygonWallet } from "@/components/Providers";
import { sneakerMarketplaceAbi } from "@/lib/contracts";
import { useContractTransaction } from "@/hooks/useContractTransaction";
import { useOwnedSneakers, type OwnedSneaker } from "@/hooks/useOwnedSneakers";

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

  const owned = useOwnedSneakers({
    owner: wallet.address,
    contractAddress: sneakerAddress,
    publicClient: wallet.publicClient,
  });

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
      const mine: MyListing[] = [];
      listings.forEach((raw, idx) => {
        if (!raw) return;
        const [seller, , tokenId, price, listedAt, active] = raw as readonly [Address, Address, bigint, bigint, bigint, boolean];
        if (!active || seller.toLowerCase() !== wallet.address?.toLowerCase()) return;
        const sneaker = owned.sneakers.find((s) => s.tokenId === tokenId);
        mine.push({
          listingId: listingIds[idx],
          seller,
          tokenId,
          price,
          listedAt,
          active,
          rarity: sneaker?.rarity ?? 0n,
          tier: sneaker?.tier ?? 0n,
        });
      });
      setMyListings(mine);
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
