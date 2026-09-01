"use client";

import { useState } from "react";
import Link from "next/link";
import { formatEther } from "viem";
import { CHAIN, NETWORK_LABEL, usePolygonWallet } from "@/components/Providers";
import { useWalletOverview } from "@/hooks/useWalletOverview";

function truncate(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function WalletButton() {
  const [open, setOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wallet = usePolygonWallet();
  const overview = useWalletOverview();
  const networkConnected = wallet.chainId === CHAIN.id;

  async function handleConnect(walletId: (typeof wallet.walletOptions)[number]["id"]) {
    try {
      setError(null);
      await wallet.connect(walletId);
      setConnectOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not connect the wallet.");
    }
  }

  if (!wallet.isConnected || !wallet.address) {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setConnectOpen((value) => !value)}
          disabled={wallet.isConnecting}
          className="cursor-pointer rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background transition-all duration-300 hover:scale-105 hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
        >
          {wallet.isConnecting ? "Connecting..." : "Connect wallet"}
        </button>
        {connectOpen ? (
          <div className="animate-modal-in absolute right-0 z-50 mt-3 w-80 rounded-3xl border border-foreground/8 bg-surface p-5 shadow-2xl shadow-ink/15">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div><span className="font-pixel text-[9px] text-foreground/40">CONNECT WALLET</span><p className="mt-2 text-xs leading-relaxed text-foreground/55">Choose a wallet. On mobile, the official SDK opens the wallet app and returns you to this site.</p></div>
              <button type="button" onClick={() => setConnectOpen(false)} className="text-foreground/40 hover:text-foreground" aria-label="Close wallet picker">×</button>
            </div>
            <div className="flex flex-col gap-2">
              {wallet.walletOptions.map((option) => (
                <button key={option.id} type="button" disabled={wallet.isConnecting} onClick={() => void handleConnect(option.id)} className="flex items-center justify-between rounded-2xl border border-foreground/10 bg-background px-4 py-3 text-left transition-colors hover:border-mint/50 disabled:cursor-wait disabled:opacity-50"><span className="font-semibold">{option.label}</span><span className="text-[10px] text-foreground/45">{option.installed ? "Detected" : wallet.isMobile ? "Open app" : "SDK"}</span></button>
              ))}
            </div>
            {wallet.error || error ? <p className="mt-3 rounded-xl bg-magma/10 px-3 py-2 text-xs leading-relaxed text-magma">{error ?? wallet.error}</p> : null}
          </div>
        ) : null}
        {error && !connectOpen ? <p className="absolute right-0 top-12 z-50 w-64 rounded-2xl bg-magma/10 p-3 text-xs text-magma">{error}</p> : null}
      </div>
    );
  }

  if (!networkConnected) {
    return (
      <button
        type="button"
        onClick={() => void wallet.switchToPolygon()}
        className="cursor-pointer rounded-full bg-magma px-5 py-2.5 text-sm font-semibold text-white transition-all duration-300 hover:scale-105"
      >
        Switch to Polygon
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value);
          void overview.refresh();
        }}
        className="flex cursor-pointer items-center gap-2.5 rounded-full bg-foreground py-1.5 pr-4 pl-1.5 text-sm font-semibold text-background transition-all duration-300 hover:scale-105 hover:opacity-90"
      >
        <span className="font-mono">{truncate(wallet.address)}</span>
      </button>

      {open ? (
        <div className="animate-modal-in absolute right-0 z-50 mt-3 w-72 rounded-3xl border border-foreground/8 bg-surface p-5 shadow-2xl shadow-ink/15">
          <div className="mb-4 flex items-center justify-between">
            <span className="font-pixel text-[9px] text-foreground/40">MY ACCOUNT</span>
            <span className="font-mono text-[10px] text-foreground/40">{truncate(wallet.address)}</span>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between rounded-2xl bg-background px-4 py-3">
              <span className="text-xs text-foreground/50">Balance POL</span>
              <span className="font-mono text-sm font-semibold">
                {overview.isLoading ? "…" : overview.balance === null ? "—" : `${formatEther(overview.balance).slice(0, 10)} POL`}
              </span>
            </div>

            <div className="flex items-center justify-between rounded-2xl bg-background px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="size-1.5 animate-pulse rounded-full bg-mint" />
                <div>
                  <span className="block text-[10px] text-foreground/45">Network status</span>
                  <span className="block text-xs font-semibold text-mint">Connected</span>
                </div>
              </div>
              <span className="rounded-full bg-polygon-purple/15 px-2.5 py-1 text-[10px] font-semibold text-polygon-purple">
                {NETWORK_LABEL}
              </span>
            </div>

            <div className="flex items-center justify-between rounded-2xl bg-background px-4 py-3">
              <div>
                <span className="block text-[10px] text-foreground/45">NFTs RUN&EARN</span>
                <span className="block text-xs font-semibold text-polygon-purple">
                  {overview.isLoading ? "…" : overview.sneakerCount === null ? "Not configured" : overview.sneakerCount.toString()}
                </span>
              </div>
              <Link
                href="/my-nfts"
                onClick={() => setOpen(false)}
                className="rounded-full bg-polygon-purple/15 px-3 py-1.5 text-[10px] font-semibold text-polygon-purple transition-colors hover:bg-polygon-purple/25"
              >
                View collection →
              </Link>
            </div>
          </div>

          {error || overview.error ? <p className="mt-3 rounded-xl bg-magma/10 px-3 py-2 text-xs leading-relaxed text-magma">{error ?? overview.error}</p> : null}
          <button
            type="button"
            onClick={wallet.disconnect}
            className="mt-4 w-full cursor-pointer rounded-xl px-4 py-2.5 text-left text-sm font-medium text-magma transition-colors hover:bg-magma/10"
          >
            Disconnect wallet
          </button>
        </div>
      ) : null}
    </div>
  );
}
