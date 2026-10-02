"use client";

import { useState } from "react";
import HoloSneakerCard from "@/components/HoloSneakerCard";
import {
  bpsToPercent,
  conditionPercent,
  levelForPoints,
  MAX_TAB_LEVEL,
  nextLevelAfterPoints,
  pointsPerTap,
  POWER_EXAMPLES,
  sneakerPower,
  STAKING_BUDGET,
  TAB_CHALLENGE,
  TAB_LEVELS,
  TAP_TIERS,
  tapsFor,
} from "@/lib/tab-challenge";


/// Demo power scores, one per multiplier band, so the section can show how the
/// same ladder clears in fewer taps as the runner gets stronger.
const DEMO_RUNNERS = [
  { tier: 0, score: 18 },
  { tier: 1, score: 40 },
  { tier: 2, score: 62 },
  { tier: 3, score: 88 },
] as const;

export default function TabChallengeSection() {
  const [points, setPoints] = useState(0);
  const [taps, setTaps] = useState(0);
  const [popKey, setPopKey] = useState(0);
  const [demoTier, setDemoTier] = useState(1);

  const demoScore = DEMO_RUNNERS[demoTier].score;
  const multiplier = pointsPerTap(demoScore);
  const reached = levelForPoints(points);
  const next = nextLevelAfterPoints(points);
  const progressFloor = reached?.points ?? 0;
  const progressCeil = next?.points ?? MAX_TAB_LEVEL.points;
  const progress = Math.min(
    100,
    Math.round(((points - progressFloor) / Math.max(1, progressCeil - progressFloor)) * 100),
  );
  const demoCeiling = TAB_CHALLENGE.maxBoostBps;

  function handleTap() {
    setPoints((current) => Math.min(MAX_TAB_LEVEL.points, current + multiplier));
    setTaps((current) => current + 1);
    setPopKey((current) => current + 1);
  }

  return (
    <section aria-labelledby="tab-challenge-title" className="mx-auto w-full max-w-6xl px-6 py-16 md:py-24">
      <div className="mb-10 flex flex-col gap-4 md:mb-14">
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-brand/25 bg-brand/8 px-3 py-1.5 font-pixel text-[10px] tracking-[0.2em] text-brand">
          <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-brand" />
          DAILY TAB CHALLENGE
        </span>
        <h2
          id="tab-challenge-title"
          className="text-gradient max-w-2xl text-3xl font-bold tracking-tight text-balance sm:text-4xl"
        >
          Tap your way to a staking boost
        </h2>
        <p className="max-w-2xl leading-relaxed text-foreground/60">
          Once a day, start a tap session with a staked veSneaker. You get up to{" "}
          {TAB_CHALLENGE.sessionSeconds / 3600}h to hit the tap target — every level asks for more
          taps than the last. Clear it and your staking APY gets a temporary boost of{" "}
          {bpsToPercent(TAB_CHALLENGE.minBoostBps)} to {bpsToPercent(TAB_CHALLENGE.maxBoostBps)} for
          the next {TAB_CHALLENGE.boostSeconds / 3600}h. How high you can go depends on the sneaker
          you bring.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        {/* Interactive tap pad */}
        <div className="group relative overflow-hidden rounded-3xl border border-brand/20 bg-surface p-6 sm:p-8">
          <span
            aria-hidden
            className="pointer-events-none absolute -top-24 -left-16 size-56 rounded-full bg-brand/12 blur-3xl animate-drift"
          />
          <span aria-hidden className="hud-grid pointer-events-none absolute inset-0 opacity-60" />
          <span aria-hidden className="hud-corner hud-corner-tl text-brand" />
          <span aria-hidden className="hud-corner hud-corner-tr text-brand" />
          <span aria-hidden className="hud-corner hud-corner-bl text-brand" />
          <span aria-hidden className="hud-corner hud-corner-br text-brand" />

          <div className="relative flex flex-col items-center gap-6">
            <span className="font-pixel text-[9px] tracking-[0.24em] text-foreground/45">
              SESSION · LIVE DEMO
            </span>

            {/* Runner class picker — drives the points-per-tap multiplier. */}
            <div className="scroll-x -mx-6 flex w-full gap-2 px-6 pb-1" role="group" aria-label="Demo runner class">
              {TAP_TIERS.map((tier, index) => {
                const active = demoTier === index;
                return (
                  <button
                    key={tier.label}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setDemoTier(index);
                      setPoints(0);
                      setTaps(0);
                    }}
                    className={`flex min-h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3 font-mono text-[10px] font-bold transition-[transform,color,background-color,border-color,fill,stroke] active:scale-95 ${
                      active
                        ? "border-astra/45 bg-astra/12 text-astra"
                        : "border-foreground/10 text-foreground/50 hover:border-foreground/25"
                    }`}
                  >
                    {tier.label}
                    <span className={active ? "text-astra" : "text-foreground/40"}>×{tier.multiplier}</span>
                  </button>
                );
              })}
            </div>

            <div className="relative flex size-44 items-center justify-center">
              <span
                aria-hidden
                className="absolute -inset-2 rounded-full border border-dashed border-brand/25 animate-orbit"
              />
              <span
                aria-hidden
                className="absolute inset-0 rounded-full bg-brand/10 blur-xl animate-glow"
              />
              <button
                type="button"
                onClick={handleTap}
                aria-label="Demo tap pad — press to register a tap"
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
                  <span className="font-mono text-4xl font-bold tabular-nums text-foreground">
                    {points}
                  </span>
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
              <div className="flex items-center justify-between font-mono text-[10px] text-foreground/45">
                <span>
                  {reached ? `LEVEL ${reached.level} · ${reached.label}` : "TAP TO START"}
                </span>
                <span>
                  {next ? `${next.points - points} pts to L${next.level}` : "MAX LEVEL"}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-foreground/8">
                <span
                  className="block h-full w-full origin-left rounded-full bg-linear-to-r from-mint via-brand to-astra transition-transform duration-300 ease-out"
                  style={{ transform: `scaleX(${points === 0 ? 0 : Math.max(0.04, progress / 100)})` }}
                />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="flex items-center justify-between rounded-xl border border-foreground/8 bg-background px-3 py-3">
                  <span className="text-[11px] text-foreground/50">Boost</span>
                  <span className="font-mono text-sm font-bold text-mint">
                    +{bpsToPercent(reached ? Math.min(reached.boostBps, demoCeiling) : 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-foreground/8 bg-background px-3 py-3">
                  <span className="text-[11px] text-foreground/50">Taps</span>
                  <span className="font-mono text-sm font-bold text-brand">{taps}</span>
                </div>
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-foreground/45">
                A stronger runner earns more points per tap, so the same ladder clears in fewer
                taps — the boost ceiling itself never changes. Demo only; nothing touches the chain.
              </p>
            </div>
          </div>
        </div>

        {/* Level ladder */}
        <div className="relative overflow-hidden rounded-3xl border border-foreground/8 bg-surface p-6 sm:p-8">
          <span aria-hidden className="hud-grid pointer-events-none absolute inset-0 opacity-40" />
          <div className="relative flex flex-col gap-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-lg font-bold tracking-tight">Level ladder</h3>
              <span className="font-mono text-[11px] text-foreground/45">
                {TAB_LEVELS.length} levels · resets every {TAB_CHALLENGE.sessionSeconds / 3600}h
              </span>
            </div>

            <ol className="flex flex-col gap-2">
              {TAB_LEVELS.map((level) => {
                const cleared = points >= level.points;
                const isNext = next?.level === level.level;
                return (
                  <li
                    key={level.level}
                    className={`flex items-center gap-3 rounded-2xl border px-4 py-3 transition-[background-color,border-color] duration-300 ${
                      cleared
                        ? "border-mint/30 bg-mint/8"
                        : isNext
                          ? "border-brand/30 bg-brand/8"
                          : "border-foreground/8 bg-background"
                    }`}
                  >
                    <span
                      className={`flex size-9 shrink-0 items-center justify-center rounded-xl border font-mono text-xs font-bold ${
                        cleared
                          ? "border-mint/30 text-mint"
                          : isNext
                            ? "border-brand/30 text-brand"
                            : "border-foreground/12 text-foreground/45"
                      }`}
                    >
                      L{level.level}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold">{level.label}</span>
                      <span className="mt-0.5 block font-mono text-[10px] text-foreground/45">
                        {level.points} pts · ≈{tapsFor(level.points, multiplier)} taps
                      </span>
                    </span>
                    <span
                      className={`shrink-0 font-mono text-sm font-bold ${
                        cleared ? "text-mint" : "text-foreground/60"
                      }`}
                    >
                      +{bpsToPercent(level.boostBps)}
                    </span>
                  </li>
                );
              })}
            </ol>

            <div className="rounded-2xl border border-foreground/8 bg-background p-4">
              <p className="font-pixel text-[9px] tracking-[0.2em] text-foreground/45">
                APY BUDGET
              </p>
              <p className="mt-2 text-xs leading-relaxed text-foreground/55">
                The boost is added to your staking APY <strong>before</strong> the protocol clamp, so
                it can never lift a wallet past the{" "}
                <span className="font-mono text-foreground/75">
                  {bpsToPercent(STAKING_BUDGET.maxApyBps)}
                </span>{" "}
                hard cap. The maximum tab boost ({bpsToPercent(TAB_CHALLENGE.maxBoostBps)}) is
                smaller than the Mythic tier boost ({bpsToPercent(STAKING_BUDGET.tierBonusBps[3])})
                that already exists, it lasts only {TAB_CHALLENGE.boostSeconds / 3600}h, and it pays
                out of the same funded reserve that backs every other claim.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Power → ceiling */}
      <div className="mt-6 rounded-3xl border border-foreground/8 bg-surface p-6 sm:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="font-pixel text-[9px] tracking-[0.2em] text-foreground/45">
              POWER SCORE
            </span>
            <h3 className="mt-2 text-lg font-bold tracking-tight">
              Better sneakers raise your ceiling
            </h3>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-foreground/55">
              Power = worn rarity (rarity scaled by condition) +{" "}
              {TAB_CHALLENGE.modPowerEach} points per equipped mod, capped at{" "}
              {TAB_CHALLENGE.maxPowerScore}. The ceiling scales linearly from{" "}
              {bpsToPercent(TAB_CHALLENGE.minBoostBps)} to {bpsToPercent(TAB_CHALLENGE.maxBoostBps)}.
            </p>
          </div>
          <p className="shrink-0 rounded-full border border-foreground/12 px-4 py-2 font-mono text-[11px] text-foreground/55">
            ceiling = {TAB_CHALLENGE.minBoostBps} + power bps
          </p>
        </div>

        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {POWER_EXAMPLES.map((example) => {
            const power = sneakerPower({
              rarity: example.rarity,
              conditionBps: example.conditionBps,
              equippedMods: example.equippedMods,
            });
            return (
              <HoloSneakerCard
                key={example.name}
                family={example.family}
                label={`${example.name} · ${example.equippedMods} mods`}
                tier={example.tier}
                rarity={example.rarity}
                conditionBps={example.conditionBps}
                equippedMods={example.equippedMods}
                caption={`Effective rarity ${power.effectiveRarity} · condition ${conditionPercent(example.conditionBps)}% · ceiling +${bpsToPercent(power.ceilingBps)}`}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}
