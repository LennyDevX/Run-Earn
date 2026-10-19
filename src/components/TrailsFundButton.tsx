"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

/// Trails funding widget — top up the connected wallet with a card, Apple Pay,
/// an exchange balance, or any token on any chain, landing as POL on Polygon.
/// It exists so a visitor who has never held POL can still buy a veSneaker or
/// stake, instead of dead-ending on "insufficient funds".
///
/// Two deliberate constraints:
///
/// 1. **Nothing renders while `NEXT_PUBLIC_TRAILS_API_KEY` is unset.** The
///    widget is an addition, not a dependency — the store and staking flows
///    behave exactly as they did before until a key is configured.
/// 2. **The SDK is fetched on click, not on mount.** `0xtrails` pulls in ~337
///    packages (Sequence, Mesh, Radix, its own shadow-root UI). Mounting it
///    eagerly would put that weight on every visitor to `/collection` and
///    `/staking` even when they never fund anything, so the chunk is only
///    requested once the visitor asks for it.
const TrailsWidget = dynamic(() => import("0xtrails").then((mod) => mod.TrailsWidget), {
  ssr: false,
  loading: () => (
    <p className="text-xs text-foreground/50" role="status">
      Loading funding options…
    </p>
  ),
});

const TRAILS_API_KEY_FALLBACK = process.env.NEXT_PUBLIC_TRAILS_API_KEY ?? "";
/// Polygon mainnet. Kept configurable so a staging deploy can point the widget
/// at Amoy without a code change.
const DEST_CHAIN_ID = Number(process.env.NEXT_PUBLIC_TRAILS_DEST_CHAIN_ID ?? 137);
/// Native POL — the currency every Airen sale and the staking vault already take.
const DEST_TOKEN = process.env.NEXT_PUBLIC_TRAILS_DEST_TOKEN ?? "POL";

type Props = {
  /// Trails API key. The widget runs in the browser, so a server-only
  /// `TRAILS_API_KEY` has to be read by the page and handed down — Next does not
  /// expose unprefixed variables to client code. The `NEXT_PUBLIC_` fallback
  /// keeps a deployment that prefers the prefix working with no code change.
  apiKey?: string;
  /** Trigger copy. Defaults to the generic funding label. */
  label?: string;
  className?: string;
};

export default function TrailsFundButton({
  apiKey = "",
  label = "Add funds — card, Apple Pay, or any token",
  className = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const trailsApiKey = apiKey || TRAILS_API_KEY_FALLBACK;

  // Unconfigured is the default state: render nothing at all.
  if (!trailsApiKey) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`min-h-11 cursor-pointer rounded-full border border-brand/30 bg-brand/5 px-5 text-xs font-semibold text-brand transition-colors active:scale-95 hover:bg-brand/10 ${className}`}
      >
        {label}
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-foreground/10 bg-background p-4">
      <TrailsWidget
        apiKey={trailsApiKey}
        renderInline
        toChainId={DEST_CHAIN_ID}
        toToken={DEST_TOKEN}
      />
    </div>
  );
}
