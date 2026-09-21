"use client";

import { useCallback, useEffect, useState } from "react";
import type { Address, PublicClient } from "viem";
import { sneakerModsAbi } from "@/lib/contracts";
import type { ModTraits, OwnedMod } from "@/lib/mods";

type UseOwnedModsOptions = {
  owner: Address | null;
  contractAddress: Address | null;
  publicClient: PublicClient;
};

export function useOwnedMods({ owner, contractAddress, publicClient }: UseOwnedModsOptions) {
  const [mods, setMods] = useState<OwnedMod[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!owner || !contractAddress) {
      setMods([]);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const balance = await publicClient.readContract({
        address: contractAddress,
        abi: sneakerModsAbi,
        functionName: "balanceOf",
        args: [owner],
      });
      const tokenIds = (await Promise.all(
        Array.from({ length: Number(balance) }, (_, index) =>
          publicClient.readContract({
            address: contractAddress,
            abi: sneakerModsAbi,
            functionName: "tokenOfOwnerByIndex",
            args: [owner, BigInt(index)],
          }),
        ),
      )) as bigint[];
      const nextMods = await Promise.all(
        tokenIds.map(async (tokenId) => {
          const raw = (await publicClient.readContract({
            address: contractAddress,
            abi: sneakerModsAbi,
            functionName: "traitsOf",
            args: [tokenId],
          })) as unknown as ModTraits;
          return { tokenId, traits: raw };
        }),
      );
      setMods(nextMods);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read your mod NFTs.");
      setMods([]);
    } finally {
      setIsLoading(false);
    }
  }, [contractAddress, owner, publicClient]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void refresh());
    return () => window.cancelAnimationFrame(frame);
  }, [refresh]);

  return { mods, isLoading, error, refresh };
}
