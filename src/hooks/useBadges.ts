"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { encodeFunctionData, getAddress, isAddress, type Address } from "viem";
import { usePolygonWallet } from "@/components/Providers";
import { sneakerModsAbi } from "@/lib/contracts";
import { useContractTransaction } from "@/hooks/useContractTransaction";

const modsAddressEnv = process.env.NEXT_PUBLIC_SNEAKER_MODS_ADDRESS;

export type BadgeAchievement = {
  id: bigint;
  kind: number;
  threshold: bigint;
  slot: number;
  tier: number;
  effectBps: number;
  aux: number;
  consumable: boolean;
  active: boolean;
  meets: boolean;
  claimed: boolean;
};

const SCAN_LIMIT = 32;

export function useBadges() {
  const wallet = usePolygonWallet();
  const transaction = useContractTransaction();
  const [achievements, setAchievements] = useState<BadgeAchievement[]>([]);
  const [isReading, setIsReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);

  const configured = Boolean(modsAddressEnv && isAddress(modsAddressEnv));
  const modsAddress = useMemo<Address | null>(
    () => (configured ? getAddress(modsAddressEnv as string) : null),
    [configured],
  );

  const refresh = useCallback(async () => {
    if (!modsAddress || !wallet.publicClient) {
      setAchievements([]);
      return;
    }
    setIsReading(true);
    setReadError(null);
    try {
      const count = await wallet.publicClient.readContract({
        address: modsAddress,
        abi: sneakerModsAbi,
        functionName: "achievementCount",
      });
      const ids = Array.from(
        { length: Math.min(Number(count), SCAN_LIMIT) },
        (_, i) => BigInt(i),
      );
      const rows = await Promise.all(
        ids.map(async (id) => {
          // `achievements` is a struct, so viem returns a named object.
          const raw = await wallet.publicClient.readContract({
            address: modsAddress,
            abi: sneakerModsAbi,
            functionName: "achievements",
            args: [id],
          });
          const [meets, claimed] = wallet.address
            ? await Promise.all([
                wallet.publicClient
                  .readContract({
                    address: modsAddress,
                    abi: sneakerModsAbi,
                    functionName: "meetsRequirement",
                    args: [id, wallet.address, 0n],
                  })
                  .catch(() => false),
                wallet.publicClient
                  .readContract({
                    address: modsAddress,
                    abi: sneakerModsAbi,
                    functionName: "achievementClaimed",
                    args: [id, wallet.address],
                  })
                  .catch(() => false),
              ])
            : [false, false];
          return {
            id,
            kind: Number(raw.kind),
            threshold: raw.threshold,
            slot: Number(raw.slot),
            tier: Number(raw.tier),
            effectBps: Number(raw.effectBps),
            aux: Number(raw.aux),
            consumable: raw.consumable,
            active: raw.active,
            meets: Boolean(meets),
            claimed: Boolean(claimed),
          } satisfies BadgeAchievement;
        }),
      );
      setAchievements(rows);
    } catch (cause) {
      setReadError(cause instanceof Error ? cause.message : "Could not read achievements.");
      setAchievements([]);
    } finally {
      setIsReading(false);
    }
  }, [modsAddress, wallet.address, wallet.publicClient]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void refresh());
    return () => window.cancelAnimationFrame(frame);
  }, [refresh]);

  const claim = useCallback(
    async (achievementId: bigint, sneakerId: bigint) => {
      if (!modsAddress) throw new Error("The mods contract is not configured.");
      const data = encodeFunctionData({
        abi: sneakerModsAbi,
        functionName: "claim",
        args: [achievementId, sneakerId],
      });
      return transaction.execute({ to: modsAddress, data });
    },
    [modsAddress, transaction],
  );

  return {
    configured,
    modsAddress,
    achievements,
    isLoading: isReading || transaction.isPending,
    error: readError ?? transaction.error,
    refresh,
    claim,
  };
}
