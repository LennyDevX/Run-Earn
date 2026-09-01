"use client";

import { useCallback, useEffect, useState } from "react";
import type { Address, PublicClient } from "viem";
import { sneakerMintAbi } from "@/lib/contracts";

export type OwnedSneaker = {
  tokenId: bigint;
  rarity: bigint;
  tier: bigint;
};

type UseOwnedSneakersOptions = {
  owner: Address | null;
  contractAddress: Address | null;
  publicClient: PublicClient;
};

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
      const tokenIds = await Promise.all(
        Array.from({ length: Number(balance) }, (_, index) =>
          publicClient.readContract({
            address: contractAddress,
            abi: sneakerMintAbi,
            functionName: "tokenOfOwnerByIndex",
            args: [owner, BigInt(index)],
          }),
        ),
      );
      const nextSneakers = await Promise.all(
        (tokenIds as bigint[]).map(async (tokenId) => {
          const traits = await publicClient.readContract({
            address: contractAddress,
            abi: sneakerMintAbi,
            functionName: "traitsOf",
            args: [tokenId],
          });
          return { tokenId, rarity: BigInt(traits[0]), tier: BigInt(traits[1]) };
        }),
      );
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
