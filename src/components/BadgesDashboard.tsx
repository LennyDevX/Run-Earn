"use client";

import { useState } from "react";
import { formatEther } from "viem";
import { NETWORK_LABEL, usePolygonWallet } from "@/components/Providers";
import { useBadges } from "@/hooks/useBadges";
import { useSubgraphActivity } from "@/hooks/useSubgraphActivity";
import { REQ_KIND_LABELS, SLOTS } from "@/lib/mods";
import { RARITIES } from "@/lib/sneaker-nft";

function formatThreshold(kind: number, threshold: bigint) {
  if (kind === 1) return `${Number(formatEther(threshold)).toLocaleString()} veRUNE`;
  if (kind === 3) return `${Number(formatEther(threshold)).toLocaleString()} POL`;
  return threshold.toString();
}

export default function BadgesDashboard() {
  const wallet = usePolygonWallet();
  const badges = useBadges();
  const { addLocalActivity } = useSubgraphActivity(wallet.address);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  async function runAction(action: () => Promise<`0x${string}`>, label: string) {
    setActionError(null);
    setActionNotice(null);
    try {
      const hash = await action();
      addLocalActivity(label, hash);
      setActionNotice(`${label} confirmed on-chain.`);
      await badges.refresh();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : `${label} failed.`);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-foreground/10 bg-surface px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="relative flex size-3">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-polygon-purple opacity-75" />
            <span className="relative inline-flex size-3 rounded-full bg-polygon-purple" />
          </div>
          <div>
            <span className="font-pixel text-[9px] text-polygon-purple">BADGES</span>
            <p className="text-xs font-semibold text-foreground/80">
              On-chain achievements minted as mod NFTs
            </p>
          </div>
        </div>
        <span className="rounded-full border border-foreground/10 bg-background px-3 py-1 text-xs font-semibold text-foreground/60">
          {NETWORK_LABEL}
        </span>
      </div>

      {!badges.configured ? (
        <div className="rounded-3xl border border-dashed border-foreground/15 bg-surface p-10 text-center">
          <h3 className="text-lg font-bold">Badges not deployed yet</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-foreground/60">
            The SneakerMods contract address is not configured for this network. Once the v1.0
            contracts go live on Amoy, every achievement you earn becomes a claimable badge NFT.
          </p>
        </div>
      ) : badges.achievements.length > 0 ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {badges.achievements.map((ach) => {
            const slot = SLOTS[ach.slot];
            const rarity = RARITIES[ach.tier % RARITIES.length];
            const state = ach.claimed ? "CLAIMED" : ach.meets ? "READY" : ach.active ? "LOCKED" : "INACTIVE";
            return (
              <div
                key={ach.id.toString()}
                className={`flex flex-col justify-between rounded-3xl border p-5 ${
                  ach.claimed
                    ? "border-mint/30 bg-mint/5"
                    : ach.meets
                      ? "border-polygon-purple/40 bg-polygon-purple/5"
                      : "border-foreground/10 bg-surface"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${rarity?.accent ?? "bg-foreground/10"}`}>
                      {rarity?.label ?? "Mod"} · {slot?.label ?? "Slot"}
                    </span>
                    <span
                      className={`font-pixel text-[8px] ${
                        ach.claimed ? "text-mint" : ach.meets ? "text-polygon-purple" : "text-foreground/35"
                      }`}
                    >
                      {state}
                    </span>
                  </div>
                  <div className="my-4 flex items-center justify-center rounded-2xl bg-background/80 py-6 text-4xl">
                    {slot?.icon ?? "🏅"}
                  </div>
                  <h4 className="font-bold">Badge #{ach.id.toString()}</h4>
                  <p className="mt-1 text-xs leading-relaxed text-foreground/55">
                    {REQ_KIND_LABELS[ach.kind] ?? "Achievement"} ≥ {formatThreshold(ach.kind, ach.threshold)}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={badges.isLoading || ach.claimed || !ach.meets || !ach.active}
                  onClick={() =>
                    void runAction(
                      () => badges.claim(ach.id, 0n),
                      `Badge #${ach.id} claimed`,
                    )
                  }
                  className="mt-5 min-h-11 w-full cursor-pointer rounded-full bg-polygon-purple px-4 text-xs font-bold text-white shadow-md transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {ach.claimed ? "Claimed" : ach.meets ? "Claim badge" : "Requirement not met"}
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-foreground/15 bg-surface p-10 text-center">
          <p className="text-sm text-foreground/60">
            {badges.isLoading
              ? "Loading achievements…"
              : "No achievements published yet. Keep playing — streak, earn veRUNE, collect sneakers, and stake POL."}
          </p>
        </div>
      )}

      {actionNotice ? (
        <p className="rounded-2xl border border-mint/30 bg-mint/10 px-4 py-3 text-sm font-semibold text-mint">{actionNotice}</p>
      ) : null}
      {actionError || badges.error ? (
        <p className="rounded-2xl border border-magma/30 bg-magma/10 px-4 py-3 text-sm font-semibold text-magma">
          {actionError ?? badges.error}
        </p>
      ) : null}
    </div>
  );
}
