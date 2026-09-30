"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { encodeFunctionData, getAddress, isAddress, type Address } from "viem";
import { usePolygonWallet } from "@/components/Providers";
import { useContractTransaction } from "@/hooks/useContractTransaction";
import { sneakerVaultAbi } from "@/lib/contracts";

const vaultAddressEnv = process.env.NEXT_PUBLIC_SNEAKER_VAULT_ADDRESS;

export type SneakerVaultPerk = {
  id: bigint;
  kind: number;
  valueBps: number;
  minTier: number;
  requiredLevel: number;
  minPolStaked: bigint;
  minConditionBps: number;
  minModCount: bigint;
  active: boolean;
  eligible: boolean;
  claimed: boolean;
};

export function useSneakerVault() {
  const wallet = usePolygonWallet();
  const transaction = useContractTransaction();
  const [perks, setPerks] = useState<SneakerVaultPerk[]>([]);
  const [bestDiscountBps, setBestDiscountBps] = useState(0);
  const [isReading, setIsReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);

  const configured = Boolean(vaultAddressEnv && isAddress(vaultAddressEnv));
  const vaultAddress = useMemo<Address | null>(
    () => (configured ? getAddress(vaultAddressEnv as string) : null),
    [configured],
  );

  const refresh = useCallback(async () => {
    if (!vaultAddress) {
      setPerks([]);
      setBestDiscountBps(0);
      setReadError(null);
      return;
    }
    setIsReading(true);
    setReadError(null);
    try {
      const count = await wallet.publicClient.readContract({
        address: vaultAddress,
        abi: sneakerVaultAbi,
        functionName: "perkCount",
      });
      const discount = wallet.address
        ? await wallet.publicClient.readContract({
            address: vaultAddress,
            abi: sneakerVaultAbi,
            functionName: "bestDiscountBps",
            args: [wallet.address],
          })
        : 0;
      const nextPerks = await Promise.all(
        Array.from({ length: Number(count) }, async (_, index) => {
          const perkId = BigInt(index);
          const [raw, eligible, claimed] = await Promise.all([
            wallet.publicClient.readContract({
              address: vaultAddress,
              abi: sneakerVaultAbi,
              functionName: "perks",
              args: [perkId],
            }),
            wallet.address
              ? wallet.publicClient.readContract({
                  address: vaultAddress,
                  abi: sneakerVaultAbi,
                  functionName: "isEligible",
                  args: [wallet.address, perkId],
                })
              : Promise.resolve(false),
            wallet.address
              ? wallet.publicClient.readContract({
                  address: vaultAddress,
                  abi: sneakerVaultAbi,
                  functionName: "accessClaimed",
                  args: [perkId, wallet.address],
                })
              : Promise.resolve(false),
          ]);
          const [kind, valueBps, minTier, requiredLevel, minPolStaked, minConditionBps, minModCount, active] =
            raw as readonly [number, number, number, number, bigint, number, bigint, boolean];
          return {
            id: perkId,
            kind,
            valueBps,
            minTier,
            requiredLevel,
            minPolStaked,
            minConditionBps,
            minModCount,
            active,
            eligible,
            claimed,
          };
        }),
      );
      setPerks(nextPerks);
      setBestDiscountBps(Number(discount));
    } catch (cause) {
      setReadError(cause instanceof Error ? cause.message : "Could not read SneakerVault perks.");
    } finally {
      setIsReading(false);
    }
  }, [vaultAddress, wallet.address, wallet.publicClient]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void refresh());
    return () => window.cancelAnimationFrame(frame);
  }, [refresh]);

  const claimPerk = useCallback(async (perkId: bigint) => {
    if (!vaultAddress) throw new Error("SneakerVault is not configured on this network.");
    const data = encodeFunctionData({ abi: sneakerVaultAbi, functionName: "claimPerk", args: [perkId] });
    const hash = await transaction.execute({ to: vaultAddress, data });
    await refresh();
    return hash;
  }, [refresh, transaction, vaultAddress]);

  return {
    configured,
    vaultAddress,
    perks,
    bestDiscountBps,
    isLoading: isReading || transaction.isPending,
    error: readError ?? transaction.error,
    refresh,
    claimPerk,
  };
}
