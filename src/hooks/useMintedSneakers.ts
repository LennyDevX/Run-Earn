"use client";

import { useCallback, useEffect, useState } from "react";
import { getMintedSneakers, type MintedSneaker } from "@/lib/sneaker-nft";

const EVENT_NAME = "runearn:nfts-updated";

export function notifyMintedSneakersUpdated() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT_NAME));
}

export function useMintedSneakers(owner: string | null) {
  const [sneakers, setSneakers] = useState<MintedSneaker[]>([]);
  const [isReady, setIsReady] = useState(false);

  const refresh = useCallback(() => {
    setSneakers(getMintedSneakers(owner));
    setIsReady(true);
  }, [owner]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(refresh);
    window.addEventListener(EVENT_NAME, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener(EVENT_NAME, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [refresh]);

  return { sneakers, isReady, refresh };
}
