"use client";

import { useCallback, useEffect, useState } from "react";

export type PolPrice = {
  usd: number;
  source: "uniswap" | "fallback";
  updatedAt: string;
  note?: string;
};

/// Fallback used before the first fetch resolves and when the route is
/// unreachable. Mirrors the `POL_USD_PRICE` deploy default.
const INITIAL_PRICE: PolPrice = {
  usd: 0.09764,
  source: "fallback",
  updatedAt: "",
  note: "Awaiting the POL price feed.",
};

/// Reads the server-side POL/USD price feed (`/api/pol-price`), which proxies
/// the Uniswap Trading API. Keeps the storefront's USD hints current without
/// exposing the API key.
export function usePolPrice() {
  const [price, setPrice] = useState<PolPrice>(INITIAL_PRICE);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (force = false) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/pol-price${force ? "?refresh=1" : ""}`, { cache: "no-store" });
      const data = (await response.json()) as PolPrice & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not load the POL price.");
      if (typeof data.usd !== "number" || !Number.isFinite(data.usd) || data.usd <= 0) {
        throw new Error("Invalid POL price payload.");
      }
      setPrice(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the POL price.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void refresh());
    return () => window.cancelAnimationFrame(frame);
  }, [refresh]);

  return { price, isLoading, error, refresh };
}
