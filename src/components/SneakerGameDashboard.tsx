"use client";

import { useEffect, useState } from "react";
import { formatEther } from "viem";
import { NETWORK_LABEL, explorerTransactionUrl, usePolygonWallet } from "@/components/Providers";
import { useSneakerGame } from "@/hooks/useSneakerGame";
import { useSubgraphActivity } from "@/hooks/useSubgraphActivity";
import { RARITIES } from "@/lib/sneaker-nft";
import SneakerArtwork from "@/components/SneakerArtwork";

function formatPoints(value: bigint, maxDigits = 2) {
  const num = Number(formatEther(value));
  return num.toLocaleString("en-US", { maximumFractionDigits: maxDigits, minimumFractionDigits: 0 });
}

function formatCountdown(seconds: bigint) {
  const total = Number(seconds);
  if (total <= 0) return "Ready";
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function activityTime(timestamp?: number) {
  if (!timestamp) return "Recent";
  const date = new Date(timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp);
  return Number.isNaN(date.getTime()) ? "Recent" : date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

export default function SneakerGameDashboard() {
  const wallet = usePolygonWallet();
  const game = useSneakerGame();
  const { activities, isLoading: loadingActivity, refresh: refreshActivity, addLocalActivity } = useSubgraphActivity(wallet.address);
  const [nowSeconds, setNowSeconds] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setNowSeconds(Math.floor(Date.now() / 1000));
    const frame = window.requestAnimationFrame(sync);
    const interval = setInterval(sync, 30_000);
    // Refresh immediately when the user returns to the tab so the activation
    // countdowns are never stale.
    const onVisibility = () => {
      if (document.visibilityState === "visible") sync();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.cancelAnimationFrame(frame);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const isConfigured = game.configured;
  const redemptionRate = game.params.redemptionRate > 0n ? game.params.redemptionRate : 100n * 10n ** 18n;
  const redeemableRen = game.veRune / redemptionRate;

  async function runAction(action: () => Promise<`0x${string}`>, label: string) {
    setActionError(null);
    setActionNotice(null);
    try {
      const hash = await action();
      addLocalActivity(label, hash);
      setActionNotice(`${label} confirmed on-chain.`);
      await game.refresh();
      await refreshActivity();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : `${label} failed.`);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Protocol status bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-foreground/10 bg-surface px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="relative flex size-3">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-mint opacity-75" />
            <span className="relative inline-flex size-3 rounded-full bg-mint" />
          </div>
          <div>
            <span className="font-pixel text-[9px] text-mint">SNEAKER GAME ACTIVE</span>
            <p className="text-xs font-semibold text-foreground/80">Activate every 24h · build streaks · earn veRUNE</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-mint/20 bg-mint/10 px-3 py-1 font-pixel text-[9px] text-mint">
            24H ACTIVATION
          </span>
          <span className="rounded-full border border-polygon-purple/20 bg-polygon-purple/10 px-3 py-1 font-pixel text-[9px] text-polygon-purple">
            +1% / STREAK DAY (MAX +50%)
          </span>
          <span className="rounded-full border border-foreground/10 bg-background px-3 py-1 text-xs font-semibold text-foreground/60">
            {NETWORK_LABEL}
          </span>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-3xl border border-foreground/10 bg-surface p-6 transition-all duration-300 hover:border-mint/30 hover:shadow-xl hover:shadow-mint/5">
          <span className="font-pixel text-[9px] text-foreground/50">VE RUNE BALANCE</span>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-4xl font-extrabold tracking-tight text-mint">{formatPoints(game.veRune)}</span>
            <span className="text-sm font-bold text-foreground/50">veRUNE</span>
          </div>
          <p className="mt-2 text-xs text-foreground/50">Virtual points · redeemable for REN</p>
        </div>

        <div className="rounded-3xl border border-foreground/10 bg-surface p-6 transition-all duration-300 hover:border-sky/30 hover:shadow-xl hover:shadow-sky/5">
          <span className="font-pixel text-[9px] text-foreground/50">REDEEMABLE REN</span>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-4xl font-extrabold tracking-tight text-sky">{formatPoints(redeemableRen)}</span>
            <span className="text-sm font-bold text-foreground/50">REN</span>
          </div>
          <p className="mt-2 text-xs text-foreground/50">
            {game.params.redemptionEnabled ? "Redemption enabled" : "Redemption not enabled yet"}
          </p>
        </div>

        <div className="rounded-3xl border border-foreground/10 bg-surface p-6 transition-all duration-300 hover:border-polygon-purple/30 hover:shadow-xl hover:shadow-polygon-purple/5">
          <span className="font-pixel text-[9px] text-foreground/50">ACTIVE SNEAKERS</span>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-4xl font-extrabold tracking-tight text-polygon-purple">{game.sneakers.length}</span>
            <span className="text-sm font-bold text-foreground/50">owned</span>
          </div>
          <p className="mt-2 text-xs text-foreground/50">
            {game.sneakers.filter((s) => s.health > 0).length} with health left
          </p>
        </div>

        <div className="rounded-3xl border border-foreground/10 bg-surface p-6 transition-all duration-300 hover:border-foreground/20 hover:shadow-xl hover:shadow-foreground/5">
          <span className="font-pixel text-[9px] text-foreground/50">LIFETIME REDEEMED</span>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-4xl font-extrabold tracking-tight text-foreground">{formatPoints(game.totalRedeemedPoints)}</span>
            <span className="text-sm font-bold text-foreground/50">veRUNE</span>
          </div>
          <p className="mt-2 text-xs text-foreground/50">Total points converted to REN</p>
        </div>
      </div>

      {/* Redemption panel */}
      <div className="rounded-2xl border border-foreground/10 bg-surface p-6 sm:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <span className="font-pixel text-[9px] text-mint">VE RUNE REDEMPTION</span>
            <h3 className="mt-2 text-xl font-bold tracking-tight">Exchange virtual points for real REN</h3>
            <p className="mt-1 text-sm text-foreground/60">
              Rate: 100 veRUNE = 1 REN. Redemption opens once the protocol funds the reward pool.
            </p>
          </div>
          <button
            type="button"
            disabled={!isConfigured || !game.params.redemptionEnabled || game.veRune < redemptionRate || game.isLoading}
            onClick={() => void runAction(() => game.redeem(game.veRune), "veRUNE redeemed for REN")}
            className="cursor-pointer rounded-full bg-mint px-6 py-4 text-sm font-bold text-ink shadow-lg shadow-mint/20 transition-all hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {game.isLoading
              ? "Processing..."
              : game.params.redemptionEnabled
                ? `Redeem all (${formatPoints(redeemableRen)} REN)`
                : "Redemption disabled"}
          </button>
        </div>
      </div>

      {/* Sneaker cards */}
      <div className="rounded-2xl border border-foreground/10 bg-surface p-6 sm:p-8 lg:p-10">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="font-pixel text-[9px] text-mint">YOUR SNEAKER COLLECTION</span>
            <h3 className="mt-2 text-2xl font-bold tracking-tight">Activate, maintain, and earn</h3>
            <p className="mt-1 text-sm text-foreground/60">
              Each sneaker&rsquo;s health decays daily and wears with use. Activate every 24h to refill energy and keep earning, and repair with veRUNE or a kit when health runs out.
            </p>
          </div>
        </div>

        <div className="mt-8">
          {game.sneakers.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {game.sneakers.map((sneaker) => {
                const rarityObj = RARITIES[Number(sneaker.tier) % RARITIES.length];
                const durability = sneaker.health;
                const maxDurability = Number(game.params.maxDurability || 10n);
                const durabilityPct = Math.min(100, (durability / maxDurability) * 100);
                const wornOut = sneaker.health === 0 && sneaker.state.lastActivationAt > 0n;
                const readyIn = nowSeconds > 0 ? sneaker.state.lastActivationAt + 86_400n - BigInt(nowSeconds) : sneaker.secondsUntilActivation;
                const canActivateNow = !wornOut && readyIn <= 0n;
                const streakMult = sneaker.state.streak > 1n
                  ? 10_000n + (sneaker.state.streak - 1n) * 100n > 15_000n
                    ? 15_000n
                    : 10_000n + (sneaker.state.streak - 1n) * 100n
                  : 10_000n;
                const boostedDaily = (sneaker.power * streakMult) / 10_000n;

                return (
                  <div
                    key={sneaker.tokenId.toString()}
                    className={`flex flex-col justify-between overflow-hidden rounded-3xl border p-5 transition-all duration-300 ${
                      wornOut
                        ? "border-magma/30 bg-magma/5"
                        : canActivateNow
                          ? "border-mint/30 bg-mint/5 shadow-md shadow-mint/5"
                          : "border-foreground/10 bg-background"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${rarityObj?.accent ?? "bg-foreground/10"}`}>
                          {rarityObj?.label ?? "Sneaker"} · Tier {sneaker.tier.toString()}
                        </span>
                        <span className={`font-pixel text-[9px] ${wornOut ? "text-magma" : canActivateNow ? "text-mint" : "text-foreground/40"}`}>
                          {wornOut ? "✕ WORN OUT" : canActivateNow ? "● READY" : "○ COOLDOWN"}
                        </span>
                      </div>

                      <div className="my-4 flex items-center justify-center rounded-2xl bg-surface/80 py-6">
                        <SneakerArtwork src={sneaker.artwork.src} alt={sneaker.artwork.alt} className="w-28" sizes="112px" />
                      </div>

                      <h4 className="font-bold">{sneaker.artwork.name ?? "RUN&EARN Sneaker"} · #{sneaker.tokenId.toString()}</h4>

                      {/* Stats */}
                      <div className="mt-3 flex flex-col gap-1.5 text-xs text-foreground/60">
                        <div className="flex items-center justify-between">
                          <span>Streak:</span>
                          <span className="font-mono font-bold text-mint">
                            {sneaker.state.streak.toString()} day{sneaker.state.streak === 1n ? "" : "s"} (×{(Number(streakMult) / 10_000).toFixed(2)})
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Earn rate:</span>
                          <span className="font-mono font-bold text-sky">{formatPoints(boostedDaily)} veRUNE/day</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Power:</span>
                          <span className="font-mono font-bold text-sky">{formatPoints(sneaker.power)}/day</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Energy:</span>
                          <span className="font-mono font-bold text-magma">{sneaker.energy}/{sneaker.maxEnergy}⚡</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Pending:</span>
                          <span className="font-mono font-bold text-polygon-purple">{formatPoints(sneaker.pending)} veRUNE</span>
                        </div>
                      </div>

                      {/* Health bar */}
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-xs text-foreground/60">
                          <span>Health:</span>
                          <span className={`font-mono font-bold ${wornOut ? "text-magma" : "text-foreground"}`}>
                            {durability}/{maxDurability}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${wornOut ? "bg-magma" : durabilityPct <= 30 ? "bg-magma" : "bg-mint"}`}
                            style={{ width: `${durabilityPct}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="mt-5 grid grid-cols-2 gap-2 border-t border-foreground/10 pt-3">
                      <button
                        type="button"
                        disabled={!isConfigured || game.isLoading || wornOut || !canActivateNow}
                        onClick={() => void runAction(() => game.activate(sneaker.tokenId), `Sneaker #${sneaker.tokenId} activated`)}
                        className="min-h-11 cursor-pointer rounded-full bg-mint px-2 text-xs font-bold text-ink shadow-md shadow-mint/10 transition-transform active:scale-[0.98] hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span className="block truncate tabular-nums">
                          {wornOut ? "Worn out" : canActivateNow ? "Activate (24h)" : formatCountdown(readyIn)}
                        </span>
                      </button>
                      <button
                        type="button"
                        disabled={!isConfigured || game.isLoading || sneaker.pending === 0n}
                        onClick={() => void runAction(() => game.claimPoints(sneaker.tokenId), `Points claimed from #${sneaker.tokenId}`)}
                        className="min-h-11 cursor-pointer rounded-full border border-sky/30 bg-sky/10 px-2 text-xs font-bold text-sky transition-colors active:scale-[0.98] hover:bg-sky/20 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Claim points
                      </button>
                      {durability < maxDurability && sneaker.state.lastActivationAt > 0n ? (
                        <button
                          type="button"
                          disabled={!isConfigured || game.isLoading || game.veRune < game.params.repairCostPoints}
                          onClick={() => void runAction(() => game.repair(sneaker.tokenId), `Sneaker #${sneaker.tokenId} repaired`)}
                          className="col-span-2 min-h-11 cursor-pointer rounded-full border border-magma/30 bg-magma/10 px-2 text-xs font-bold text-magma transition-colors active:scale-[0.98] hover:bg-magma/20 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Repair ({formatPoints(game.params.repairCostPoints)} veRUNE)
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-foreground/15 bg-background p-10 text-center">
              <div className="flex size-14 items-center justify-center rounded-full bg-mint/10 font-pixel text-mint">
                👟
              </div>
              <h4 className="text-lg font-bold">No sneakers in the game yet</h4>
              <p className="max-w-md text-xs leading-relaxed text-foreground/60">
                Mint a SneakerMint NFT to start the daily activation loop: activate every 24h, build streaks, and earn veRUNE points.
              </p>
            </div>
          )}
        </div>

        {actionNotice ? <p className="mt-6 rounded-2xl bg-mint/15 px-4 py-3 text-xs font-semibold text-mint">{actionNotice}</p> : null}
        {actionError ? <p className="mt-6 rounded-2xl bg-magma/15 px-4 py-3 text-xs font-semibold text-magma">{actionError}</p> : null}
      </div>

      {/* Activity feed */}
      <div className="rounded-2xl border border-foreground/10 bg-surface p-6 sm:p-8">
        <div className="flex items-center justify-between border-b border-foreground/10 pb-4">
          <div>
            <span className="font-pixel text-[9px] text-mint">LIVE SUBGRAPH FEED</span>
            <h3 className="text-xl font-bold">Recent Game Activity</h3>
          </div>
          <button
            type="button"
            onClick={() => void refreshActivity()}
            className="cursor-pointer rounded-full border border-foreground/15 px-4 py-2 text-xs font-semibold transition-colors hover:border-foreground/30"
          >
            Refresh Feed
          </button>
        </div>
        <div className="mt-4 flex flex-col divide-y divide-foreground/10">
          {loadingActivity ? (
            <p className="py-6 text-center text-sm text-foreground/50">Indexing latest events from The Graph...</p>
          ) : activities.length > 0 ? (
            activities.map((act) => (
              <div key={`${act.id}-${act.timestamp ?? "now"}`} className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-8 items-center justify-center rounded-full bg-foreground/5 font-pixel text-xs text-mint">
                    ✦
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">{act.label.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase())}</p>
                    <p className="text-xs text-foreground/50">{activityTime(act.timestamp)}{act.tokenId ? ` · Sneaker NFT #${act.tokenId}` : ""}</p>
                  </div>
                </div>
                {act.transactionHash ? (
                  <a
                    href={explorerTransactionUrl(act.transactionHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs font-semibold text-sky hover:underline"
                  >
                    View on PolygonScan ↗
                  </a>
                ) : null}
              </div>
            ))
          ) : (
            <p className="py-8 text-center text-xs text-foreground/50">
              No recent activity recorded yet. Activate a sneaker to see live updates.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
