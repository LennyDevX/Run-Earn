"use client";

import { useCallback, useEffect, useState } from "react";
import { formatUnits, getAddress, isAddress, parseAbi, type Address } from "viem";
import { usePolygonWallet } from "@/components/Providers";
import { feeSplitterAbi, modStoreAbi, sneakerMarketplaceAbi, veSneakerStoreAbi } from "@/lib/contracts";

/// ───────────────────────────── Treasury state ──────────────────────────────
///
/// Everything on this hook is read from the chain or from the contracts. Nothing
/// is a hardcoded list.
///
/// That matters more here than anywhere else in the app: a treasury view exists so
/// people can check the protocol's finances without trusting a screenshot, and one
/// whose numbers can drift from reality is worse than no view at all. If a
/// contract is redeployed and repointed, this follows automatically; a hardcoded
/// address list would keep showing the old destination and look authoritative
/// while being wrong.

/// Canonical Polygon stablecoins. USDC is where x402 settles, so it is the one
/// that will actually move.
const STABLES: Array<{ label: string; address: Address; decimals: number }> = [
  { label: "USDC", address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", decimals: 6 },
  { label: "USDC.e", address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", decimals: 6 },
];

const erc20Abi = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function symbol() view returns (string)",
]);

export type TreasuryRecipient = { account: Address; weightBps: number };
export type TreasuryStable = { label: string; address: Address; raw: bigint; formatted: string };
export type TreasuryWiring = { label: string; contract: Address | null; paysTo: Address | null };

export type TreasuryState = {
  treasury: Address | null;
  polBalance: bigint;
  stables: TreasuryStable[];
  /// Fees a contract is holding but has not forwarded. This is the number a plain
  /// balance hides: revenue that has been earned, is not spendable yet, and
  /// disappears from any view that only looks at the treasury address.
  pendingAtMarketplace: bigint;
  pendingAtSplitter: bigint;
  recipients: TreasuryRecipient[];
  wiring: TreasuryWiring[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

function envAddress(value: string | undefined): Address | null {
  const trimmed = value?.trim();
  return trimmed && isAddress(trimmed) ? getAddress(trimmed) : null;
}

export function useTreasury(): TreasuryState {
  const { publicClient } = usePolygonWallet();
  const treasury = envAddress(process.env.NEXT_PUBLIC_TREASURY_ADDRESS);
  const storeAddress = envAddress(process.env.NEXT_PUBLIC_VE_SNEAKER_STORE_ADDRESS);
  const modStoreAddress = envAddress(process.env.NEXT_PUBLIC_MOD_STORE_ADDRESS);
  const marketplaceAddress = envAddress(process.env.NEXT_PUBLIC_SNEAKER_MARKETPLACE_ADDRESS);
  const splitterAddress = envAddress(process.env.NEXT_PUBLIC_FEE_SPLITTER_ADDRESS);

  const [polBalance, setPolBalance] = useState(0n);
  const [stables, setStables] = useState<TreasuryStable[]>([]);
  const [pendingAtMarketplace, setPendingAtMarketplace] = useState(0n);
  const [pendingAtSplitter, setPendingAtSplitter] = useState(0n);
  const [recipients, setRecipients] = useState<TreasuryRecipient[]>([]);
  const [wiring, setWiring] = useState<TreasuryWiring[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (!treasury) throw new Error("NEXT_PUBLIC_TREASURY_ADDRESS is not configured.");

      const [pol, ...stableBalances] = await Promise.all([
        publicClient.getBalance({ address: treasury }),
        ...STABLES.map((token) =>
          publicClient.readContract({
            address: token.address,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [treasury],
          }),
        ),
      ]);
      setPolBalance(pol);
      setStables(
        STABLES.map((token, index) => ({
          label: token.label,
          address: token.address,
          raw: stableBalances[index] as bigint,
          formatted: formatUnits(stableBalances[index] as bigint, token.decimals),
        })),
      );

      // Fees that have been earned but have not reached the treasury.
      const [accrued, pending] = await Promise.all([
        marketplaceAddress
          ? publicClient.readContract({ address: marketplaceAddress, abi: sneakerMarketplaceAbi, functionName: "accumulatedFees" })
          : Promise.resolve(0n),
        splitterAddress
          ? publicClient.readContract({ address: splitterAddress, abi: feeSplitterAbi, functionName: "pendingFees" })
          : Promise.resolve(0n),
      ]);
      setPendingAtMarketplace(accrued as bigint);
      setPendingAtSplitter(pending as bigint);

      // Where each contract is currently configured to pay, read from the
      // contract rather than assumed.
      const [storeTreasury, modStoreTreasury, feeCollector] = await Promise.all([
        storeAddress
          ? publicClient.readContract({ address: storeAddress, abi: veSneakerStoreAbi, functionName: "treasury" })
          : Promise.resolve(null),
        modStoreAddress
          ? publicClient.readContract({ address: modStoreAddress, abi: modStoreAbi, functionName: "treasury" })
          : Promise.resolve(null),
        marketplaceAddress
          ? publicClient.readContract({ address: marketplaceAddress, abi: sneakerMarketplaceAbi, functionName: "feeCollector" })
          : Promise.resolve(null),
      ]);
      setWiring([
        { label: "veSneaker sales", contract: storeAddress, paysTo: (storeTreasury as Address | null) ?? null },
        { label: "Mod sales", contract: modStoreAddress, paysTo: (modStoreTreasury as Address | null) ?? null },
        { label: "Marketplace fees", contract: marketplaceAddress, paysTo: (feeCollector as Address | null) ?? null },
      ]);

      if (splitterAddress) {
        const count = Number(
          await publicClient.readContract({ address: splitterAddress, abi: feeSplitterAbi, functionName: "recipientCount" }),
        );
        const rows = await Promise.all(
          Array.from({ length: count }, (_, index) =>
            publicClient.readContract({
              address: splitterAddress,
              abi: feeSplitterAbi,
              functionName: "recipientAt",
              args: [BigInt(index)],
            }),
          ),
        );
        setRecipients(
          (rows as readonly (readonly [Address, bigint])[]).map(([account, weightBps]) => ({
            account,
            weightBps: Number(weightBps),
          })),
        );
      } else {
        setRecipients([]);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read the treasury.");
    } finally {
      setIsLoading(false);
    }
  }, [marketplaceAddress, modStoreAddress, publicClient, splitterAddress, storeAddress, treasury]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void refresh());
    return () => window.cancelAnimationFrame(frame);
  }, [refresh]);

  return {
    treasury,
    polBalance,
    stables,
    pendingAtMarketplace,
    pendingAtSplitter,
    recipients,
    wiring,
    isLoading,
    error,
    refresh,
  };
}
