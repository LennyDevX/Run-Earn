"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getAddress, isAddress, type Address } from "viem";
import { usePolygonWallet } from "@/components/Providers";
import { useSneakerOwnership } from "@/components/SneakerOwnershipProvider";
import { sneakerWorkshopAbi } from "@/lib/contracts";
import { sneakerPower, type SneakerPower } from "@/lib/tab-challenge";
import type { VeSneakerFamilyId } from "@/lib/ve-sneakers";

const workshopAddressEnv = process.env.NEXT_PUBLIC_SNEAKER_WORKSHOP_ADDRESS;

export type Runner = {
  tokenId: bigint;
  rarity: number;
  tier: number;
  conditionBps: number;
  equippedMods: number;
  family: VeSneakerFamilyId;
  label: string;
  power: SneakerPower;
};

/// The player's veSneakers with their live wear and equipped-mod count,
/// resolved into the tab-challenge power score. Runners are sorted by ceiling so
/// the strongest pair is selected by default.
export function useRunnerRoster() {
  const wallet = usePolygonWallet();
  const workshopAddress = useMemo<Address | null>(
    () => (workshopAddressEnv && isAddress(workshopAddressEnv) ? getAddress(workshopAddressEnv) : null),
    [],
  );

  // Shared across the tree — see SneakerOwnershipProvider.
  const owned = useSneakerOwnership();

  const [runners, setRunners] = useState<Runner[]>([]);
  const [isReading, setIsReading] = useState(false);
  const [selectedId, setSelectedId] = useState<bigint | null>(null);

  const refresh = useCallback(async () => {
    // Collectibles are art, not runners — they never enter the arena.
    if (!wallet.address || owned.playable.length === 0) {
      setRunners([]);
      setSelectedId(null);
      return;
    }
    setIsReading(true);
    try {
      const rows = await Promise.all(
        owned.playable.map(async (sneaker) => {
          const [conditionBps, equippedMods] = workshopAddress
            ? await Promise.all([
                wallet.publicClient
                  .readContract({
                    address: workshopAddress,
                    abi: sneakerWorkshopAbi,
                    functionName: "conditionBps",
                    args: [sneaker.tokenId],
                  })
                  .catch(() => 0),
                wallet.publicClient
                  .readContract({
                    address: workshopAddress,
                    abi: sneakerWorkshopAbi,
                    functionName: "equippedCount",
                    args: [sneaker.tokenId],
                  })
                  .catch(() => 0n),
              ])
            : [10_000, 0n];

          const rarity = Number(sneaker.rarity);
          const condition = Number(conditionBps);
          const mods = Number(equippedMods);
          return {
            tokenId: sneaker.tokenId,
            rarity,
            tier: Number(sneaker.tier),
            conditionBps: condition,
            equippedMods: mods,
            family: sneaker.artwork.family ?? "astra",
            label: sneaker.artwork.name ?? "veSneaker",
            power: sneakerPower({
              rarity,
              conditionBps: condition,
              equippedMods: mods,
            }),
          } satisfies Runner;
        }),
      );
      rows.sort((a, b) => b.power.ceilingBps - a.power.ceilingBps);
      setRunners(rows);
      setSelectedId((current) =>
        current && rows.some((row) => row.tokenId === current) ? current : rows[0]?.tokenId ?? null,
      );
    } catch {
      setRunners([]);
    } finally {
      setIsReading(false);
    }
  }, [owned.playable, wallet.address, wallet.publicClient, workshopAddress]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void refresh());
    return () => window.cancelAnimationFrame(frame);
  }, [refresh]);

  const selected = useMemo(
    () => runners.find((runner) => runner.tokenId === selectedId) ?? null,
    [runners, selectedId],
  );

  return {
    connected: Boolean(wallet.address),
    runners,
    selected,
    selectedId,
    setSelectedId,
    isLoading: isReading || owned.isLoading,
    error: owned.error,
    refresh,
  };
}
