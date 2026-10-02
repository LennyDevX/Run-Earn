"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { getAddress, isAddress, type Address } from "viem";
import { usePolygonWallet } from "@/components/Providers";
import { useOwnedSneakers, type OwnedSneaker } from "@/hooks/useOwnedSneakers";

/// ─────────────────────────── Shared sneaker ownership ──────────────────────
///
/// One `useOwnedSneakers` instance for the whole tree.
///
/// Before this, eight surfaces called the hook independently — `useWorkshop`,
/// `useRunnerRoster`, `useSneakerGame`, `useStakingVault`, `useMarketplace`,
/// `PlayerGameProfile`, `ProfileDashboard`. On a page that mounts three of them
/// (the workshop mounts two), the same wallet's NFTs were read three times over,
/// and each read fanned out per token. A wallet with 20 sneakers turned into
/// hundreds of RPC calls for one page view.
///
/// The hook itself now batches with `multicall`, so the per-token fan-out is
/// gone. This provider removes the remaining duplication: one fetch, shared by
/// every consumer, refreshed on demand.
///
/// ### Why `playable` is derived here
///
/// Every gameplay surface — staking, the arena, the game, the workshop loadout —
/// must exclude AI collectibles. Deriving the split once, here, means a consumer
/// cannot forget the filter and accidentally offer a collectible as a runner.

const MINT_ADDRESS_ENV = process.env.NEXT_PUBLIC_SNEAKER_MINT_ADDRESS;

type SneakerOwnershipValue = {
  /** Every SneakerMint token the wallet holds. */
  sneakers: OwnedSneaker[];
  /** Official veSneakers — the only tokens that may be staked, played, or equipped. */
  playable: OwnedSneaker[];
  /** AI artwork — marketplace only. */
  collectibles: OwnedSneaker[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const SneakerOwnershipContext = createContext<SneakerOwnershipValue | null>(null);

export function SneakerOwnershipProvider({ children }: { children: ReactNode }) {
  const wallet = usePolygonWallet();

  const contractAddress = useMemo<Address | null>(
    () => (MINT_ADDRESS_ENV && isAddress(MINT_ADDRESS_ENV) ? getAddress(MINT_ADDRESS_ENV) : null),
    [],
  );

  const owned = useOwnedSneakers({
    owner: wallet.address,
    contractAddress,
    publicClient: wallet.publicClient,
  });

  const value = useMemo<SneakerOwnershipValue>(
    () => ({
      sneakers: owned.sneakers,
      playable: owned.sneakers.filter((sneaker) => sneaker.kind === 0),
      collectibles: owned.sneakers.filter((sneaker) => sneaker.kind === 1),
      isLoading: owned.isLoading,
      error: owned.error,
      refresh: owned.refresh,
    }),
    [owned.sneakers, owned.isLoading, owned.error, owned.refresh],
  );

  return <SneakerOwnershipContext.Provider value={value}>{children}</SneakerOwnershipContext.Provider>;
}

/// Read the shared ownership state.
///
/// Throws when used outside the provider rather than silently returning an empty
/// list — a missing provider would otherwise look like "this wallet owns
/// nothing", which is a very confusing bug to chase.
export function useSneakerOwnership(): SneakerOwnershipValue {
  const value = useContext(SneakerOwnershipContext);
  if (!value) {
    throw new Error("useSneakerOwnership must be used inside <SneakerOwnershipProvider>.");
  }
  return value;
}
