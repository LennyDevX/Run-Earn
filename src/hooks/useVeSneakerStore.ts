"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { encodeFunctionData, getAddress, isAddress, type Address } from "viem";
import { usePolygonWallet } from "@/components/Providers";
import { veSneakerStoreAbi } from "@/lib/contracts";
import { useContractTransaction } from "@/hooks/useContractTransaction";

const storeAddressEnv = process.env.NEXT_PUBLIC_VE_SNEAKER_STORE_ADDRESS;

export type VeSneakerDesign = {
  designIndex: bigint;
  name: string;
  uri: string;
  rarity: bigint;
  tier: bigint;
  price: bigint;
  maxSupply: bigint;
  minted: bigint;
  requiredLevel: number;
  active: boolean;
};

export function useVeSneakerStore() {
  const wallet = usePolygonWallet();
  const transaction = useContractTransaction();
  const [designs, setDesigns] = useState<VeSneakerDesign[]>([]);
  const [isReading, setIsReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);

  const configured = Boolean(storeAddressEnv && isAddress(storeAddressEnv));
  const storeAddress = useMemo<Address | null>(
    () => (configured ? getAddress(storeAddressEnv as string) : null),
    [configured],
  );

  const refresh = useCallback(async () => {
    if (!storeAddress || !wallet.publicClient) {
      setDesigns([]);
      return;
    }
    setIsReading(true);
    setReadError(null);
    try {
      const count = (await wallet.publicClient.readContract({
        address: storeAddress,
        abi: veSneakerStoreAbi,
        functionName: "designCount",
      })) as bigint;

      const rows = await Promise.all(
        Array.from({ length: Number(count) }, (_, index) =>
          wallet.publicClient.readContract({
            address: storeAddress,
            abi: veSneakerStoreAbi,
            functionName: "designs",
            args: [BigInt(index)],
          }),
        ),
      );

      setDesigns(
        rows.map((row, index) => {
          const [name, uri, rarity, tier, price, maxSupply, minted, requiredLevel, active] =
            row as readonly [
              string,
              string,
              number,
              number,
              bigint,
              number,
              number,
              number,
              boolean,
            ];
          return {
            designIndex: BigInt(index),
            name,
            uri,
            rarity: BigInt(rarity),
            tier: BigInt(tier),
            price,
            maxSupply: BigInt(maxSupply),
            minted: BigInt(minted),
            requiredLevel: Number(requiredLevel),
            active,
          };
        }),
      );
    } catch (cause) {
      setReadError(cause instanceof Error ? cause.message : "Could not read the veSneaker store.");
      setDesigns([]);
    } finally {
      setIsReading(false);
    }
  }, [storeAddress, wallet.publicClient]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void refresh());
    return () => window.cancelAnimationFrame(frame);
  }, [refresh]);

  const buy = useCallback(
    async (designIndex: bigint, price: bigint, quantity = 1) => {
      if (!storeAddress) throw new Error("The veSneaker store is not configured.");
      if (quantity < 1) throw new Error("Quantity must be at least 1.");
      const value = price * BigInt(quantity);
      const data =
        quantity === 1
          ? encodeFunctionData({ abi: veSneakerStoreAbi, functionName: "buy", args: [designIndex] })
          : encodeFunctionData({
              abi: veSneakerStoreAbi,
              functionName: "buyBatch",
              args: [designIndex, quantity],
            });
      return transaction.execute({ to: storeAddress, data, value });
    },
    [storeAddress, transaction],
  );

  return {
    configured,
    storeAddress,
    designs,
    isLoading: isReading || transaction.isPending,
    error: readError ?? transaction.error,
    refresh,
    buy,
  };
}
