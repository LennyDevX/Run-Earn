"use client";

import { useState } from "react";
import Link from "next/link";
import { formatEther } from "viem";
import { NETWORK_LABEL, usePolygonWallet } from "@/components/Providers";
import { useBadges, type BadgeAchievement } from "@/hooks/useBadges";
import { usePlayerProgress } from "@/hooks/usePlayerProgress";
import { useSubgraphActivity } from "@/hooks/useSubgraphActivity";
import { modEffectLabel, REQ_KIND_LABELS, SLOTS } from "@/lib/mods";
import { RARITIES } from "@/lib/sneaker-nft";

const KIND_PLAYER_LEVEL = 4;

function formatThreshold(kind: number, threshold: bigint) {
  if (kind === 1) return `${Number(formatEther(threshold)).toLocaleString()} veRUNE`;
  if (kind === 3) return `${Number(formatEther(threshold)).toLocaleString()} POL`;
  return threshold.toString();
}

function skillLabel(ach: BadgeAchievement) {
  return modEffectLabel({
    slot: ach.slot,
    rarity: 0,
    tier: ach.tier,
    effectBps: ach.effectBps,
    aux: ach.aux,
    consumable: ach.consumable,
    proofHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
  });
}

export default function BadgesDashboard() {
  const wallet = usePolygonWallet();
  const badges = useBadges();
  const progress = usePlayerProgress({ owner: wallet.address ?? null, publicClient: wallet.publicClient });
  const { addLocalActivity } = useSubgraphActivity(wallet.address);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const playerLevel = progress.snapshot?.level ?? 0;
  const skillBadges = badges.achievements.filter((a) => a.kind === KIND_PLAYER_LEVEL);
  const achievements = badges.achievements.filter((a) => a.kind !== KIND_PLAYER_LEVEL);

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
        <div className="flex flex-wrap items-center gap-2">
          {progress.configured && playerLevel > 0 ? (
            <span className="rounded-full border border-mint/20 bg-mint/10 px-3 py-1 font-pixel text-[9px] text-mint">
              LEVEL {playerLevel}
            </span>
          ) : null}
          <span className="rounded-full border border-foreground/10 bg-background px-3 py-1 text-xs font-semibold text-foreground/60">
            {NETWORK_LABEL}
          </span>
        </div>
      </div>

      {!badges.configured ? (
        <div className="rounded-3xl border border-dashed border-foreground/15 bg-surface p-10 text-center">
          <h3 className="text-lg font-bold">Badges not deployed yet</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-foreground/60">
            The SneakerMods contract address is not configured for this network. Once the v1.0
            contracts go live on Amoy, every achievement you earn becomes a claimable badge NFT.
          </p>
        </div>
      ) : (
        <>
          {skillBadges.length > 0 ? (
            <section className="flex flex-col gap-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="font-pixel text-[9px] text-mint">LEVEL SKILLS</span>
                  <h3 className="mt-1 text-xl font-bold tracking-tight">Skills unlocked by your level</h3>
                  <p className="mt-1 max-w-xl text-xs leading-relaxed text-foreground/55">
                    Each skill NFT is free to claim once you reach its level — extra copies are sold
                    cheap in the store. Equip passive skills in the workshop Skill slot, or burn
                    consumable skills as abilities.
                  </p>
                </div>
                <Link
                  href="/collection"
                  className="min-h-9 cursor-pointer rounded-full border border-mint/25 bg-mint/10 px-4 py-2 text-xs font-bold text-mint transition-colors hover:bg-mint/20"
                >
                  Buy extra copies →
                </Link>
              </div>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {skillBadges.map((ach) => {
                  const requiredLevel = Number(ach.threshold);
                  const unlocked = ach.claimed || (progress.configured ? playerLevel >= requiredLevel : ach.meets);
                  const slot = SLOTS[ach.slot];
                  return (
                    <div
                      key={ach.id.toString()}
                      className={`flex flex-col justify-between rounded-3xl border p-5 ${
                        ach.claimed
                          ? "border-mint/30 bg-mint/5"
                          : unlocked
                            ? "border-mint/40 bg-mint/5"
                            : "border-foreground/10 bg-surface opacity-80"
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="rounded-full bg-mint/15 px-2.5 py-1 font-pixel text-[9px] text-mint">
                            LV {requiredLevel} SKILL
                          </span>
                          <span
                            className={`font-pixel text-[8px] ${
                              ach.claimed ? "text-mint" : unlocked ? "text-mint" : "text-foreground/35"
                            }`}
                          >
                            {ach.claimed ? "CLAIMED" : unlocked ? "READY" : "LOCKED"}
                          </span>
                        </div>
                        <div className="my-4 flex items-center justify-center rounded-2xl bg-background/80 py-6 text-4xl">
                          {ach.consumable ? "⚡" : (slot?.icon ?? "⭐")}
                        </div>
                        <h4 className="font-bold">Skill #{ach.id.toString()}</h4>
                        <p className="mt-1 text-xs leading-relaxed text-foreground/55">{skillLabel(ach)}</p>
                      </div>
                      <button
                        type="button"
                        disabled={badges.isLoading || ach.claimed || !unlocked || !ach.active}
                        onClick={() =>
                          void runAction(
                            () => badges.claim(ach.id, 0n),
                            `Skill #${ach.id} claimed`,
                          )
                        }
                        className="mt-5 min-h-11 w-full cursor-pointer rounded-full bg-mint px-4 text-xs font-bold text-ink shadow-md shadow-mint/10 transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {ach.claimed
                          ? "Claimed"
                          : unlocked
                            ? "Claim free skill"
                            : `Unlocks at level ${requiredLevel}`}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {achievements.length > 0 ? (
            <section className="flex flex-col gap-5">
              {skillBadges.length > 0 ? (
                <div>
                  <span className="font-pixel text-[9px] text-polygon-purple">ACHIEVEMENTS</span>
                  <h3 className="mt-1 text-xl font-bold tracking-tight">Earned through play</h3>
                </div>
              ) : null}
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {achievements.map((ach) => {
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
            </section>
          ) : null}

          {badges.achievements.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-foreground/15 bg-surface p-10 text-center">
              <p className="text-sm text-foreground/60">
                {badges.isLoading
                  ? "Loading achievements…"
                  : "No achievements published yet. Keep playing — streak, earn veRUNE, collect sneakers, and stake POL."}
              </p>
            </div>
          ) : null}
        </>
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
