"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { encodeFunctionData, getAddress, isAddress, type Address } from "viem";
import { usePolygonWallet } from "@/components/Providers";
import { stakingAbi } from "@/lib/contracts";
import { useContractTransaction } from "@/hooks/useContractTransaction";
import type { OwnedSneaker } from "@/hooks/useOwnedSneakers";
import { useSneakerOwnership } from "@/components/SneakerOwnershipProvider";

const stakingVaultAddress = process.env.NEXT_PUBLIC_STAKING_VAULT_ADDRESS;
const sneakerMintAddress = process.env.NEXT_PUBLIC_SNEAKER_MINT_ADDRESS;

export type StakingStats = {
  principal: bigint;
  pendingRewards: bigint;
  apyBps: bigint;
  lockedCount: bigint;
  reserve: bigint;
  depositedAt: bigint;
  minLockSeconds: bigint;
  stakedTokenIds: bigint[];
  ownedSneakers: OwnedSneaker[];
};

const EMPTY_STATS: StakingStats = {
  principal: 0n,
  pendingRewards: 0n,
  apyBps: 280n, // Default 2.8% base APY
  lockedCount: 0n,
  reserve: 0n,
  depositedAt: 0n,
  minLockSeconds: 2592000n, // 30 days
  stakedTokenIds: [],
  ownedSneakers: [],
};

export function useStakingVault() {
  const wallet = usePolygonWallet();
  const transaction = useContractTransaction();
  const [stats, setStats] = useState<StakingStats>(EMPTY_STATS);
  const [isReading, setIsReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);

  const configured = Boolean(
    stakingVaultAddress &&
    sneakerMintAddress &&
    isAddress(stakingVaultAddress) &&
    isAddress(sneakerMintAddress),
  );
  const stakingAddress = useMemo<Address | null>(
    () => configured ? getAddress(stakingVaultAddress as string) : null,
    [configured],
  );
  const sneakerAddress = useMemo<Address | null>(
    () => configured ? getAddress(sneakerMintAddress as string) : null,
    [configured],
  );
  const owned = useSneakerOwnership();

  const refresh = useCallback(async () => {
    if (!wallet.address || !stakingAddress) {
      setStats(EMPTY_STATS);
      return;
    }

    setIsReading(true);
    setReadError(null);
    try {
      const owner = wallet.address;
      // One multicall instead of seven sequential reads against the same
      // contract. On a phone that is the difference between one round trip and
      // seven, for data that is always fetched together anyway.
      //
      // Failure handling preserves the original split: the six position reads
      // threw on failure, `minLockSeconds` fell back to 30 days. A single
      // `allowFailure` flag cannot express both, so the six are checked
      // explicitly and the seventh keeps its fallback.
      const results = await wallet.publicClient.multicall({
        allowFailure: true,
        contracts: [
          { address: stakingAddress, abi: stakingAbi, functionName: "polPositions", args: [owner] },
          { address: stakingAddress, abi: stakingAbi, functionName: "positions", args: [owner] },
          { address: stakingAddress, abi: stakingAbi, functionName: "pendingPOLRewards", args: [owner] },
          { address: stakingAddress, abi: stakingAbi, functionName: "effectiveApyBps", args: [owner] },
          { address: stakingAddress, abi: stakingAbi, functionName: "availablePOLRewards" },
          { address: stakingAddress, abi: stakingAbi, functionName: "stakedTokenIds", args: [owner] },
          { address: stakingAddress, abi: stakingAbi, functionName: "minLockSeconds" },
        ],
      });
      for (const result of results.slice(0, 6)) {
        if (result.status === "failure") throw result.error;
      }
      const required = results.slice(0, 6) as Array<{ status: "success"; result: unknown }>;
      const [polPosition, position, pendingRewards, apyBps, reserve, stakedTokenIds] = required.map((r) => r.result);
      const minLockResult = results[6];
      const minLock = (minLockResult.status === "success" ? (minLockResult.result as bigint) : 2592000n) || 2592000n;

      const polPosTuple = polPosition as readonly [bigint, bigint, bigint, bigint];
      setStats({
        principal: polPosTuple[0],
        pendingRewards: pendingRewards as bigint,
        apyBps: apyBps as bigint,
        lockedCount: (position as readonly [bigint, bigint, bigint, bigint, bigint])[0],
        reserve: reserve as bigint,
        depositedAt: polPosTuple[2],
        minLockSeconds: minLock,
        stakedTokenIds: stakedTokenIds as bigint[],
        // Staking is veSneaker-only.
        ownedSneakers: owned.playable,
      });
    } catch (cause) {
      setReadError(cause instanceof Error ? cause.message : "Could not read the staking vault.");
    } finally {
      setIsReading(false);
    }
  }, [owned.playable, stakingAddress, wallet.address, wallet.publicClient]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void refresh());
    return () => window.cancelAnimationFrame(frame);
  }, [refresh]);

  const send = useCallback(async (
    functionName: "depositPOL" | "withdrawPOL" | "claimPOLRewards" | "stake" | "unstake",
    args: readonly [] | readonly [bigint] = [],
    value?: bigint,
  ) => {
    if (!stakingAddress) throw new Error("The staking vault is not configured.");
    const data = encodeFunctionData({ abi: stakingAbi, functionName, args } as never);
    return transaction.execute({ to: stakingAddress, data, value });
  }, [stakingAddress, transaction]);

  const depositPOL = useCallback((amount: bigint) => {
    if (amount <= 0n) throw new Error("Enter a POL amount greater than zero.");
    return send("depositPOL", [], amount);
  }, [send]);

  const withdrawPOL = useCallback((amount: bigint) => {
    if (amount <= 0n) throw new Error("Enter a POL amount greater than zero.");
    return send("withdrawPOL", [amount]);
  }, [send]);

  const claimPOLRewards = useCallback(() => send("claimPOLRewards"), [send]);
  const lockNFT = useCallback((tokenId: bigint) => send("stake", [tokenId]), [send]);
  const unlockNFT = useCallback((tokenId: bigint) => send("unstake", [tokenId]), [send]);

  const statsWithOwned = { ...stats, ownedSneakers: owned.playable };
  return {
    configured,
    stakingAddress,
    sneakerAddress,
    stats: statsWithOwned,
    isLoading: isReading || transaction.isPending,
    error: readError ?? transaction.error ?? owned.error,
    refresh: async () => {
      await Promise.all([refresh(), owned.refresh()]);
    },
    refreshOwnedSneakers: owned.refresh,
    depositPOL,
    withdrawPOL,
    claimPOLRewards,
    lockNFT,
    unlockNFT,
  };
}
