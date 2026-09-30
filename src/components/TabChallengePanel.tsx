"use client";

import { useState } from "react";
import Link from "next/link";
import HoloSneakerCard from "@/components/HoloSneakerCard";
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

export default function TabChallengePanel() {
  const roster = useRunnerRoster();
  const [points, setPoints] = useState(0);
  const [popKey, setPopKey] = useState(0);
  const [sessionStarted, setSessionStarted] = useState(false);

  const active = roster.selected;
  const ceiling = active?.power.ceilingBps ?? TAB_CHALLENGE.minBoostBps;
  const multiplier = pointsPerTap(active?.power.score ?? 0);
  const currentLevel = levelForPoints(points);
  const next = nextLevelAfterPoints(points);
  const paidBoost = currentLevel ? awardedBoostBps(currentLevel.boostBps, ceiling) : 0;
  const capped = currentLevel ? currentLevel.boostBps > ceiling : false;
  const projectedApy = Math.min(STAKING_BUDGET.maxApyBps, STAKING_BUDGET.baseApyBps + paidBoost);

  function handleTap() {
    if (!sessionStarted) setSessionStarted(true);
    setPoints((current) => Math.min(MAX_TAB_LEVEL.points, current + multiplier));
    setPopKey((current) => current + 1);
  }

  function resetSession() {
    setPoints(0);
    setSessionStarted(false);
  }

  if (!roster.connected) {
    return (
      <section className="rounded-3xl border border-dashed border-foreground/15 bg-surface px-8 py-14 text-center">
        <span className="font-pixel text-[10px] tracking-[0.2em] text-brand">TAB CHALLENGE</span>
        <p className="mt-3 text-sm text-foreground/60">
          Connect your wallet to start today&apos;s session.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="tab-panel-title" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="font-pixel text-[9px] tracking-[0.2em] text-foreground/45">
            DAILY SESSION
          </span>
          <h2 id="tab-panel-title" className="text-gradient mt-2 text-xl font-bold tracking-tight">
            Tab challenge
          </h2>
        </div>
        <p className="font-mono text-[11px] text-foreground/45">
          window {TAB_CHALLENGE.sessionSeconds / 3600}h · boost {TAB_CHALLENGE.boostSeconds / 3600}h ·
          cap {bpsToPercent(STAKING_BUDGET.maxApyBps)}
        </p>
      </div>

      {roster.runners.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-foreground/15 bg-surface px-8 py-12 text-center">
          <p className="text-sm text-foreground/60">
            You need a veSneaker to run the challenge — its power sets your boost ceiling.
          </p>
          <Link
            href="/collection"
            className="mt-4 inline-flex min-h-11 items-center rounded-full bg-brand px-6 text-sm font-bold text-paper transition-transform hover:scale-105 dark:text-ink"
          >
            Explore collection
          </Link>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          {/* Tap pad */}
          <div className="group relative overflow-hidden rounded-3xl border border-brand/20 bg-surface p-6 sm:p-7">
            <span aria-hidden className="hud-grid pointer-events-none absolute inset-0 opacity-50" />
            <span
              aria-hidden
              className="pointer-events-none absolute -top-24 -left-16 size-56 rounded-full bg-brand/12 blur-3xl animate-drift"
            />
            <span aria-hidden className="hud-corner hud-corner-tl text-brand" />
            <span aria-hidden className="hud-corner hud-corner-tr text-brand" />
            <span aria-hidden className="hud-corner hud-corner-bl text-brand" />
            <span aria-hidden className="hud-corner hud-corner-br text-brand" />

            <div className="relative flex flex-col items-center gap-5">
              <span className="font-pixel text-[9px] tracking-[0.24em] text-foreground/45">
                {sessionStarted ? "SESSION ACTIVE · 24H WINDOW" : "READY TO START"}
              </span>

              <div className="relative flex size-44 items-center justify-center">
                <span aria-hidden className="absolute -inset-2 rounded-full border border-dashed border-brand/25 animate-orbit" />
                <span aria-hidden className="absolute inset-0 rounded-full bg-brand/10 blur-xl animate-glow" />
                <button
                  type="button"
                  onClick={handleTap}
                  aria-label="Register a tap"
                  className="relative flex size-40 cursor-pointer items-center justify-center rounded-full border-2 border-brand/40 bg-background transition-colors duration-300 hover:border-brand/70 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
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
                    <span className="font-mono text-4xl font-bold tabular-nums">{points}</span>
                    <span className="mt-1 font-pixel text-[8px] tracking-[0.24em] text-foreground/45">
                      POINTS
                    </span>
                    <span className="mt-1 rounded-full border border-astra/35 bg-astra/10 px-2 py-0.5 font-mono text-[9px] font-bold text-astra">
                      ×{multiplier} / TAP
                    </span>
                  </span>
                </button>
              </div>

              <div className="w-full">
                <div className="h-2 overflow-hidden rounded-full bg-foreground/8">
                  <span
                    className="block h-full rounded-full bg-linear-to-r from-mint via-brand to-astra transition-[width] duration-300 ease-out"
                    style={{ width: `${Math.round((points / MAX_TAB_LEVEL.points) * 100)}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-foreground/45">
                  <span>
                    {currentLevel ? `L${currentLevel.level} · ${currentLevel.label}` : "LEVEL 0"}
                  </span>
                  <span>
                    {points}/{MAX_TAB_LEVEL.points}
                  </span>
                </div>
              </div>

              <div className="grid w-full grid-cols-2 gap-3">
                <div className="rounded-2xl border border-foreground/8 bg-background px-4 py-3">
                  <span className="block font-mono text-[10px] text-foreground/45">PAID BOOST</span>
                  <span className="mt-1 block font-mono text-lg font-bold text-mint">
                    +{bpsToPercent(paidBoost)}
                  </span>
                </div>
                <div className="rounded-2xl border border-foreground/8 bg-background px-4 py-3">
                  <span className="block font-mono text-[10px] text-foreground/45">PROJECTED APY</span>
                  <span className="mt-1 block font-mono text-lg font-bold text-brand">
                    {bpsToPercent(projectedApy)}
                  </span>
                </div>
              </div>

              {capped ? (
                <p className="w-full rounded-xl bg-magma/10 px-3 py-2 text-[11px] leading-relaxed text-magma">
                  Capped by your sneaker: {active?.label} tops out at +{bpsToPercent(ceiling)}. Service
                  it or equip more mods to raise the ceiling.
                </p>
              ) : null}

              <div className="flex w-full flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={!currentLevel || paidBoost === 0}
                  onClick={resetSession}
                  className="min-h-10 flex-1 cursor-pointer rounded-full border border-foreground/12 px-4 font-mono text-[11px] text-foreground/60 transition-colors hover:border-brand/40 hover:text-brand disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Reset demo session
                </button>
                <span className="font-mono text-[10px] text-foreground/40">
                  contract pending
                </span>
              </div>
            </div>
          </div>

          {/* Sneaker picker + ladder */}
          <div className="flex flex-col gap-5">
            <div className="rounded-3xl border border-foreground/8 bg-surface p-6 sm:p-7">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-lg font-bold tracking-tight">Choose your runner</h3>
                <span className="font-mono text-[11px] text-foreground/45">
                  {roster.runners.length} available
                </span>
              </div>
              <div className="scroll-x -mx-1 mt-4 flex gap-3 px-1 pb-1">
                {roster.runners.map((row) => {
                  const isActive = row.tokenId === roster.selectedId;
                  return (
                    <button
                      key={row.tokenId.toString()}
                      type="button"
                      onClick={() => {
                        roster.setSelectedId(row.tokenId);
                        setPoints(0);
                        setSessionStarted(false);
                      }}
                      aria-pressed={isActive}
                      className={`w-44 shrink-0 cursor-pointer rounded-2xl border p-3 text-left transition-all duration-300 active:scale-95 ${
                        isActive
                          ? "border-brand/40 bg-brand/8"
                          : "border-foreground/8 bg-background hover:border-foreground/20"
                      }`}
                    >
                      <span className="flex items-center justify-between">
                        <span className="font-mono text-[10px] text-foreground/45">
                          #{String(row.tokenId).padStart(4, "0")}
                        </span>
                        <span
                          className={`font-mono text-xs font-bold ${isActive ? "text-mint" : "text-foreground/55"}`}
                        >
                          +{bpsToPercent(row.power.ceilingBps)}
                        </span>
                      </span>
                      <span className="mt-2 block truncate text-xs font-semibold">{row.label}</span>
                      <span className="mt-1 block font-mono text-[10px] text-foreground/45">
                        power {row.power.score}/100 · LV {row.power.level}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {active ? (
              <div className="grid gap-5 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                <HoloSneakerCard
                  family={active.family}
                  label={active.label}
                  tier={active.tier}
                  rarity={active.rarity}
                  conditionBps={active.conditionBps}
                  equippedMods={active.equippedMods}
                  tokenId={active.tokenId}
                  caption={`Ceiling +${bpsToPercent(active.power.ceilingBps)}`}
                />

                <div className="rounded-3xl border border-foreground/8 bg-surface p-5 sm:p-6">
                  <h3 className="text-sm font-bold tracking-tight">Reachable levels</h3>
                  <ol className="mt-4 flex flex-col gap-1.5">
                    {TAB_LEVELS.map((level) => {
                      const reachable = level.boostBps <= active.power.ceilingBps;
                      const cleared = points >= level.points;
                      const isNext = next?.level === level.level;
                      return (
                        <li
                          key={level.level}
                          className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-xs ${
                            cleared
                              ? "border-mint/30 bg-mint/8"
                              : isNext
                                ? "border-brand/30 bg-brand/8"
                                : reachable
                                  ? "border-foreground/8 bg-background"
                                  : "border-foreground/8 bg-background opacity-45"
                          }`}
                        >
                          <span className="font-mono text-[10px] font-bold text-foreground/55">
                            L{level.level}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-foreground/60">
                            {level.points} pts · ≈{tapsFor(level.points, multiplier)} taps
                          </span>
                          <span
                            className={`shrink-0 font-mono font-bold ${cleared ? "text-mint" : "text-foreground/55"}`}
                          >
                            +{bpsToPercent(reachable ? level.boostBps : active.power.ceilingBps)}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                  <p className="mt-4 text-[11px] leading-relaxed text-foreground/45">
                    Greyed rows pay your ceiling instead of the full level reward. Raise power with
                    its condition or equip more mods.
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
