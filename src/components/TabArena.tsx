"use client";

import { useState } from "react";
import Link from "next/link";
import HoloSneakerCard from "@/components/HoloSneakerCard";
import { SkeletonArtworkCard, SkeletonRows } from "@/components/Skeleton";
import { useArenaGate } from "@/hooks/useArenaGate";
import { useRunnerRoster } from "@/hooks/useRunnerRoster";
import {
  awardedBoostBps,
  bpsToPercent,
  levelForPoints,
  MAX_TAB_LEVEL,
  nextLevelAfterPoints,
  pointsPerTap,
  STAKING_BUDGET,
  TAB_CHALLENGE,
  TAB_LEVELS,
  tapsFor,
} from "@/lib/tab-challenge";

/// Compact label/value row used across the HUD panels.
function StatRow({ label, value, tone = "text-foreground" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-foreground/6 py-2 last:border-b-0">
      <span className="font-mono text-[10px] tracking-[0.16em] text-foreground/45 uppercase">{label}</span>
      <span className={`font-mono text-sm font-bold ${tone}`}>{value}</span>
    </div>
  );
}

function Panel({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`relative overflow-hidden rounded-2xl border border-foreground/10 bg-surface ${className}`}>
      <span aria-hidden className="hud-grid pointer-events-none absolute inset-0 opacity-35" />
      <span aria-hidden className="hud-corner hud-corner-tl text-brand" />
      <span aria-hidden className="hud-corner hud-corner-tr text-brand" />
      <span aria-hidden className="hud-corner hud-corner-bl text-brand" />
      <span aria-hidden className="hud-corner hud-corner-br text-brand" />
      <p className="relative border-b border-foreground/8 px-4 py-2.5 font-pixel text-[9px] tracking-[0.24em] text-brand">
        {label}
      </p>
      <div className="relative p-4">{children}</div>
    </section>
  );
}

/// The playable arena. A game HUD rather than a page: runner loadout on the
/// left, the tap pad as the centrepiece, and the level ladder as a bottom rail.
export default function TabArena() {
  const roster = useRunnerRoster();
  const arenaGate = useArenaGate(roster.selectedId);
  const [points, setPoints] = useState(0);
  const [taps, setTaps] = useState(0);
  const [popKey, setPopKey] = useState(0);
  const [started, setStarted] = useState(false);

  const runner = roster.selected;
  const ceiling = runner?.power.ceilingBps ?? TAB_CHALLENGE.minBoostBps;
  const multiplier = pointsPerTap(runner?.power.score ?? 0);
  const currentLevel = levelForPoints(points);
  const next = nextLevelAfterPoints(points);
  const paidBoost = currentLevel ? awardedBoostBps(currentLevel.boostBps, ceiling) : 0;
  const capped = currentLevel ? currentLevel.boostBps > ceiling : false;
  const projectedApy = Math.min(STAKING_BUDGET.maxApyBps, STAKING_BUDGET.baseApyBps + paidBoost);
  const levelFloor = currentLevel?.points ?? 0;
  const levelProgress = next
    ? Math.round(((points - levelFloor) / Math.max(1, next.points - levelFloor)) * 100)
    : 100;

  function handleTap() {
    if (!started) setStarted(true);
    setPoints((value) => Math.min(MAX_TAB_LEVEL.points, value + multiplier));
    setTaps((value) => value + 1);
    setPopKey((value) => value + 1);
  }

  function resetSession() {
    setPoints(0);
    setTaps(0);
    setStarted(false);
  }

  // ─── Blocked states ───────────────────────────────────────────────
  if (!roster.connected) {
    return (
      <Panel label="TAB ARENA · OFFLINE">
        <div className="flex flex-col items-center gap-4 py-14 text-center">
          <p className="font-pixel text-xs tracking-[0.24em] text-foreground/60">INSERT WALLET</p>
          <p className="max-w-xs font-mono text-[11px] leading-relaxed text-foreground/45">
            Connect a wallet to load your runner and open today&apos;s session.
          </p>
        </div>
      </Panel>
    );
  }

  if (roster.isLoading) {
    // Same two-column shape as the loaded arena, so nothing shifts when the
    // roster arrives.
    return (
      <div
        className="grid gap-4 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]"
        aria-busy="true"
        aria-live="polite"
        aria-label="Loading your roster"
      >
        <Panel label="RUNNER">
          <SkeletonArtworkCard lines={3} />
        </Panel>
        <Panel label="TAP ARENA">
          <div className="flex flex-col items-center gap-6 py-2">
            <span className="skeleton block size-56 rounded-full sm:size-64" aria-hidden />
            <div className="w-full max-w-lg">
              <SkeletonRows count={2} />
            </div>
          </div>
        </Panel>
      </div>
    );
  }

  if (!arenaGate.open) {
    return (
      <Panel label="TAB ARENA · LOCKED">
        <div className="flex flex-col items-center gap-5 py-12 text-center">
          <p className="font-pixel text-xs tracking-[0.24em] text-magma">GATE CLOSED</p>
          <p className="max-w-sm font-mono text-[11px] leading-relaxed text-foreground/45">
            A session needs staked POL and a locked veSneaker — the boost only means something when
            there is yield to boost, and the pair has to be in the vault.
          </p>
          <ul className="flex flex-col gap-2 text-left">
            {[
              { label: "Deposit POL into the vault", done: arenaGate.gate.hasPol, href: "/staking" },
              { label: "Lock a veSneaker in the vault", done: arenaGate.gate.hasLockedRunner, href: "/staking" },
            ].map((step) => (
              <li
                key={step.label}
                className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 font-mono text-[11px] ${
                  step.done ? "border-mint/30 bg-mint/8 text-mint" : "border-foreground/12 text-foreground/55"
                }`}
              >
                <span aria-hidden className={step.done ? "text-mint" : "text-foreground/35"}>
                  {step.done ? "✓" : "○"}
                </span>
                {step.label}
              </li>
            ))}
          </ul>
          <Link
            href="/staking"
            className="min-h-11 rounded-full bg-brand px-6 text-sm font-bold leading-[2.75rem] text-paper transition-transform hover:scale-105 dark:text-ink"
          >
            Open staking
          </Link>
        </div>
      </Panel>
    );
  }

  if (!runner) {
    return (
      <Panel label="TAB ARENA · NO RUNNER">
        <div className="flex flex-col items-center gap-5 py-14 text-center">
          <p className="font-pixel text-xs tracking-[0.24em] text-magma">NO VE SNEAKER</p>
          <p className="max-w-sm font-mono text-[11px] leading-relaxed text-foreground/45">
            The arena needs a veSneaker. Its power score sets your boost ceiling.
          </p>
          <Link
            href="/collection"
            className="min-h-11 rounded-full bg-brand px-6 text-sm font-bold leading-[2.75rem] text-paper transition-transform hover:scale-105 dark:text-ink"
          >
            Get a veSneaker
          </Link>
        </div>
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ─── HUD status bar ─── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand/20 bg-surface px-4 py-3">
        <div className="flex items-center gap-3">
          <span aria-hidden className="relative flex size-2.5">
            <span className={`absolute inline-flex size-full rounded-full opacity-70 ${started ? "animate-ping bg-mint" : "bg-brand/50"}`} />
            <span className={`relative inline-flex size-2.5 rounded-full ${started ? "bg-mint" : "bg-brand"}`} />
          </span>
          <span className="font-pixel text-[9px] tracking-[0.24em] text-brand">
            {started ? "SESSION ACTIVE" : "SESSION READY"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md border border-foreground/10 px-2.5 py-1 font-mono text-[10px] text-foreground/55">
            WINDOW {TAB_CHALLENGE.sessionSeconds / 3600}H
          </span>
          <span className="rounded-md border border-mint/25 bg-mint/8 px-2.5 py-1 font-mono text-[10px] text-mint">
            MAX +{bpsToPercent(TAB_CHALLENGE.maxBoostBps)}
          </span>
          <span className="rounded-md border border-foreground/10 px-2.5 py-1 font-mono text-[10px] text-foreground/55">
            CAP {bpsToPercent(STAKING_BUDGET.maxApyBps)}
          </span>
          <Link
            href="/game"
            className="rounded-md border border-foreground/10 px-2.5 py-1 font-mono text-[10px] text-foreground/55 transition-colors hover:border-brand/40 hover:text-brand"
          >
            EXIT ×
          </Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]">
        {/* ─── Runner loadout ─── */}
        <div className="flex flex-col gap-4">
          <Panel label="RUNNER">
            <HoloSneakerCard
              family={runner.family}
              label={runner.label}
              tier={runner.tier}
              rarity={runner.rarity}
              conditionBps={runner.conditionBps}
              equippedMods={runner.equippedMods}
              tokenId={runner.tokenId}
            />
            <div className="mt-3">
              <StatRow label="Power" value={`${runner.power.score}/100`} tone="text-brand" />
              <StatRow label="Level" value={`LV ${runner.power.level}`} tone="text-sol" />
              <StatRow label="Points/tap" value={`×${multiplier}`} tone="text-astra" />
              <StatRow label="Ceiling" value={`+${bpsToPercent(ceiling)}`} tone="text-mint" />
              <StatRow label="Efficiency" value={`${runner.equippedMods}/${TAB_CHALLENGE.maxEquippedMods} mods`} />
            </div>
          </Panel>

          {roster.runners.length > 1 ? (
            <Panel label={`SWAP RUNNER · ${roster.runners.length}`}>
              <div className="scroll-x -mx-1 flex gap-2 px-1 pb-1">
                {roster.runners.map((option) => {
                  const active = option.tokenId === runner.tokenId;
                  return (
                    <button
                      key={option.tokenId.toString()}
                      type="button"
                      onClick={() => {
                        roster.setSelectedId(option.tokenId);
                        setTaps(0);
                        setStarted(false);
                      }}
                      aria-pressed={active}
                      className={`w-20 shrink-0 cursor-pointer rounded-xl border p-2 text-center transition-[transform,color,background-color,border-color,fill,stroke] active:scale-95 ${
                        active
                          ? "border-brand/45 bg-brand/10"
                          : "border-foreground/10 bg-background hover:border-foreground/25"
                      }`}
                    >
                      <span className="block font-mono text-[9px] text-foreground/45">
                        #{String(option.tokenId).padStart(3, "0")}
                      </span>
                      <span
                        className={`mt-1 block font-mono text-[11px] font-bold ${active ? "text-mint" : "text-foreground/55"}`}
                      >
                        +{bpsToPercent(option.power.ceilingBps)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Panel>
          ) : null}
        </div>

        {/* ─── Tap arena ─── */}
        <Panel label="TAP ARENA">
          <div className="flex flex-col items-center gap-6 py-2">
            <div className="relative flex size-56 items-center justify-center sm:size-64">
              <span aria-hidden className="absolute inset-4 rounded-full bg-brand/10 blur-2xl animate-glow" />
              <span
                aria-hidden
                className="absolute inset-0 rounded-full border border-dashed border-brand/20 animate-spin-slow"
              />
              <span aria-hidden className="absolute inset-6 rounded-full border border-brand/12" />
              <button
                type="button"
                onClick={handleTap}
                aria-label="Register a tap"
                className="relative flex size-44 cursor-pointer items-center justify-center rounded-full border-2 border-brand/45 bg-background transition-colors duration-300 hover:border-brand/80 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand sm:size-52"
              >
                <span
                  key={popKey}
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-full border-2 border-brand/60 animate-tap-pop"
                />
                {popKey > 0 ? (
                  <span
                    key={`ripple-${popKey}`}
                    aria-hidden
                    className="pointer-events-none absolute inset-0 rounded-full border border-mint/50 animate-tap-ripple"
                  />
                ) : null}
                <span className="relative flex flex-col items-center">
                  <span className="font-mono text-6xl font-bold tabular-nums leading-none text-foreground sm:text-7xl">
                    {points}
                  </span>
                  <span className="mt-2 font-pixel text-[9px] tracking-[0.3em] text-foreground/45">POINTS</span>
                  <span className="mt-1.5 rounded-full border border-astra/35 bg-astra/10 px-2.5 py-0.5 font-mono text-[10px] font-bold text-astra">
                    ×{multiplier} / TAP
                  </span>
                </span>
              </button>
            </div>

            {/* Progress */}
            <div className="w-full max-w-lg">
              <div className="flex items-baseline justify-between font-mono text-[10px] tracking-[0.16em] text-foreground/45 uppercase">
                <span>
                  {currentLevel ? `L${currentLevel.level} · ${currentLevel.label}` : "STANDBY"}
                </span>
                <span className="tabular-nums">
                  {next ? `${next.points - points} PTS TO L${next.level}` : "MAX"}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-foreground/8">
                <span
                  className="block h-full w-full origin-left rounded-full bg-linear-to-r from-mint via-brand to-astra transition-transform duration-300 ease-out"
                  style={{ transform: `scaleX(${points === 0 ? 0 : Math.max(0.03, levelProgress / 100)})` }}
                />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-mint/20 bg-mint/8 px-4 py-3 text-center">
                  <span className="block font-mono text-[9px] tracking-[0.18em] text-foreground/45 uppercase">
                    Boost
                  </span>
                  <span className="mt-1 block font-mono text-2xl font-bold tabular-nums text-mint">
                    +{bpsToPercent(paidBoost)}
                  </span>
                </div>
                <div className="rounded-xl border border-brand/20 bg-brand/8 px-4 py-3 text-center">
                  <span className="block font-mono text-[9px] tracking-[0.18em] text-foreground/45 uppercase">
                    APY
                  </span>
                  <span className="mt-1 block font-mono text-2xl font-bold tabular-nums text-brand">
                    {bpsToPercent(projectedApy)}
                  </span>
                </div>
              </div>

              {capped ? (
                <p className="mt-3 rounded-xl border border-magma/25 bg-magma/10 px-3 py-2 text-center font-mono text-[10px] text-magma">
                  CAPPED AT +{bpsToPercent(ceiling)} BY {runner.label.toUpperCase()}
                </p>
              ) : null}

              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="font-mono text-[10px] text-foreground/35">
                  {taps} TAPS · CONTRACT PENDING · DEMO INPUT
                </span>
                <button
                  type="button"
                  onClick={resetSession}
                  disabled={taps === 0}
                  className="cursor-pointer rounded-md border border-foreground/12 px-3 py-1.5 font-mono text-[10px] text-foreground/55 transition-colors hover:border-brand/40 hover:text-brand disabled:cursor-not-allowed disabled:opacity-40"
                >
                  RESET
                </button>
              </div>
            </div>
          </div>
        </Panel>
      </div>

      {/* ─── Level rail ─── */}
      <Panel label="LEVEL LADDER · POINT TARGETS">
        <ol className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {TAB_LEVELS.map((level) => {
            const cleared = points >= level.points;
            const reachable = level.boostBps <= ceiling;
            const isCurrent = next?.level === level.level;
            const tapsNeeded = tapsFor(level.points, multiplier);
            return (
              <li
                key={level.level}
                className={`rounded-xl border px-2 py-3 text-center transition-[background-color,border-color,opacity] duration-300 ${
                  cleared
                    ? "border-mint/40 bg-mint/10"
                    : isCurrent
                      ? "border-brand/45 bg-brand/10"
                      : reachable
                        ? "border-foreground/10 bg-background"
                        : "border-foreground/8 bg-background opacity-45"
                }`}
              >
                <span
                  className={`block font-mono text-[9px] tracking-[0.16em] ${
                    cleared ? "text-mint" : isCurrent ? "text-brand" : "text-foreground/45"
                  }`}
                >
                  L{level.level}
                </span>
                <span className="mt-1 block font-mono text-base font-bold tabular-nums text-foreground">
                  {level.points}
                </span>
                <span className="mt-0.5 block font-mono text-[9px] text-foreground/40">
                  ≈{tapsNeeded} taps
                </span>
                <span
                  className={`mt-1 block font-mono text-[10px] font-bold tabular-nums ${
                    cleared ? "text-mint" : "text-foreground/50"
                  }`}
                >
                  +{bpsToPercent(reachable ? level.boostBps : ceiling)}
                </span>
              </li>
            );
          })}
        </ol>
        <p className="mt-3 text-center font-mono text-[10px] text-foreground/35">
          GREYED TIERS PAY YOUR CEILING · SERVICE THE PAIR OR EQUIP MODS TO EARN MORE
          POINTS PER TAP
        </p>
      </Panel>
    </div>
  );
}
