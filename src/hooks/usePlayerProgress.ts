"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { isAddress, type Address, type PublicClient } from "viem";
import { playerProgressAbi } from "@/lib/contracts";

export type PlayerProgressSnapshot = {
  xp: bigint;
  level: number;
  currentLevelXp: bigint;
  /** 0 when the wallet is at the last configured threshold. */
  nextLevelXp: bigint;
};

export type XpBreakdown = {
  sneakerXp: bigint;
  modXp: bigint;
  veRuneXp: bigint;
  tradeXp: bigint;
  workshopXp: bigint;
  stakingXp: bigint;
};

type UsePlayerProgressOptions = {
  owner: Address | null;
  publicClient: PublicClient;
};

const PROGRESS_ADDRESS = process.env.NEXT_PUBLIC_PLAYER_PROGRESS_ADDRESS;

/// Reads the on-chain `PlayerProgress` contract: XP, level, per-signal XP
/// breakdown, and the public profile fields (username, NFT avatar pointer).
/// `configured` is false until `NEXT_PUBLIC_PLAYER_PROGRESS_ADDRESS` is set —
/// callers should fall back to the local estimate in `src/lib/profile.ts`.
export function usePlayerProgress({ owner, publicClient }: UsePlayerProgressOptions) {
  const contractAddress = useMemo(
    () => (PROGRESS_ADDRESS && isAddress(PROGRESS_ADDRESS) ? (PROGRESS_ADDRESS as Address) : null),
    [],
  );
  const [snapshot, setSnapshot] = useState<PlayerProgressSnapshot | null>(null);
  const [breakdown, setBreakdown] = useState<XpBreakdown | null>(null);
  const [username, setUsername] = useState<string>("");
  const [avatarRef, setAvatarRef] = useState<{ collection: Address | null; tokenId: bigint } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!owner || !contractAddress) {
      setSnapshot(null);
      setBreakdown(null);
      setUsername("");
      setAvatarRef(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const [progress, parts, name, collection, tokenId] = await Promise.all([
        publicClient.readContract({
          address: contractAddress,
          abi: playerProgressAbi,
          functionName: "progressOf",
          args: [owner],
        }),
        publicClient.readContract({
          address: contractAddress,
          abi: playerProgressAbi,
          functionName: "xpBreakdown",
          args: [owner],
        }),
        publicClient.readContract({
          address: contractAddress,
          abi: playerProgressAbi,
          functionName: "usernames",
          args: [owner],
        }),
        publicClient.readContract({
          address: contractAddress,
          abi: playerProgressAbi,
          functionName: "avatarCollection",
          args: [owner],
        }),
        publicClient.readContract({
          address: contractAddress,
          abi: playerProgressAbi,
          functionName: "avatarTokenId",
          args: [owner],
        }),
      ]);
      const [xp, level, currentLevelXp, nextLevelXp] = progress;
      setSnapshot({ xp, level: Number(level), currentLevelXp, nextLevelXp });
      const [sneakerXp, modXp, veRuneXp, tradeXp, workshopXp, stakingXp] = parts;
      setBreakdown({ sneakerXp, modXp, veRuneXp, tradeXp, workshopXp, stakingXp });
      setUsername(name);
      setAvatarRef({ collection: collection === "0x0000000000000000000000000000000000000000" ? null : collection, tokenId });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read player progress.");
    } finally {
      setIsLoading(false);
    }
  }, [contractAddress, owner, publicClient]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void refresh());
    return () => window.cancelAnimationFrame(frame);
  }, [refresh]);

  return {
    configured: Boolean(contractAddress),
    contractAddress,
    snapshot,
    breakdown,
    username,
    avatarRef,
    isLoading,
    error,
    refresh,
  };
}
