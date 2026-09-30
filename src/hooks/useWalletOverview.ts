"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isAddress, type Address } from "viem";
import { usePolygonWallet } from "@/components/Providers";
import { erc721BalanceAbi } from "@/lib/contracts";
import { getMintedSneakers } from "@/lib/sneaker-nft";
import { describeWalletError } from "@/lib/wallet-errors";

const sneakerMintAddress = process.env.NEXT_PUBLIC_SNEAKER_MINT_ADDRESS;

export function useWalletOverview() {
  const wallet = usePolygonWallet();
  const requestId = useRef(0);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [sneakerCount, setSneakerCount] = useState<bigint | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [sneakerCountError, setSneakerCountError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    const owner = wallet.address;
    const activeRequest = ++requestId.current;
    if (!owner) {
      setBalance(null);
      setSneakerCount(null);
      setBalanceError(null);
      setSneakerCountError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setBalanceError(null);
    setSneakerCountError(null);

    const sneakerCountRead = sneakerMintAddress && isAddress(sneakerMintAddress)
      ? wallet.publicClient.readContract({
          address: sneakerMintAddress as Address,
          abi: erc721BalanceAbi,
          functionName: "balanceOf",
          args: [owner],
        })
      : Promise.resolve().then(() => BigInt(getMintedSneakers(owner).length));

    const [balanceRead, countRead] = await Promise.allSettled([
      wallet.publicClient.getBalance({ address: owner }),
      sneakerCountRead,
    ]);
    if (activeRequest !== requestId.current) return;

    if (balanceRead.status === "fulfilled") {
      setBalance(balanceRead.value);
    } else {
      setBalance(null);
      setBalanceError(describeWalletError(balanceRead.reason, "Could not read the POL balance."));
    }

    if (countRead.status === "fulfilled") {
      setSneakerCount(countRead.value);
    } else {
      setSneakerCount(null);
      setSneakerCountError(describeWalletError(countRead.reason, "Could not read the Airen NFT count."));
    }
    setIsLoading(false);
  }, [wallet.address, wallet.publicClient]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void refresh());
    return () => {
      window.cancelAnimationFrame(frame);
      requestId.current += 1;
    };
  }, [refresh]);

  const error = [balanceError, sneakerCountError].filter(Boolean).join(" ") || null;

  return { balance, sneakerCount, balanceError, sneakerCountError, isLoading, error, refresh };
}
