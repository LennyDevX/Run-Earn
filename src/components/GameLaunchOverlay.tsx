"use client";

import { useEffect, useState } from "react";

/// How long the launch screen holds before the route is revealed.
const LAUNCH_MS = 6000;
/// Blocks in the pixel spinner ring.
const BLOCKS = 12;
/// Radius of the ring, in rem.
const RADIUS_REM = 3.25;

const HINTS = [
  "BOOTING TAP ENGINE",
  "SYNCING VE SNEAKER",
  "READING POWER SCORE",
  "ARMING STAKING BOOST",
] as const;

/// Full-screen launch screen. Mounted by `GameLaunchProvider` the moment the
/// player hits Start, so it covers the whole viewport *before* the arena route
/// renders. Pure CSS — the spinner is a ring of pixel blocks lighting up in
/// sequence, no image assets.
export default function GameLaunchOverlay({ onDone }: { onDone: () => void }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const ratio = Math.min(1, (Date.now() - startedAt) / LAUNCH_MS);
      setProgress(Math.round(ratio * 100));
      if (ratio >= 1) {
        window.clearInterval(timer);
        onDone();
      }
    }, 50);
    return () => window.clearInterval(timer);
  }, [onDone]);

  // Freeze the page behind the overlay.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const hintIndex = Math.min(HINTS.length - 1, Math.floor((progress / 100) * HINTS.length));

  return (
    <div
      className="launch-overlay fixed inset-0 z-[100] flex flex-col items-center justify-center gap-10 px-6"
      role="status"
      aria-live="polite"
      aria-label={`Loading the tab arena — ${progress}%`}
    >
      <span aria-hidden className="crt-scanlines pointer-events-none absolute inset-0 opacity-60" />
      <span aria-hidden className="hud-grid pointer-events-none absolute inset-0 opacity-30" />
      <span aria-hidden className="crt-sweep pointer-events-none absolute inset-x-0 top-0 h-40" />

      <span aria-hidden className="hud-corner hud-corner-tl text-brand" />
      <span aria-hidden className="hud-corner hud-corner-tr text-brand" />
      <span aria-hidden className="hud-corner hud-corner-bl text-brand" />
      <span aria-hidden className="hud-corner hud-corner-br text-brand" />

      {/* Pixel spinner */}
      <div className="relative flex size-32 items-center justify-center">
        <span aria-hidden className="absolute inset-2 rounded-full bg-brand/12 blur-2xl animate-glow" />
        <span
          aria-hidden
          className="absolute inset-0 rounded-full border border-dashed border-brand/20 animate-spin-slow"
        />
        {Array.from({ length: BLOCKS }, (_, index) => (
          <span
            key={index}
            aria-hidden
            className="spinner-block"
            style={{
              transform: `translate(-50%, -50%) rotate(${(index * 360) / BLOCKS}deg) translateY(-${RADIUS_REM}rem)`,
              animationDelay: `${(index * -0.1).toFixed(2)}s`,
            }}
          />
        ))}
      </div>

      {/* Readout */}
      <div className="w-full max-w-sm">
        <p className="animate-flicker text-center font-pixel text-xs tracking-[0.28em] text-brand">
          LOADING GAME
          <span className="animate-blink">_</span>
        </p>

        <div className="mt-5 flex items-baseline justify-between font-mono text-[10px] tracking-[0.18em] text-foreground/45 uppercase">
          <span>Airen · Tab Arena</span>
          <span className="tabular-nums text-brand">{progress}%</span>
        </div>

        <div className="mt-2 h-2.5 overflow-hidden rounded-full border border-brand/25 bg-background/70 p-[2px]">
          <span
            className="block h-full w-full origin-left rounded-full bg-linear-to-r from-mint via-brand to-astra transition-transform duration-100 ease-out"
            style={{ transform: `scaleX(${progress / 100})` }}
          />
        </div>

        {/* Segmented arcade readout */}
        <div aria-hidden className="mt-2 flex gap-1">
          {Array.from({ length: 24 }, (_, index) => {
            const lit = index < Math.round((progress / 100) * 24);
            return (
              <span
                key={index}
                className={`h-1 flex-1 rounded-full transition-colors duration-150 ${
                  lit ? "bg-brand" : "bg-foreground/10"
                }`}
              />
            );
          })}
        </div>

        <p className="mt-5 text-center font-mono text-[11px] text-mint">{HINTS[hintIndex]}</p>
      </div>
    </div>
  );
}
