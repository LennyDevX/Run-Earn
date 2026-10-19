"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { encodeFunctionData, getAddress, isAddress, zeroAddress, type Address } from "viem";
import { usePolygonWallet } from "@/components/Providers";
import { sneakerVaultAbi, veSneakerStoreAbi } from "@/lib/contracts";
import { useContractTransaction } from "@/hooks/useContractTransaction";

const storeAddressEnv = process.env.NEXT_PUBLIC_VE_SNEAKER_STORE_ADDRESS;

export type VeSneakerDesign = {
  designIndex: bigint;
  name: string;
  uri: string;
  rarity: bigint;
  tier: bigint;
  price: bigint;
  discountedPrice: bigint;
  maxSupply: bigint;
  minted: bigint;
  requiredLevel: number;
  requiredPerkPlusOne: bigint;
  perkEligible: boolean | null;
  active: boolean;
  /// USD target in cents (0 when the design is priced directly in POL).
  usdTargetCents: bigint;
  /// What the Chainlink feed says the design should cost right now, or `null`
  /// when there is no target, no feed, or a stale answer. A stale oracle is a
  /// normal state, so it reads as "unknown" rather than as a zero price.
  oraclePrice: bigint | null;
};

export function useVeSneakerStore() {
  const wallet = usePolygonWallet();
  const transaction = useContractTransaction();
  const [designs, setDesigns] = useState<VeSneakerDesign[]>([]);
  const [bestDiscountBps, setBestDiscountBps] = useState(0);
  const [isReading, setIsReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);

  const configured = Boolean(storeAddressEnv && isAddress(storeAddressEnv));
  const storeAddress = useMemo<Address | null>(
    () => (configured ? getAddress(storeAddressEnv as string) : null),
    [configured],
  );

  const refresh = useCallback(async () => {
    if (!storeAddress) {
      setDesigns([]);
      setBestDiscountBps(0);
      return;
    }
    setIsReading(true);
    setReadError(null);
    try {
      const [count, vaultAddress] = await Promise.all([
        wallet.publicClient.readContract({ address: storeAddress, abi: veSneakerStoreAbi, functionName: "designCount" }),
        wallet.publicClient.readContract({ address: storeAddress, abi: veSneakerStoreAbi, functionName: "vault" }),
      ]);
      const hasVault = vaultAddress.toLowerCase() !== zeroAddress;
      const discount = wallet.address && hasVault
        ? await wallet.publicClient.readContract({
            address: vaultAddress,
            abi: sneakerVaultAbi,
            functionName: "bestDiscountBps",
            args: [wallet.address],
          })
        : 0;
      const rows = await Promise.all(
        Array.from({ length: Number(count) }, async (_, index) => {
          const designIndex = BigInt(index);
          const [raw, requiredPerkPlusOne, usdTargetCents] = await Promise.all([
            wallet.publicClient.readContract({
              address: storeAddress,
              abi: veSneakerStoreAbi,
              functionName: "designs",
              args: [designIndex],
            }),
            wallet.publicClient.readContract({
              address: storeAddress,
              abi: veSneakerStoreAbi,
              functionName: "requiredPerkPlusOne",
              args: [designIndex],
            }),
            wallet.publicClient.readContract({
              address: storeAddress,
              abi: veSneakerStoreAbi,
              functionName: "usdTargetCents",
              args: [designIndex],
            }),
          ]);
          // `designs` returns a struct, so viem hands back a named object — the
          // positional form only ever worked because the ABI wrongly declared
          // the members as flat outputs.
          const { name, uri, rarity, tier, price, maxSupply, minted, requiredLevel, active } = raw;
          const perkEligible = requiredPerkPlusOne === 0n
            ? true
            : !wallet.address || !hasVault
              ? null
              : await wallet.publicClient.readContract({
                  address: vaultAddress,
                  abi: sneakerVaultAbi,
                  functionName: "isEligible",
                  args: [wallet.address, requiredPerkPlusOne - 1n],
                });
          // `livePriceOf` reverts when the feed is unset or its answer is stale.
          // That is an expected state, not an error, so it degrades to null.
          const oraclePrice = usdTargetCents > 0n
            ? await wallet.publicClient
                .readContract({
                  address: storeAddress,
                  abi: veSneakerStoreAbi,
                  functionName: "livePriceOf",
                  args: [designIndex],
                })
                .catch(() => null)
            : null;
          return {
            designIndex,
            name,
            uri,
            rarity: BigInt(rarity),
            tier: BigInt(tier),
            price,
            discountedPrice: (price * (10_000n - BigInt(discount))) / 10_000n,
            maxSupply: BigInt(maxSupply),
            minted: BigInt(minted),
            requiredLevel: Number(requiredLevel),
            requiredPerkPlusOne,
            perkEligible,
            active,
            usdTargetCents,
            oraclePrice,
          };
        }),
      );
      setDesigns(rows);
      setBestDiscountBps(Number(discount));
    } catch (cause) {
      setReadError(cause instanceof Error ? cause.message : "Could not read the veSneaker store.");
      setDesigns([]);
      setBestDiscountBps(0);
    } finally {
      setIsReading(false);
    }
  }, [storeAddress, wallet.address, wallet.publicClient]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void refresh());
    return () => window.cancelAnimationFrame(frame);
  }, [refresh]);

  const buy = useCallback(
    async (designIndex: bigint, quantity = 1) => {
      if (!storeAddress) throw new Error("The veSneaker store is not configured.");
      if (!wallet.address) throw new Error("Connect your wallet before buying.");
      if (quantity < 1) throw new Error("Quantity must be at least 1.");
      const value = await wallet.publicClient.readContract({
        address: storeAddress,
        abi: veSneakerStoreAbi,
        functionName: "quote",
        args: [designIndex, quantity],
        account: wallet.address,
      });
      const data = quantity === 1
        ? encodeFunctionData({ abi: veSneakerStoreAbi, functionName: "buy", args: [designIndex] })
        : encodeFunctionData({ abi: veSneakerStoreAbi, functionName: "buyBatch", args: [designIndex, quantity] });
      return transaction.execute({ to: storeAddress, data, value });
    },
    [storeAddress, transaction, wallet.address, wallet.publicClient],
  );

  return {
    configured,
    storeAddress,
    designs,
    bestDiscountBps,
    isLoading: isReading || transaction.isPending,
    error: readError ?? transaction.error,
    refresh,
    buy,
  };
}
