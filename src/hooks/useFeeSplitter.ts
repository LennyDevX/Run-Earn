"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getAddress, isAddress, type Address } from "viem";
import { usePolygonWallet } from "@/components/Providers";
import { feeSplitterAbi } from "@/lib/contracts";

const splitterAddressEnv = process.env.NEXT_PUBLIC_FEE_SPLITTER_ADDRESS;

export type FeeSplitterRecipient = {
  account: Address;
  weightBps: bigint;
};

export function useFeeSplitter() {
  const wallet = usePolygonWallet();
  const [pendingFees, setPendingFees] = useState<bigint | null>(null);
  const [totalDistributed, setTotalDistributed] = useState<bigint | null>(null);
  const [recipients, setRecipients] = useState<FeeSplitterRecipient[]>([]);
  const [isReading, setIsReading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const configured = Boolean(splitterAddressEnv && isAddress(splitterAddressEnv));
  const splitterAddress = useMemo<Address | null>(
    () => (configured ? getAddress(splitterAddressEnv as string) : null),
    [configured],
  );

  const refresh = useCallback(async () => {
    if (!splitterAddress) {
      setPendingFees(null);
      setTotalDistributed(null);
      setRecipients([]);
      setError(null);
      return;
    }
    setIsReading(true);
    setError(null);
    try {
      const [pending, distributed, count] = await Promise.all([
        wallet.publicClient.readContract({ address: splitterAddress, abi: feeSplitterAbi, functionName: "pendingFees" }),
        wallet.publicClient.readContract({ address: splitterAddress, abi: feeSplitterAbi, functionName: "totalDistributed" }),
        wallet.publicClient.readContract({ address: splitterAddress, abi: feeSplitterAbi, functionName: "recipientCount" }),
      ]);
      const rows = await Promise.all(
        Array.from({ length: Number(count) }, (_, index) =>
          wallet.publicClient.readContract({
            address: splitterAddress,
            abi: feeSplitterAbi,
            functionName: "recipientAt",
            args: [BigInt(index)],
          }),
        ),
      );
      setPendingFees(pending);
      setTotalDistributed(distributed);
      setRecipients(rows.map(([account, weightBps]) => ({ account, weightBps })));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read the fee splitter.");
    } finally {
      setIsReading(false);
    }
  }, [splitterAddress, wallet.publicClient]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void refresh());
    return () => window.cancelAnimationFrame(frame);
  }, [refresh]);

  return {
    configured,
    splitterAddress,
    pendingFees,
    totalDistributed,
    recipients,
    isLoading: isReading,
    error,
    refresh,
  };
}
