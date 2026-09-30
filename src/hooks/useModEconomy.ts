"use client";

import { useCallback, useMemo } from "react";
import { encodeFunctionData, getAddress, isAddress, type Address } from "viem";
import { usePolygonWallet } from "@/components/Providers";
import { modRentalAbi, modStoreAbi, sneakerModsAbi, sneakerSwapAbi } from "@/lib/contracts";
import { useContractTransaction } from "@/hooks/useContractTransaction";

const swapAddressEnv = process.env.NEXT_PUBLIC_SNEAKER_SWAP_ADDRESS;
const rentalAddressEnv = process.env.NEXT_PUBLIC_MOD_RENTAL_ADDRESS;
const modStoreAddressEnv = process.env.NEXT_PUBLIC_MOD_STORE_ADDRESS;
const modsAddressEnv = process.env.NEXT_PUBLIC_SNEAKER_MODS_ADDRESS;

function resolve(env: string | undefined): Address | null {
  return env && isAddress(env) ? getAddress(env) : null;
}

/// Interactions with the mod economy contracts: atomic swaps, rentals,
/// and the premium ModStore. Mod listing/auction on the marketplace goes
/// through useMarketplace with the mods collection address.
export function useModEconomy() {
  const wallet = usePolygonWallet();
  const transaction = useContractTransaction();

  const swapAddress = useMemo(() => resolve(swapAddressEnv), []);
  const rentalAddress = useMemo(() => resolve(rentalAddressEnv), []);
  const modStoreAddress = useMemo(() => resolve(modStoreAddressEnv), []);
  const modsAddress = useMemo(() => resolve(modsAddressEnv), []);

  const sendTo = useCallback(
    async (target: Address | null, abi: readonly unknown[], functionName: string, args: readonly unknown[], value?: bigint) => {
      if (!target) throw new Error("This contract is not configured on this network.");
      const data = encodeFunctionData({ abi, functionName, args } as never);
      return transaction.execute({ to: target, data, value });
    },
    [transaction],
  );

  const approveMod = useCallback(
    async (operator: Address, modId: bigint) => {
      if (!modsAddress) throw new Error("The mods contract is not configured.");
      const data = encodeFunctionData({
        abi: sneakerModsAbi,
        functionName: "approve",
        args: [operator, modId],
      });
      return transaction.execute({ to: modsAddress, data });
    },
    [modsAddress, transaction],
  );

  // ─── Swaps ───
  const createSwap = useCallback(
    async (
      offerCollection: Address,
      offerTokenId: bigint,
      wantCollection: Address,
      wantTokenId: bigint,
      durationSeconds: bigint,
      taker: Address,
      polTopUp: bigint,
    ) => {
      await approveMod(swapAddress as Address, offerTokenId).catch(() => undefined);
      return sendTo(
        swapAddress,
        sneakerSwapAbi,
        "createSwap",
        [taker, offerCollection, offerTokenId, wantCollection, wantTokenId, durationSeconds],
        polTopUp,
      );
    },
    [approveMod, sendTo, swapAddress],
  );
  const acceptSwap = useCallback(
    (swapId: bigint) => sendTo(swapAddress, sneakerSwapAbi, "accept", [swapId]),
    [sendTo, swapAddress],
  );
  const cancelSwap = useCallback(
    (swapId: bigint) => sendTo(swapAddress, sneakerSwapAbi, "cancel", [swapId]),
    [sendTo, swapAddress],
  );

  // ─── Rentals ───
  const listRental = useCallback(
    async (modId: bigint, pricePerDay: bigint, maxDurationSeconds: bigint) => {
      await approveMod(rentalAddress as Address, modId);
      return sendTo(rentalAddress, modRentalAbi, "list", [modId, pricePerDay, maxDurationSeconds]);
    },
    [approveMod, rentalAddress, sendTo],
  );
  const cancelRental = useCallback(
    (rentalId: bigint) => sendTo(rentalAddress, modRentalAbi, "cancelListing", [rentalId]),
    [rentalAddress, sendTo],
  );
  const rent = useCallback(
    (rentalId: bigint, days: bigint, totalPrice: bigint) =>
      sendTo(rentalAddress, modRentalAbi, "rent", [rentalId, days], totalPrice),
    [rentalAddress, sendTo],
  );
  const equipRented = useCallback(
    (rentalId: bigint, sneakerId: bigint) =>
      sendTo(rentalAddress, modRentalAbi, "equipRented", [rentalId, sneakerId]),
    [rentalAddress, sendTo],
  );
  const releaseEarly = useCallback(
    (rentalId: bigint) => sendTo(rentalAddress, modRentalAbi, "releaseEarly", [rentalId]),
    [rentalAddress, sendTo],
  );
  const returnExpired = useCallback(
    (rentalId: bigint) => sendTo(rentalAddress, modRentalAbi, "returnExpired", [rentalId]),
    [rentalAddress, sendTo],
  );

  // ─── ModStore ───
  const quoteMod = useCallback(async (designIndex: bigint) => {
    if (!modStoreAddress) throw new Error("The ModStore is not configured.");
    if (!wallet.address) throw new Error("Connect your wallet to check the store quote.");
    return wallet.publicClient.readContract({
      address: modStoreAddress,
      abi: modStoreAbi,
      functionName: "quote",
      args: [designIndex, 1],
      account: wallet.address,
    });
  }, [modStoreAddress, wallet.address, wallet.publicClient]);

  const buyMod = useCallback(
    async (designIndex: bigint) => {
      const value = await quoteMod(designIndex);
      return sendTo(modStoreAddress, modStoreAbi, "buy", [designIndex], value);
    },
    [modStoreAddress, quoteMod, sendTo],
  );

  return {
    wallet,
    swapAddress,
    rentalAddress,
    modStoreAddress,
    modsAddress,
    isLoading: transaction.isPending,
    error: transaction.error,
    approveMod,
    createSwap,
    acceptSwap,
    cancelSwap,
    listRental,
    cancelRental,
    rent,
    equipRented,
    releaseEarly,
    returnExpired,
    quoteMod,
    buyMod,
  };
}
