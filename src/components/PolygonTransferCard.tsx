"use client";

import { useState } from "react";
import { isAddress, parseEther, type Address, type Hash } from "viem";
import { explorerTransactionUrl, NETWORK, usePolygonWallet } from "@/components/Providers";

export default function PolygonTransferCard() {
  const wallet = usePolygonWallet();
  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("0.001");
  const [hash, setHash] = useState<Hash | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          <input value={amount} onChange={(event) => setAmount(event.target.value)} type="text" inputMode="decimal" placeholder="0.001" autoComplete="off" spellCheck={false} enterKeyHint="done" className="rounded-2xl border border-foreground/10 bg-background px-4 py-3 font-mono text-sm font-normal outline-none transition-colors placeholder:text-foreground/30 focus:border-sky" />
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
