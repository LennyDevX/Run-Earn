"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { encodeFunctionData, getAddress, isAddress, type Address } from "viem";
import { usePolygonWallet } from "@/components/Providers";
import { sneakerGameAbi } from "@/lib/contracts";
import { useContractTransaction } from "@/hooks/useContractTransaction";
import type { OwnedSneaker } from "@/hooks/useOwnedSneakers";
import { useSneakerOwnership } from "@/components/SneakerOwnershipProvider";

const gameAddressEnv = process.env.NEXT_PUBLIC_SNEAKER_GAME_ADDRESS;
const sneakerMintAddressEnv = process.env.NEXT_PUBLIC_SNEAKER_MINT_ADDRESS;

export type SneakerGameState = {
  lastActivationAt: bigint;
  lastAccrualAt: bigint;
  streak: bigint;
  durability: bigint;
  pendingPoints: bigint;
  lifetimePoints: bigint;
  lastDecayAt: bigint;
  energy: bigint;
};

export type GameSneaker = OwnedSneaker & {
  state: SneakerGameState;
  pending: bigint;
  canActivate: boolean;
  secondsUntilActivation: bigint;
  power: bigint;
  health: number;
  energy: number;
  maxEnergy: number;
  earnRate: bigint;
};

export type GameParams = {
  maxDurability: bigint;
  wearPerActivation: bigint;
  repairCostPoints: bigint;
  redemptionRate: bigint;
  redemptionEnabled: boolean;
  tierBasePointsPerDay: readonly [bigint, bigint, bigint, bigint];
};

const EMPTY_PARAMS: GameParams = {
  maxDurability: 10n,
  wearPerActivation: 1n,
  repairCostPoints: 0n,
  redemptionRate: 100n * 10n ** 18n,
  redemptionEnabled: false,
  tierBasePointsPerDay: [0n, 0n, 0n, 0n],
};

export function useSneakerGame() {
  const wallet = usePolygonWallet();
  const transaction = useContractTransaction();
  const [sneakers, setSneakers] = useState<GameSneaker[]>([]);
  const [veRune, setVeRune] = useState(0n);
  const [totalRedeemedPoints, setTotalRedeemedPoints] = useState(0n);
  const [params, setParams] = useState<GameParams>(EMPTY_PARAMS);
  const [isReading, setIsReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);

  const configured = Boolean(
    gameAddressEnv && sneakerMintAddressEnv && isAddress(gameAddressEnv) && isAddress(sneakerMintAddressEnv),
  );
  const gameAddress = useMemo<Address | null>(
    () => (configured ? getAddress(gameAddressEnv as string) : null),
    [configured],
  );
  const sneakerAddress = useMemo<Address | null>(
    () => (configured ? getAddress(sneakerMintAddressEnv as string) : null),
    [configured],
  );

  const owned = useSneakerOwnership();

  const refresh = useCallback(async () => {
    if (!wallet.address || !gameAddress || !wallet.publicClient) {
      setSneakers([]);
      setVeRune(0n);
      setTotalRedeemedPoints(0n);
      setParams(EMPTY_PARAMS);
      return;
    }

    setIsReading(true);
    setReadError(null);
    try {
      // Two multicalls instead of ~11 + 9N individual reads. A wallet with five
      // sneakers used to open 56 RPC requests for one page view; on a phone that
      // is the difference between a dashboard that appears and one that crawls.
      //
      // The two failure modes are deliberately different:
      //   - the parameters use `allowFailure: false`, because a missing
      //     durability or redemption rate would silently mis-render the whole
      //     dashboard. The original code let those throw, and so does this.
      //   - the per-token reads use `allowFailure: true`, because one burned
      //     token should not blank out every other sneaker. The original caught
      //     each one and fell back; the fallbacks are preserved below.
      const paramsResult = await wallet.publicClient.multicall({
        allowFailure: false,
        contracts: [
          { address: gameAddress, abi: sneakerGameAbi, functionName: "maxDurability" },
          { address: gameAddress, abi: sneakerGameAbi, functionName: "wearPerActivation" },
          { address: gameAddress, abi: sneakerGameAbi, functionName: "repairCostPoints" },
          { address: gameAddress, abi: sneakerGameAbi, functionName: "redemptionRate" },
          { address: gameAddress, abi: sneakerGameAbi, functionName: "redemptionEnabled" },
          { address: gameAddress, abi: sneakerGameAbi, functionName: "tierBasePointsPerDay", args: [0n] },
          { address: gameAddress, abi: sneakerGameAbi, functionName: "tierBasePointsPerDay", args: [1n] },
          { address: gameAddress, abi: sneakerGameAbi, functionName: "tierBasePointsPerDay", args: [2n] },
          { address: gameAddress, abi: sneakerGameAbi, functionName: "tierBasePointsPerDay", args: [3n] },
          { address: gameAddress, abi: sneakerGameAbi, functionName: "veRuneBalance", args: [wallet.address] },
          { address: gameAddress, abi: sneakerGameAbi, functionName: "totalRedeemed", args: [wallet.address] },
        ],
      });
      const [maxDurability, wearPerActivation, repairCostPoints, redemptionRate, redemptionEnabled, tier0, tier1, tier2, tier3, veRuneBalance, redeemed] =
        paramsResult as [
          number,
          number,
          bigint,
          bigint,
          boolean,
          bigint,
          bigint,
          bigint,
          bigint,
          bigint,
          bigint,
        ];

      setParams({
        maxDurability: BigInt(maxDurability),
        wearPerActivation: BigInt(wearPerActivation),
        repairCostPoints,
        redemptionRate,
        redemptionEnabled,
        tierBasePointsPerDay: [tier0, tier1, tier2, tier3],
      });
      setVeRune(veRuneBalance);
      setTotalRedeemedPoints(redeemed);

      // Only playable veSneakers have game state.
      const playable = owned.playable;
      const tokenIds = playable.map((s) => s.tokenId);

      const perToken =
        tokenIds.length === 0
          ? []
          : await wallet.publicClient.multicall({
              allowFailure: true,
              contracts: tokenIds.flatMap((tokenId) => [
                { address: gameAddress, abi: sneakerGameAbi, functionName: "sneakers", args: [tokenId] },
                { address: gameAddress, abi: sneakerGameAbi, functionName: "pendingPoints", args: [tokenId] },
                { address: gameAddress, abi: sneakerGameAbi, functionName: "canActivate", args: [tokenId] },
                { address: gameAddress, abi: sneakerGameAbi, functionName: "secondsUntilActivation", args: [tokenId] },
                { address: gameAddress, abi: sneakerGameAbi, functionName: "powerOf", args: [tokenId] },
                { address: gameAddress, abi: sneakerGameAbi, functionName: "healthOf", args: [tokenId] },
                { address: gameAddress, abi: sneakerGameAbi, functionName: "energyOf", args: [tokenId] },
                { address: gameAddress, abi: sneakerGameAbi, functionName: "maxEnergyOf", args: [tokenId] },
                { address: gameAddress, abi: sneakerGameAbi, functionName: "earnRatePerSecond", args: [tokenId] },
              ]),
            });

      /// Nine reads per token, so the flat result is sliced back into groups.
      const STRIDE = 9;
      const pick = (index: number, offset: number) => perToken[index * STRIDE + offset];
      const valueOr = <T,>(result: unknown, fallback: T): T =>
        (result as { status: string; result?: T }).status === "success"
          ? ((result as { result: T }).result as T)
          : fallback;

      const next: GameSneaker[] = playable.map((sneaker, idx) => {
        const raw = valueOr<readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint] | null>(
          pick(idx, 0),
          null,
        );
        const state: SneakerGameState = raw
          ? {
              lastActivationAt: raw[0],
              lastAccrualAt: raw[1],
              streak: raw[2],
              durability: raw[3],
              pendingPoints: raw[4],
              lifetimePoints: raw[5],
              lastDecayAt: raw[6],
              energy: raw[7],
            }
          : {
              lastActivationAt: 0n,
              lastAccrualAt: 0n,
              streak: 0n,
              durability: 0n,
              pendingPoints: 0n,
              lifetimePoints: 0n,
              lastDecayAt: 0n,
              energy: 0n,
            };
        return {
          ...sneaker,
          state,
          pending: valueOr(pick(idx, 1), 0n),
          canActivate: valueOr(pick(idx, 2), false),
          secondsUntilActivation: valueOr(pick(idx, 3), 0n),
          power: valueOr(pick(idx, 4), 0n),
          health: Number(valueOr(pick(idx, 5), 0)),
          energy: Number(valueOr(pick(idx, 6), 0)),
          maxEnergy: Number(valueOr(pick(idx, 7), 0)),
          earnRate: valueOr(pick(idx, 8), 0n),
        };
      });
      setSneakers(next);
    } catch (cause) {
      setReadError(cause instanceof Error ? cause.message : "Could not read the game state.");
    } finally {
      setIsReading(false);
    }
  }, [gameAddress, owned.playable, wallet.address, wallet.publicClient]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void refresh());
    return () => window.cancelAnimationFrame(frame);
  }, [refresh]);

  const send = useCallback(
    async (
      functionName: "activate" | "claimPoints" | "repair" | "redeem",
      args: readonly [bigint] | readonly [],
    ) => {
      if (!gameAddress) throw new Error("The game contract is not configured.");
      const data = encodeFunctionData({ abi: sneakerGameAbi, functionName, args } as never);
      return transaction.execute({ to: gameAddress, data });
    },
    [gameAddress, transaction],
  );

  const activate = useCallback((tokenId: bigint) => send("activate", [tokenId]), [send]);
  const claimPoints = useCallback((tokenId: bigint) => send("claimPoints", [tokenId]), [send]);
  const repair = useCallback((tokenId: bigint) => send("repair", [tokenId]), [send]);
  const redeem = useCallback((points: bigint) => send("redeem", [points]), [send]);

  return {
    configured,
    gameAddress,
    sneakerAddress,
    owned,
    sneakers,
    veRune,
    totalRedeemedPoints,
    params,
    isLoading: isReading || transaction.isPending,
    error: readError ?? transaction.error ?? owned.error,
    refresh: async () => {
      await Promise.all([refresh(), owned.refresh()]);
    },
    activate,
    claimPoints,
    repair,
    redeem,
  };
}
