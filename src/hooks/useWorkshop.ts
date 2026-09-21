"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { encodeFunctionData, getAddress, isAddress, type Address } from "viem";
import { usePolygonWallet } from "@/components/Providers";
import { sneakerModsAbi, sneakerWorkshopAbi } from "@/lib/contracts";
import { SLOT_COUNT, type WorkshopBonusSnapshot } from "@/lib/mods";
import { useContractTransaction } from "@/hooks/useContractTransaction";
import { useOwnedSneakers } from "@/hooks/useOwnedSneakers";
import { useOwnedMods } from "@/hooks/useOwnedMods";

const workshopAddressEnv = process.env.NEXT_PUBLIC_SNEAKER_WORKSHOP_ADDRESS;
const modsAddressEnv = process.env.NEXT_PUBLIC_SNEAKER_MODS_ADDRESS;
const sneakerMintAddressEnv = process.env.NEXT_PUBLIC_SNEAKER_MINT_ADDRESS;

export function useWorkshop() {
  const wallet = usePolygonWallet();
  const transaction = useContractTransaction();
  const [equippedMap, setEquippedMap] = useState<Map<string, bigint>>(new Map());
  const [bonuses, setBonuses] = useState<WorkshopBonusSnapshot | null>(null);
  const [selectedSneakerId, setSelectedSneakerId] = useState<bigint | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);

  const configured = Boolean(
    workshopAddressEnv &&
    modsAddressEnv &&
    sneakerMintAddressEnv &&
    isAddress(workshopAddressEnv) &&
    isAddress(modsAddressEnv) &&
    isAddress(sneakerMintAddressEnv),
  );
  const workshopAddress = useMemo<Address | null>(
    () => (configured ? getAddress(workshopAddressEnv as string) : null),
    [configured],
  );
  const modsAddress = useMemo<Address | null>(
    () => (configured ? getAddress(modsAddressEnv as string) : null),
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
  const ownedMods = useOwnedMods({
    owner: wallet.address,
    contractAddress: modsAddress,
    publicClient: wallet.publicClient,
  });

  const readSnapshot = useCallback(
    async (sneakerId: bigint) => {
      if (!workshopAddress || !wallet.publicClient) return;
      const client = wallet.publicClient;
      const read = (functionName: string) =>
        client.readContract({
          address: workshopAddress,
          abi: sneakerWorkshopAbi,
          functionName,
          args: [sneakerId],
        } as never);

      const [
        earnBonusBps,
        wearReductionBps,
        maxDurabilityBonusBps,
        repairDiscountBps,
        appraisalBonusBps,
        stakingBoostBps,
        rarityBonus,
        autoActive,
        skinOverride,
        forgeLevel,
        nextForgeCost,
        tempBoostBps,
        boostExpiresAt,
      ] = await Promise.all([
        read("earnBonusBps"),
        read("wearReductionBps"),
        read("maxDurabilityBonusBps"),
        read("repairDiscountBps"),
        read("appraisalBonusBps"),
        read("stakingBoostBps"),
        read("rarityBonus"),
        read("autoActive"),
        read("skinOverride"),
        read("forgeLevel"),
        read("nextForgeCost"),
        read("tempBoostBps"),
        read("boostExpiresAt"),
      ]);
      setBonuses({
        earnBonusBps: earnBonusBps as bigint,
        wearReductionBps: wearReductionBps as bigint,
        maxDurabilityBonusBps: maxDurabilityBonusBps as bigint,
        repairDiscountBps: repairDiscountBps as bigint,
        appraisalBonusBps: appraisalBonusBps as bigint,
        stakingBoostBps: stakingBoostBps as bigint,
        rarityBonus: Number(rarityBonus),
        autoActive: Boolean(autoActive),
        skinOverride: Number(skinOverride),
        forgeLevel: Number(forgeLevel),
        nextForgeCost: nextForgeCost as bigint,
        tempBoostBps: Number(tempBoostBps),
        boostExpiresAt: Number(boostExpiresAt),
      });
    },
    [workshopAddress, wallet.publicClient],
  );

  const refresh = useCallback(async () => {
    if (!wallet.address || !workshopAddress || !wallet.publicClient || selectedSneakerId == null) {
      setEquippedMap(new Map());
      if (selectedSneakerId == null) setBonuses(null);
      return;
    }
    setIsReading(true);
    setReadError(null);
    try {
      const slots = Array.from({ length: SLOT_COUNT }, (_, i) => i);
      const modIds = await Promise.all(
        slots.map((slot) =>
          wallet.publicClient
            .readContract({
              address: workshopAddress,
              abi: sneakerWorkshopAbi,
              functionName: "equipped",
              args: [selectedSneakerId, slot],
            })
            .catch(() => 0n),
        ),
      );
      const map = new Map<string, bigint>();
      slots.forEach((slot, idx) => map.set(slot.toString(), modIds[idx] as bigint));
      setEquippedMap(map);
      await readSnapshot(selectedSneakerId);
    } catch (cause) {
      setReadError(cause instanceof Error ? cause.message : "Could not read the workshop.");
    } finally {
      setIsReading(false);
    }
  }, [readSnapshot, selectedSneakerId, wallet.address, wallet.publicClient, workshopAddress]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void refresh());
    return () => window.cancelAnimationFrame(frame);
  }, [refresh]);

  const send = useCallback(
    async (
      functionName: "equip" | "unequip" | "useRepairKit" | "useAbility" | "forge",
      args: readonly unknown[],
    ) => {
      if (!workshopAddress) throw new Error("The workshop is not configured.");
      const data = encodeFunctionData({
        abi: sneakerWorkshopAbi,
        functionName,
        args,
      } as never);
      return transaction.execute({ to: workshopAddress, data });
    },
    [workshopAddress, transaction],
  );

  const approveMods = useCallback(
    async (modId: bigint) => {
      if (!modsAddress || !workshopAddress) throw new Error("The mods contract is not configured.");
      const data = encodeFunctionData({
        abi: sneakerModsAbi,
        functionName: "approve",
        args: [workshopAddress, modId],
      });
      return transaction.execute({ to: modsAddress, data });
    },
    [modsAddress, transaction, workshopAddress],
  );

  const equip = useCallback(
    async (sneakerId: bigint, modId: bigint) => {
      await approveMods(modId);
      return send("equip", [sneakerId, modId]);
    },
    [approveMods, send],
  );
  const unequip = useCallback(
    (sneakerId: bigint, slot: number) => send("unequip", [sneakerId, slot]),
    [send],
  );
  const useRepairKit = useCallback(
    (sneakerId: bigint, modId: bigint) => send("useRepairKit", [sneakerId, modId]),
    [send],
  );
  const useAbility = useCallback(
    (sneakerId: bigint, modId: bigint) => send("useAbility", [sneakerId, modId]),
    [send],
  );
  const forge = useCallback((sneakerId: bigint) => send("forge", [sneakerId]), [send]);

  return {
    configured,
    workshopAddress,
    modsAddress,
    sneakerAddress,
    owned,
    ownedMods,
    selectedSneakerId,
    setSelectedSneakerId,
    equippedMap,
    bonuses,
    isLoading: isReading || transaction.isPending,
    error: readError ?? transaction.error ?? owned.error ?? ownedMods.error,
    refresh: async () => {
      await Promise.all([refresh(), owned.refresh(), ownedMods.refresh()]);
    },
    equip,
    unequip,
    useRepairKit,
    useAbility,
    forge,
  };
}
