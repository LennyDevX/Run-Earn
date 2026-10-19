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

  /// Submits several calls, as **one transaction when the wallet can** (the
  /// in-app EIP-7702 smart account) and as one transaction per call otherwise.
  ///
  /// This exists for the approve-then-act pairs: equipping a mod is
  /// `approve` + `equip`, listing on the marketplace is `approve` + `list`.
  /// Both cost two signature prompts today, and one on a smart account.
  const executeBatch = useCallback(async (calls: ContractCall[]) => {
    if (!wallet.isConnected || !wallet.address) {
      throw new Error("Connect your wallet before signing.");
    }
    if (calls.length === 0) throw new Error("Nothing to submit.");

    setIsPending(true);
    setError(null);
    setHash(null);
    try {
      if (wallet.supportsBatching && calls.length > 1) {
        const batched = await wallet.sendBatch(calls);
        setHash(batched);
        await wallet.publicClient.waitForTransactionReceipt({ hash: batched });
        return batched;
      }
      // Fallback: sequential, so the caller's flow is identical either way and
      // only the number of prompts differs.
      let last: Hash | null = null;
      for (const call of calls) {
        const nextHash = await wallet.sendContractCall(call.to, call.data, call.value);
        await wallet.publicClient.waitForTransactionReceipt({ hash: nextHash });
        setHash(nextHash);
        last = nextHash;
      }
      if (!last) throw new Error("No transaction was submitted.");
      return last;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "The transaction failed.";
      setError(message);
      throw cause;
    } finally {
      setIsPending(false);
    }
  }, [wallet]);

  return { execute, executeBatch, hash, isPending, error, clearError: () => setError(null) };
}
