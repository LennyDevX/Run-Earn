"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getAddress, isAddress, type Address } from "viem";
import { usePolygonWallet } from "@/components/Providers";
import { stakingAbi } from "@/lib/contracts";
import { gateOpen, unmetGateRequirements, type ArenaGate } from "@/lib/tab-challenge";

const stakingAddressEnv = process.env.NEXT_PUBLIC_STAKING_VAULT_ADDRESS;

/// Reads the two conditions the arena contract enforces before a session can
/// start: a non-zero POL principal and the runner locked in the vault. The
/// contract is the source of truth — this only mirrors it so the UI can list
/// exactly what is missing.
export function useArenaGate(runnerId: bigint | null) {
  const wallet = usePolygonWallet();
  const stakingAddress = useMemo<Address | null>(
    () => (stakingAddressEnv && isAddress(stakingAddressEnv) ? getAddress(stakingAddressEnv) : null),
    [],
  );

  const [gate, setGate] = useState<ArenaGate>({ hasPol: false, hasLockedRunner: false });
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!wallet.address || !stakingAddress) {
      setGate({ hasPol: false, hasLockedRunner: false });
      return;
    }
    setIsLoading(true);
    try {
      const [pol, stakedOwner] = await Promise.all([
        wallet.publicClient.readContract({
          address: stakingAddress,
          abi: stakingAbi,
          functionName: "polPositions",
          args: [wallet.address],
        }),
        runnerId === null
          ? Promise.resolve(null)
          : wallet.publicClient.readContract({
              address: stakingAddress,
              abi: stakingAbi,
              functionName: "stakedOwner",
              args: [runnerId],
            }),
      ]);
      setGate({
        hasPol: (pol as readonly [bigint, bigint, bigint, bigint])[0] > 0n,
        hasLockedRunner:
          stakedOwner !== null && String(stakedOwner).toLowerCase() === wallet.address.toLowerCase(),
      });
    } catch {
      setGate({ hasPol: false, hasLockedRunner: false });
    } finally {
      setIsLoading(false);
    }
  }, [runnerId, stakingAddress, wallet.address, wallet.publicClient]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void refresh());
    return () => window.cancelAnimationFrame(frame);
  }, [refresh]);

  return {
    configured: Boolean(stakingAddress),
    gate,
    open: gateOpen(gate),
    missing: unmetGateRequirements(gate),
    isLoading,
    refresh,
  };
}
