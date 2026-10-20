"use client";

import { useState } from "react";
import { formatEther, isAddress, parseEther, type Address, type Hash } from "viem";
import { explorerTransactionUrl, NETWORK, usePolygonWallet } from "@/components/Providers";
import { useWalletOverview } from "@/hooks/useWalletOverview";

/// A native transfer's gas comes out of the same balance being sent, so "MAX"
/// cannot mean the whole balance — the transaction would revert with
/// insufficient funds for gas. The reserve is sized for a fee spike rather than
/// today's price, and deliberately generous: leaving a fraction of a POL behind
/// is a far better outcome than a failed send at the moment someone is moving
/// their money.
const GAS_RESERVE_WEI = parseEther("0.02");

export default function PolygonTransferCard() {
  const wallet = usePolygonWallet();
  const overview = useWalletOverview();
  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("0.001");
  const [hash, setHash] = useState<Hash | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function applyMax() {
    if (overview.balance === null) return;
    const usable = overview.balance - GAS_RESERVE_WEI;
    if (usable <= 0n) {
      setError("Not enough POL to cover the amount plus gas.");
      return;
    }
    setError(null);
    setAmount(formatEther(usable));
  }

  async function sendPolygon() {
    if (!wallet.isConnected) {
      setError("Connect a compatible wallet before transferring.");
      return;
    }
    if (!isAddress(destination.trim())) {
      setError("Enter a valid EVM address.");
      return;
    }

    try {
      const value = parseEther(amount.trim());
      if (value <= 0n) throw new Error("invalid amount");
      setError(null);
      setHash(null);
      setIsConfirmed(false);
      setIsSending(true);
      const transactionHash = await wallet.sendNative(destination.trim() as Address, value);
      setHash(transactionHash);
      const receipt = await wallet.publicClient.waitForTransactionReceipt({ hash: transactionHash });
      setIsConfirmed(receipt.status === "success");
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message !== "invalid amount"
          ? cause.message
          : "Enter a valid POL amount greater than zero.",
      );
    } finally {
      setIsSending(false);
    }
  }

  return (
    <section className="rounded-3xl border border-foreground/8 bg-surface p-8">
      <div className="flex flex-col gap-3">
        <span className="font-pixel text-[9px] text-sky">NATIVE TRANSFER</span>
        <h2 className="text-2xl font-bold tracking-tight">Send POL to a friend</h2>
        <p className="max-w-lg text-sm leading-relaxed text-foreground/60">
          Your connected wallet signs the transaction directly. The active network is {NETWORK};
          always review the address before signing.
        </p>
      </div>

      <div className="mt-8 grid gap-5 md:grid-cols-[1fr_180px_auto] md:items-end">
        <label className="flex flex-col gap-2 text-sm font-semibold">
          Destination address
          <input value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="0x..." inputMode="text" autoComplete="off" spellCheck={false} enterKeyHint="done" autoCapitalize="none" className="rounded-2xl border border-foreground/10 bg-background px-4 py-3 font-mono text-xs font-normal outline-none transition-colors placeholder:text-foreground/30 focus:border-sky" />
        </label>
        <label className="flex flex-col gap-2 text-sm font-semibold">
          Amount (POL)
          <div className="flex gap-2">
            <input value={amount} onChange={(event) => setAmount(event.target.value)} type="text" inputMode="decimal" placeholder="0.001" autoComplete="off" spellCheck={false} enterKeyHint="done" className="min-w-0 flex-1 rounded-2xl border border-foreground/10 bg-background px-4 py-3 font-mono text-sm font-normal outline-none transition-colors placeholder:text-foreground/30 focus:border-sky" />
            <button
              type="button"
              onClick={applyMax}
              disabled={!wallet.isConnected || overview.balance === null}
              aria-label="Use the maximum sendable amount"
              className="shrink-0 cursor-pointer rounded-2xl border border-foreground/10 bg-background px-4 font-pixel text-[9px] text-foreground/60 transition-colors active:scale-95 hover:border-sky/50 hover:text-sky disabled:cursor-not-allowed disabled:opacity-40"
            >
              MAX
            </button>
          </div>
        </label>
        <button type="button" onClick={() => void sendPolygon()} disabled={!wallet.isConnected || isSending} className="rounded-full bg-sky px-6 py-3.5 text-sm font-semibold text-white transition-[transform,box-shadow] hover:scale-105 hover:shadow-lg hover:shadow-sky/20 disabled:cursor-not-allowed disabled:opacity-50 dark:text-ink">
          {isSending ? "Signing..." : "Send POL"}
        </button>
      </div>

      {!wallet.isConnected ? <p className="mt-5 text-xs text-foreground/50">Connect your wallet from the top bar to enable transfers.</p> : null}
      {hash ? <p className="mt-5 rounded-2xl bg-mint/10 px-4 py-3 text-sm text-mint">
        {isConfirmed ? "Transfer confirmed. " : "Transaction sent. "}
        <a href={explorerTransactionUrl(hash)} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-4">View transaction ↗</a>
      </p> : null}
      {error ? <p className="mt-5 rounded-2xl bg-magma/10 px-4 py-3 text-sm leading-relaxed text-magma">{error}</p> : null}
    </section>
  );
}
