"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { encodeFunctionData, getAddress, isAddress, type Address } from "viem";
import { usePolygonWallet } from "@/components/Providers";
import { sneakerGameAbi } from "@/lib/contracts";
import { useContractTransaction } from "@/hooks/useContractTransaction";
import { useOwnedSneakers, type OwnedSneaker } from "@/hooks/useOwnedSneakers";

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

  const owned = useOwnedSneakers({
    owner: wallet.address,
    contractAddress: sneakerAddress,
    publicClient: wallet.publicClient,
  });

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
      const [maxDurability, wearPerActivation, repairCostPoints, redemptionRate, redemptionEnabled, tier0, tier1, tier2, tier3, veRuneBalance, redeemed] =
        await Promise.all([
          wallet.publicClient.readContract({ address: gameAddress, abi: sneakerGameAbi, functionName: "maxDurability" }),
          wallet.publicClient.readContract({ address: gameAddress, abi: sneakerGameAbi, functionName: "wearPerActivation" }),
          wallet.publicClient.readContract({ address: gameAddress, abi: sneakerGameAbi, functionName: "repairCostPoints" }),
          wallet.publicClient.readContract({ address: gameAddress, abi: sneakerGameAbi, functionName: "redemptionRate" }),
          wallet.publicClient.readContract({ address: gameAddress, abi: sneakerGameAbi, functionName: "redemptionEnabled" }),
          wallet.publicClient.readContract({ address: gameAddress, abi: sneakerGameAbi, functionName: "tierBasePointsPerDay", args: [0n] }),
          wallet.publicClient.readContract({ address: gameAddress, abi: sneakerGameAbi, functionName: "tierBasePointsPerDay", args: [1n] }),
          wallet.publicClient.readContract({ address: gameAddress, abi: sneakerGameAbi, functionName: "tierBasePointsPerDay", args: [2n] }),
          wallet.publicClient.readContract({ address: gameAddress, abi: sneakerGameAbi, functionName: "tierBasePointsPerDay", args: [3n] }),
          wallet.publicClient.readContract({ address: gameAddress, abi: sneakerGameAbi, functionName: "veRuneBalance", args: [wallet.address] }),
          wallet.publicClient.readContract({ address: gameAddress, abi: sneakerGameAbi, functionName: "totalRedeemed", args: [wallet.address] }),
        ]);

      setParams({
        maxDurability: BigInt(maxDurability as number),
        wearPerActivation: BigInt(wearPerActivation as number),
        repairCostPoints: repairCostPoints as bigint,
        redemptionRate: redemptionRate as bigint,
        redemptionEnabled: redemptionEnabled as boolean,
        tierBasePointsPerDay: [tier0 as bigint, tier1 as bigint, tier2 as bigint, tier3 as bigint],
      });
      setVeRune(veRuneBalance as bigint);
      setTotalRedeemedPoints(redeemed as bigint);

      const tokenIds = owned.sneakers.map((s) => s.tokenId);
      const readStat = (functionName: string, tokenId: bigint, fallback: bigint | number | boolean) =>
        wallet.publicClient
          .readContract({ address: gameAddress, abi: sneakerGameAbi, functionName, args: [tokenId] } as never)
          .catch(() => fallback);
      const [states, pendings, canActives, secondsUntil, powers, healths, energies, maxEnergies, earnRates] = await Promise.all([
        Promise.all(
          tokenIds.map((tokenId) =>
            wallet.publicClient
              .readContract({ address: gameAddress, abi: sneakerGameAbi, functionName: "sneakers", args: [tokenId] })
              .catch(() => null),
          ),
        ),
        Promise.all(tokenIds.map((tokenId) => readStat("pendingPoints", tokenId, 0n))),
        Promise.all(tokenIds.map((tokenId) => readStat("canActivate", tokenId, false))),
        Promise.all(tokenIds.map((tokenId) => readStat("secondsUntilActivation", tokenId, 0n))),
        Promise.all(tokenIds.map((tokenId) => readStat("powerOf", tokenId, 0n))),
        Promise.all(tokenIds.map((tokenId) => readStat("healthOf", tokenId, 0))),
        Promise.all(tokenIds.map((tokenId) => readStat("energyOf", tokenId, 0))),
        Promise.all(tokenIds.map((tokenId) => readStat("maxEnergyOf", tokenId, 0))),
        Promise.all(tokenIds.map((tokenId) => readStat("earnRatePerSecond", tokenId, 0n))),
      ]);

      const next: GameSneaker[] = owned.sneakers.map((sneaker, idx) => {
        const raw = states[idx] as
          | readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint]
          | null;
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
          pending: pendings[idx] as bigint,
          canActivate: canActives[idx] as boolean,
          secondsUntilActivation: secondsUntil[idx] as bigint,
          power: powers[idx] as bigint,
          health: Number(healths[idx]),
          energy: Number(energies[idx]),
          maxEnergy: Number(maxEnergies[idx]),
          earnRate: earnRates[idx] as bigint,
        };
      });
      setSneakers(next);
    } catch (cause) {
      setReadError(cause instanceof Error ? cause.message : "Could not read the game state.");
    } finally {
      setIsReading(false);
    }
  }, [gameAddress, owned.sneakers, wallet.address, wallet.publicClient]);

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
