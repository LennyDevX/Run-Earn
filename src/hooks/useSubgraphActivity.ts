"use client";

import { useCallback, useEffect, useState } from "react";
import type { Address, Hash } from "viem";
import type { SubgraphActivity } from "@/lib/subgraph";

export function useSubgraphActivity(address: Address | null) {
  const [activities, setActivities] = useState<SubgraphActivity[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!address) {
      setActivities([]);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/subgraph?address=${address}`, { cache: "no-store" });
      const data = (await response.json()) as { activities?: SubgraphActivity[]; error?: string };
      if (!response.ok && data.error) throw new Error(data.error);
      setActivities(data.activities ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load indexed activity.");
      setActivities([]);
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  const addLocalActivity = useCallback((label: string, hash: Hash) => {
    setActivities((current) => [
      {
        id: hash,
        kind: "local",
        label,
        transactionHash: hash,
        timestamp: Math.floor(Date.now() / 1000),
      },
      ...current,
    ].slice(0, 20));
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void refresh());
    return () => window.cancelAnimationFrame(frame);
  }, [refresh]);

  return { activities, isLoading, error, refresh, addLocalActivity };
}
