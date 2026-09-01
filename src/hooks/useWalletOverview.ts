"use client";

import { useCallback, useState } from "react";
import { isAddress, type Address } from "viem";
import { usePolygonWallet } from "@/components/Providers";
import { erc721BalanceAbi } from "@/lib/contracts";
import { getMintedSneakers } from "@/lib/sneaker-nft";
import { describeWalletError } from "@/lib/wallet-errors";

const sneakerMintAddress = process.env.NEXT_PUBLIC_SNEAKER_MINT_ADDRESS;

export function useWalletOverview() {
  const wallet = usePolygonWallet();
  const [balance, setBalance] = useState<bigint | null>(null);
  const [sneakerCount, setSneakerCount] = useState<bigint | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!wallet.address) return;
    setIsLoading(true);
    setError(null);
    try {
      setBalance(await wallet.publicClient.getBalance({ address: wallet.address }));
      if (sneakerMintAddress && isAddress(sneakerMintAddress)) {
        const count = await wallet.publicClient.readContract({
          address: sneakerMintAddress as Address,
          abi: erc721BalanceAbi,
          functionName: "balanceOf",
          args: [wallet.address],
        });
        setSneakerCount(count);
      } else {
        setSneakerCount(BigInt(getMintedSneakers(wallet.address).length));
      }
    } catch (cause) {
      setError(describeWalletError(cause, "Could not read the wallet."));
    } finally {
      setIsLoading(false);
    }
  }, [wallet.address, wallet.publicClient]);

  return { balance, sneakerCount, isLoading, error, refresh };
}
