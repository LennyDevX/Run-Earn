"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { formatEther } from "viem";
import { CHAIN, NETWORK_LABEL, usePolygonWallet } from "@/components/Providers";
import { useWalletOverview } from "@/hooks/useWalletOverview";
import MoreSheet from "@/components/MoreSheet";

function truncate(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/// Offered alongside the email code. Same in-app wallet, different first factor.
const SOCIAL = [
  { id: "google", label: "Google" },
  { id: "apple", label: "Apple" },
  { id: "discord", label: "Discord" },
  { id: "github", label: "GitHub" },
  { id: "x", label: "X" },
] as const;

/// Popover on desktop, bottom sheet on mobile (the `isMobile` flag comes from the
/// wallet context, so no extra matchMedia listener is needed).
export default function WalletButton() {
  const [open, setOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inAppStep, setInAppStep] = useState<"idle" | "email" | "code">("idle");
  const [inAppEmail, setInAppEmail] = useState("");
  const [inAppCode, setInAppCode] = useState("");
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<number | null>(null);
  const wallet = usePolygonWallet();
  const overview = useWalletOverview();
  const { refresh: refreshOverview } = overview;
  const networkConnected = wallet.chainId === CHAIN.id;
  const isMobile = wallet.isMobile;

  // Close the desktop popovers on Escape or an outside click.
  useEffect(() => {
    if ((!open && !connectOpen) || isMobile) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      setConnectOpen(false);
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-wallet-popover]")) return;
      setOpen(false);
      setConnectOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [connectOpen, isMobile, open]);

  // Closing the picker abandons the in-app flow, so reopening it starts at the
  // wallet list rather than stranded on an OTP form.
  useEffect(() => {
    if (connectOpen) return;
    const frame = window.requestAnimationFrame(() => setInAppStep("idle"));
    return () => window.cancelAnimationFrame(frame);
  }, [connectOpen]);

  // The "Copied" label is on a timer; clear it so it cannot fire into an
  // unmounted component.
  useEffect(
    () => () => {
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (!open || !wallet.address) return;
    const frame = window.requestAnimationFrame(() => void refreshOverview());
    return () => window.cancelAnimationFrame(frame);
  }, [open, refreshOverview, wallet.address]);

  async function handleConnect(walletId: (typeof wallet.walletOptions)[number]["id"]) {
    // The in-app wallet is two steps — address, then the emailed code — so it
    // hands off to its own panel instead of connecting here.
    if (walletId === "in-app") {
      setError(null);
      setInAppStep("email");
      return;
    }
    try {
      setError(null);
      await wallet.connect(walletId);
      setConnectOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not connect the wallet.");
    }
  }

  async function handleSendCode() {
    setError(null);
    try {
      await wallet.startInAppEmail(inAppEmail.trim());
      setInAppStep("code");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send the code.");
    }
  }

  async function handleVerifyCode() {
    setError(null);
    try {
      await wallet.completeInAppEmail(inAppEmail.trim(), inAppCode.trim());
      setConnectOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not verify the code.");
    }
  }

  async function handleSocial(strategy: (typeof SOCIAL)[number]["id"]) {
    setError(null);
    try {
      await wallet.connectInAppSocial(strategy);
      setConnectOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign in.");
    }
  }

  async function handleSwitchNetwork() {
    setError(null);
    try {
      await wallet.switchToPolygon();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not switch networks.");
    }
  }

  /// The in-app wallet is created by thirdweb and the user has no other record of
  /// it, so copying the address is not a nicety — it is how they keep it.
  /// `navigator.clipboard` needs a secure context, so on plain HTTP the write
  /// rejects; the failure says what to do instead of going mute.
  async function copyAddress() {
    if (!wallet.address) return;
    try {
      await navigator.clipboard.writeText(wallet.address);
      setCopied(true);
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy the address — select it and copy manually.");
    }
  }

  const pickerPanel: ReactNode = (
    <>
      <p className="text-xs leading-relaxed text-foreground/55">
        Choose a wallet. On mobile, the official SDK opens the wallet app and returns you to this
        site.
      </p>
      <div className="mt-4 flex flex-col gap-2">
        {wallet.walletOptions.map((option) => (
          <button
            key={option.id}
            type="button"
            disabled={wallet.isConnecting}
            onClick={() => void handleConnect(option.id)}
            className="flex min-h-[3.25rem] items-center justify-between rounded-2xl border border-foreground/10 bg-background px-4 py-3 text-left transition-colors active:scale-[0.99] hover:border-mint/50 disabled:cursor-wait disabled:opacity-50"
          >
            <span className="font-semibold">{option.label}</span>
            <span className="text-[10px] text-foreground/45">
              {option.kind === "embedded" ? "No install" : option.installed ? "Detected" : wallet.isMobile ? "Open app" : "SDK"}
            </span>
          </button>
        ))}
      </div>
      {wallet.error || error ? (
        <p className="mt-3 rounded-xl bg-magma/10 px-3 py-2 text-xs leading-relaxed text-magma">
          {error ?? wallet.error}
        </p>
      ) : null}
    </>
  );

  /// The in-app wallet: an email code, or a social provider. No extension, no
  /// seed phrase — the account lives in this site and is recoverable from the
  /// same email.
  const inAppPanel: ReactNode = (
    <>
      <p className="text-xs leading-relaxed text-foreground/55">
        {inAppStep === "email"
          ? "Enter your email and we'll send a code. No extension and no seed phrase — the wallet lives in this site."
          : `We sent a code to ${inAppEmail}. Enter it to finish.`}
      </p>

      {inAppStep === "email" ? (
        <form
          className="mt-4 flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSendCode();
          }}
        >
          <input
            type="email"
            value={inAppEmail}
            onChange={(event) => setInAppEmail(event.target.value)}
            placeholder="you@example.com"
            inputMode="email" autoComplete="email" enterKeyHint="done" spellCheck={false} autoCapitalize="none"
            className="min-h-11 rounded-2xl border border-foreground/15 bg-background px-4 text-sm outline-none transition-colors focus:border-mint"
          />
          <button
            type="submit"
            disabled={wallet.isConnecting || !inAppEmail.includes("@")}
            className="min-h-11 cursor-pointer rounded-2xl bg-mint px-4 text-sm font-semibold text-ink transition-transform active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {wallet.isConnecting ? "Sending…" : "Send code"}
          </button>
        </form>
      ) : (
        <form
          className="mt-4 flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void handleVerifyCode();
          }}
        >
          <input
            type="text"
            value={inAppCode}
            onChange={(event) => setInAppCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="123456"
            inputMode="numeric" autoComplete="one-time-code" enterKeyHint="done" spellCheck={false}
            className="min-h-11 rounded-2xl border border-foreground/15 bg-background px-4 font-mono text-lg tracking-[0.3em] outline-none transition-colors focus:border-mint"
          />
          <button
            type="submit"
            disabled={wallet.isConnecting || inAppCode.length < 6}
            className="min-h-11 cursor-pointer rounded-2xl bg-mint px-4 text-sm font-semibold text-ink transition-transform active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {wallet.isConnecting ? "Verifying…" : "Verify"}
          </button>
        </form>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {SOCIAL.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            disabled={wallet.isConnecting}
            onClick={() => void handleSocial(id)}
            className="min-h-9 cursor-pointer rounded-full border border-foreground/10 px-3 text-xs font-medium transition-colors active:scale-95 hover:border-mint/50 disabled:opacity-50"
          >
            {label}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => {
          setInAppStep("idle");
          setError(null);
        }}
        className="mt-4 text-xs text-foreground/50 underline-offset-4 hover:underline"
      >
        Use another wallet
      </button>

      {wallet.error || error ? (
        <p className="mt-3 rounded-xl bg-magma/10 px-3 py-2 text-xs leading-relaxed text-magma">
          {error ?? wallet.error}
        </p>
      ) : null}
    </>
  );

  const connectPanel: ReactNode = inAppStep === "idle" ? pickerPanel : inAppPanel;

  const accountPanel: ReactNode = (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="truncate font-mono text-[10px] text-foreground/40">{truncate(wallet.address ?? "")}</span>
        <button
          type="button"
          onClick={() => void copyAddress()}
          aria-label="Copy wallet address"
          className="shrink-0 cursor-pointer rounded-full border border-foreground/10 px-2.5 py-1 font-pixel text-[9px] text-foreground/50 transition-colors active:scale-95 hover:border-mint/50 hover:text-mint"
        >
          {copied ? "COPIED" : "COPY"}
        </button>
      </div>
      <div className="mt-4 flex flex-col gap-3">
        <div className="flex items-center justify-between rounded-2xl bg-background px-4 py-3">
          <span className="text-xs text-foreground/50">Balance POL</span>
          <span className="font-mono text-sm font-semibold">
            {overview.isLoading && overview.balance === null
              ? "Loading…"
              : overview.balance === null
                ? "Unavailable"
                : `${formatEther(overview.balance).slice(0, 10)} POL`}
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
            <span className="block text-[10px] text-foreground/45">NFTs Airen</span>
            <span className="block text-xs font-semibold text-polygon-purple">
              {overview.isLoading
                ? "…"
                : overview.sneakerCount === null
                  ? overview.sneakerCountError ? "Unavailable" : "Not configured"
                  : overview.sneakerCount.toString()}
            </span>
          </div>
          <Link
            href="/my-nfts"
            onClick={() => setOpen(false)}
            className="rounded-full bg-polygon-purple/15 px-3 py-2 text-[10px] font-semibold text-polygon-purple transition-colors hover:bg-polygon-purple/25"
          >
            View collection →
          </Link>
        </div>
      </div>

      {error || overview.error ? (
        <div className="mt-3 flex items-start justify-between gap-3 rounded-xl bg-magma/10 px-3 py-2">
          <p className="min-w-0 text-xs leading-relaxed text-magma">{error ?? overview.error}</p>
          {overview.error ? (
            <button
              type="button"
              onClick={() => void refreshOverview()}
              className="min-h-8 shrink-0 cursor-pointer rounded-md px-2 text-xs font-semibold text-brand hover:bg-brand/10"
            >
              Retry
            </button>
          ) : null}
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => {
          wallet.disconnect();
          setOpen(false);
        }}
        className="mt-4 min-h-11 w-full cursor-pointer rounded-xl px-4 py-3 text-left text-sm font-medium text-magma transition-colors hover:bg-magma/10"
      >
        Disconnect wallet
      </button>
    </>
  );

  if (!wallet.isConnected || !wallet.address) {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setConnectOpen((value) => !value)}
          disabled={wallet.isConnecting}
          aria-haspopup={isMobile ? "dialog" : "menu"}
          aria-expanded={connectOpen}
          className="min-h-11 cursor-pointer rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background transition-[transform,opacity] duration-300 hover:scale-105 hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
        >
          {wallet.isConnecting ? "Connecting..." : "Connect wallet"}
        </button>

        {connectOpen && !isMobile ? (
          <div
            data-wallet-popover
            className="animate-modal-in absolute right-0 z-50 mt-3 w-[min(20rem,calc(100vw-2rem))] rounded-3xl border border-foreground/8 bg-surface p-5 shadow-2xl shadow-ink/15"
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <span className="font-pixel text-[9px] text-foreground/40">CONNECT WALLET</span>
              <button
                type="button"
                onClick={() => setConnectOpen(false)}
                aria-label="Close wallet picker"
                className="text-foreground/40 hover:text-foreground"
              >
                ×
              </button>
            </div>
            {connectPanel}
          </div>
        ) : null}

        {connectOpen && isMobile ? (
          <MoreSheet
            open
            onClose={() => setConnectOpen(false)}
            title="CONNECT WALLET"
            description="Choose a wallet. The official SDK opens the wallet app and returns you here."
          >
            {connectPanel}
          </MoreSheet>
        ) : null}

        {error && !connectOpen ? (
          <p className="absolute right-0 top-14 z-50 w-64 rounded-2xl bg-magma/10 p-3 text-xs text-magma">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  if (!networkConnected) {
    return (
      <div className="flex flex-col items-end gap-2">
        <button
          type="button"
          onClick={() => void handleSwitchNetwork()}
          className="min-h-11 cursor-pointer rounded-full bg-magma px-5 py-2.5 text-sm font-semibold text-white transition-transform duration-300 hover:scale-105"
        >
          Switch to {NETWORK_LABEL}
        </button>
        {error ? <p className="max-w-64 rounded-xl bg-magma/10 px-3 py-2 text-xs text-magma">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup={isMobile ? "dialog" : "menu"}
        aria-expanded={open}
        className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-full bg-foreground px-4 py-1.5 text-sm font-semibold text-background transition-[transform,opacity] duration-300 hover:scale-105 hover:opacity-90"
      >
        <span className="font-mono">{truncate(wallet.address)}</span>
      </button>

      {open && !isMobile ? (
        <div
          data-wallet-popover
          className="animate-modal-in absolute right-0 z-50 mt-3 w-[min(18rem,calc(100vw-2rem))] rounded-3xl border border-foreground/8 bg-surface p-5 shadow-2xl shadow-ink/15"
        >
          <div className="mb-1 flex items-center justify-between">
            <span className="font-pixel text-[9px] text-foreground/40">MY ACCOUNT</span>
          </div>
          {accountPanel}
        </div>
      ) : null}

      {open && isMobile ? (
        <MoreSheet
          open
          onClose={() => setOpen(false)}
          title="MY ACCOUNT"
          description={`${truncate(wallet.address)} · ${NETWORK_LABEL}`}
        >
          {accountPanel}
        </MoreSheet>
      ) : null}
    </div>
  );
}
