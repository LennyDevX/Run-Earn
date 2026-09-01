"use client";

import { useCallback, useState } from "react";
import { type Address, type Hash, type Hex } from "viem";
import { usePolygonWallet } from "@/components/Providers";

type ContractCall = {
  to: Address;
  data: Hex;
  value?: bigint;
};

export function useContractTransaction() {
  const wallet = usePolygonWallet();
  const [hash, setHash] = useState<Hash | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(async ({ to, data, value }: ContractCall) => {
    if (!wallet.isConnected || !wallet.address) {
      throw new Error("Connect your wallet before signing.");
    }

    setIsPending(true);
    setError(null);
    setHash(null);
    try {
      const nextHash = await wallet.sendContractCall(to, data, value);
      setHash(nextHash);
      await wallet.publicClient.waitForTransactionReceipt({ hash: nextHash });
      return nextHash;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "The transaction failed.";
      setError(message);
      throw cause;
    } finally {
      setIsPending(false);
    }
  }, [wallet]);

  return { execute, hash, isPending, error, clearError: () => setError(null) };
}
