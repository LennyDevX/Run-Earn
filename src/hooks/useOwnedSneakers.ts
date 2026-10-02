"use client";

import { useCallback, useEffect, useState } from "react";
import type { Address, PublicClient } from "viem";
import { sneakerMintAbi } from "@/lib/contracts";
import { resolveSneakerArtwork, type ResolvedSneakerArtwork } from "@/lib/sneaker-artwork";

export type OwnedSneaker = {
  tokenId: bigint;
  rarity: bigint;
  tier: bigint;
  /// 0 = Playable veSneaker (staking, arena, game, workshop)
  /// 1 = AI collectible (marketplace only)
  kind: number;
  artwork: ResolvedSneakerArtwork;
};

type UseOwnedSneakersOptions = {
  owner: Address | null;
  contractAddress: Address | null;
  publicClient: PublicClient;
};

/// Per-token fields, in the order they are flattened into the multicall.
const PER_TOKEN_FIELDS = ["traitsOf", "tokenURI", "kindOf"] as const;

export function useOwnedSneakers({ owner, contractAddress, publicClient }: UseOwnedSneakersOptions) {
  const [sneakers, setSneakers] = useState<OwnedSneaker[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!owner || !contractAddress) {
      setSneakers([]);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const balance = await publicClient.readContract({
        address: contractAddress,
        abi: sneakerMintAbi,
        functionName: "balanceOf",
        args: [owner],
      });
      const count = Number(balance);
      if (count === 0) {
        setSneakers([]);
        return;
      }

      const tokenIds = await publicClient.multicall({
        contracts: Array.from({ length: count }, (_, index) => ({
          address: contractAddress,
          abi: sneakerMintAbi,
          functionName: "tokenOfOwnerByIndex" as const,
          args: [owner, BigInt(index)] as const,
        })),
        allowFailure: false,
      });

      /// One `eth_call` for every token instead of three round trips each.
      /// A wallet holding 20 sneakers used to fire ~60 requests on mount, and
      /// several surfaces instantiate this hook at once. `allowFailure` keeps a
      /// single unreadable token from sinking the whole batch — `tokenURI` can
      /// revert on a half-configured mint, and pre-split deployments have no
      /// `kindOf` at all.
      const results = await publicClient.multicall({
        contracts: (tokenIds as bigint[]).flatMap((tokenId) =>
          PER_TOKEN_FIELDS.map((functionName) => ({
            address: contractAddress,
            abi: sneakerMintAbi,
            functionName,
            args: [tokenId] as const,
          })),
        ),
        allowFailure: true,
      });

      const nextSneakers = (tokenIds as bigint[]).map((tokenId, tokenIndex) => {
        const base = tokenIndex * PER_TOKEN_FIELDS.length;
        const traits = results[base];
        const tokenUri = results[base + 1];
        const kind = results[base + 2];

        const traitValues =
          traits?.status === "success"
            ? (traits.result as readonly [number, number, `0x${string}`])
            : ([0, 0, "0x"] as const);

        return {
          tokenId,
          rarity: BigInt(traitValues[0] ?? 0),
          tier: BigInt(traitValues[1] ?? 0),
          // Older deployments predate the kind split; a failed read means
          // Playable, which is the pre-split behaviour.
          kind: kind?.status === "success" ? Number(kind.result) : 0,
          artwork: resolveSneakerArtwork(
            tokenUri?.status === "success" ? (tokenUri.result as string) : "",
          ),
        };
      });

      setSneakers(nextSneakers);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read your SneakerMint NFTs.");
      setSneakers([]);
    } finally {
      setIsLoading(false);
    }
  }, [contractAddress, owner, publicClient]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void refresh());
    return () => window.cancelAnimationFrame(frame);
  }, [refresh]);

  return { sneakers, isLoading, error, refresh };
}
