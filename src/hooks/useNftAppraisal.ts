"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getAddress, isAddress, type Address } from "viem";
import { usePolygonWallet } from "@/components/Providers";
import { sneakerAppraiserAbi } from "@/lib/contracts";

const appraiserAddressEnv = process.env.NEXT_PUBLIC_SNEAKER_APPRAISER_ADDRESS;

export type NftAppraisal = {
  estimatedValue: bigint;
  rarity: bigint;
  tier: bigint;
};

export type AppraisalParams = {
  baseValue: bigint;
  tierValues: readonly [bigint, bigint, bigint, bigint];
  rarityWeight: bigint;
  globalMultiplierBps: bigint;
};

const EMPTY_PARAMS: AppraisalParams = {
  baseValue: 0n,
  tierValues: [0n, 0n, 0n, 0n],
  rarityWeight: 0n,
  globalMultiplierBps: 10_000n,
};

export function useNftAppraisal() {
  const wallet = usePolygonWallet();
  const [appraisals, setAppraisals] = useState<Map<string, NftAppraisal>>(new Map());
  const [params, setParams] = useState<AppraisalParams>(EMPTY_PARAMS);
  const [isReading, setIsReading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const configured = Boolean(
    appraiserAddressEnv && isAddress(appraiserAddressEnv),
  );
  const appraiserAddress = useMemo<Address | null>(
    () => configured ? getAddress(appraiserAddressEnv as string) : null,
    [configured],
  );

  const refreshParams = useCallback(async () => {
    if (!appraiserAddress || !wallet.publicClient) return;
    try {
      const [baseValue, tierValues, rarityWeight, globalMultiplierBps] = await Promise.all([
        wallet.publicClient.readContract({ address: appraiserAddress, abi: sneakerAppraiserAbi, functionName: "baseValue" }),
        wallet.publicClient.readContract({ address: appraiserAddress, abi: sneakerAppraiserAbi, functionName: "tierValueList" }),
        wallet.publicClient.readContract({ address: appraiserAddress, abi: sneakerAppraiserAbi, functionName: "rarityWeight" }),
        wallet.publicClient.readContract({ address: appraiserAddress, abi: sneakerAppraiserAbi, functionName: "globalMultiplierBps" }),
      ]);
      setParams({
        baseValue: baseValue as bigint,
        tierValues: tierValues as readonly [bigint, bigint, bigint, bigint],
        rarityWeight: rarityWeight as bigint,
        globalMultiplierBps: globalMultiplierBps as bigint,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read appraiser parameters.");
    }
  }, [appraiserAddress, wallet.publicClient]);

  const appraiseTokenIds = useCallback(async (tokenIds: readonly bigint[]) => {
    if (!appraiserAddress || !wallet.publicClient || tokenIds.length === 0) {
      setAppraisals(new Map());
      return;
    }
    setIsReading(true);
    setError(null);
    try {
      const results = await Promise.all(
        tokenIds.map((tokenId) =>
          wallet.publicClient.readContract({
            address: appraiserAddress,
            abi: sneakerAppraiserAbi,
            functionName: "appraise",
            args: [tokenId],
          }),
        ),
      );
      const map = new Map<string, NftAppraisal>();
      tokenIds.forEach((tokenId, idx) => {
        const result = results[idx] as unknown as readonly [bigint, bigint, bigint];
        map.set(tokenId.toString(), { estimatedValue: result[0], rarity: result[1], tier: result[2] });
      });
      setAppraisals(map);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not appraise NFTs.");
    } finally {
      setIsReading(false);
    }
  }, [appraiserAddress, wallet.publicClient]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void refreshParams());
    return () => window.cancelAnimationFrame(frame);
  }, [refreshParams]);

  return {
    configured,
    appraiserAddress,
    appraisals,
    params,
    isReading,
    error,
    refreshParams,
    appraiseTokenIds,
  };
}
