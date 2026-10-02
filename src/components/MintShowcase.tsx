"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";

type ShowcaseEntry = {
  src: string;
  label: string;
  kind: "veSneaker" | "Mod";
  /** Optional accent token name, e.g. "astra". */
  accent?: "astra" | "sol" | "luna" | "mint" | "brand";
};

/// Curated rotation for the mint hero. Mixes the three official veSneakers with
/// workshop items so a first-time visitor sees both halves of the product —
/// what they can buy, and what they can equip once they own one.
const SHOWCASE: readonly ShowcaseEntry[] = [
  { src: "/veSneakerAstra.png", label: "Astra", kind: "veSneaker", accent: "astra" },
  { src: "/items/Item4_CoreAutoActiveMythic.png", label: "Apex Reactor", kind: "Mod", accent: "sol" },
  { src: "/veSneakerLuna.png", label: "Luna", kind: "veSneaker", accent: "luna" },
  { src: "/items/item4_SoleWearReductionBpsMythic.png", label: "Apex Cushion", kind: "Mod", accent: "sol" },
  { src: "/veSneakerSol.png", label: "Sol", kind: "veSneaker", accent: "sol" },
  { src: "/items/Item1_SkinAppraisalBonusBpsCosmeticOverride.png", label: "Greycoat", kind: "Mod", accent: "mint" },
  { src: "/items/Item2_UpperEarnBonusBpsRare.png", label: "Vector Weave", kind: "Mod", accent: "brand" },
  { src: "/items/Item1_LiningRepairDiscountBpsMythic.png", label: "Apex Comfort", kind: "Mod", accent: "mint" },
] as const;

const ROTATE_MS = 2_500;

/// Crossfading showcase for the mint hero. Deliberately non-interactive: it is
/// there to show what an Airen NFT looks like, not to be browsed. It pauses when
/// scrolled out of view or hovered, and collapses to a static frame under
/// `prefers-reduced-motion`.
export default function MintShowcase({ className = "" }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  // Only rotate while the showcase is actually on screen.
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.25 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (reducedMotion || !visible || hovered) return;
    const timer = window.setInterval(
      () => setIndex((current) => (current + 1) % SHOWCASE.length),
      ROTATE_MS,
    );
    return () => window.clearInterval(timer);
  }, [hovered, reducedMotion, visible]);

  const active = useMemo(() => SHOWCASE[index], [index]);
  const accentVar = `var(--color-${active.accent ?? "brand"})`;

  /// Only the frames that can be on screen get mounted.
  ///
  /// Every frame is absolutely positioned over the same square, so they all sit
  /// inside the viewport at once — `loading="lazy"` defers nothing and all eight
  /// images downloaded on first paint, adding ~115 KiB to `/mint`.
  ///
  /// Three are needed, not two: the outgoing frame has to stay mounted for the
  /// duration of the fade, otherwise the crossfade degrades to a fade-in from
  /// the backdrop. One extra image buys the effect back.
  const mountedFrames = useMemo(() => {
    const total = SHOWCASE.length;
    return [
      (index - 1 + total) % total,
      index,
      (index + 1) % total,
    ];
  }, [index]);

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      role="img"
      aria-label={`Airen collectible preview: ${active.label}`}
    >
      <div className="relative aspect-square overflow-hidden rounded-3xl border border-white/10 bg-ink shadow-[0_28px_90px_rgba(5,8,26,0.45)]">
        <span aria-hidden className="hud-grid pointer-events-none absolute inset-0 opacity-30" />
        <span
          aria-hidden
          className="pointer-events-none absolute -top-16 left-1/4 size-48 rounded-full blur-3xl animate-drift transition-colors duration-700"
          style={{ backgroundColor: `color-mix(in srgb, ${accentVar} 22%, transparent)` }}
        />

        {mountedFrames.map((frameIndex) => {
          const entry = SHOWCASE[frameIndex];
          return (
            <div
              key={entry.src}
              className={`absolute inset-0 transition-opacity duration-700 ease-out ${
                frameIndex === index ? "opacity-100" : "opacity-0"
              }`}
              aria-hidden={frameIndex !== index}
            >
              <Image
                src={entry.src}
                alt=""
                fill
                sizes="(max-width: 768px) 90vw, 40vw"
                // The first frame is the LCP candidate; the rest arrive as the
                // rotation reaches them.
                loading={frameIndex === 0 ? "eager" : "lazy"}
                className="object-contain p-6 sm:p-8"
              />
            </div>
          );
        })}

        {/* Readout */}
        <div className="absolute top-4 left-4 right-4 z-10 flex items-center justify-between gap-3">
          <span
            className="rounded-sm border px-2.5 py-1.5 font-pixel text-[8px] tracking-[0.18em] uppercase backdrop-blur-sm transition-colors duration-700"
            style={{
              borderColor: `color-mix(in srgb, ${accentVar} 40%, transparent)`,
              backgroundColor: "color-mix(in srgb, var(--color-ink) 70%, transparent)",
              color: accentVar,
            }}
          >
            {active.kind}
          </span>
          <span className="rounded-sm border border-white/15 bg-ink/70 px-2.5 py-1.5 font-mono text-[10px] text-paper/70 backdrop-blur-sm">
            {String(index + 1).padStart(2, "0")} / {String(SHOWCASE.length).padStart(2, "0")}
          </span>
        </div>

        <div className="absolute inset-x-4 bottom-4 z-10 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="font-pixel text-[8px] tracking-[0.2em] text-paper/45 uppercase">
              {active.kind === "veSneaker" ? "Official collection" : "Workshop item"}
            </p>
            <p className="mt-1 truncate text-lg font-bold tracking-tight text-paper">{active.label}</p>
          </div>
          {/* Progress dots double as the position indicator. */}
          <div aria-hidden className="flex shrink-0 items-center gap-1.5 pb-1.5">
            {SHOWCASE.map((entry, entryIndex) => (
              <span
                key={entry.src}
                className={`h-1 rounded-full transition-[width,background-color] duration-500 ${
                  entryIndex === index ? "w-5" : "w-1.5 bg-paper/25"
                }`}
                style={entryIndex === index ? { backgroundColor: accentVar } : undefined}
              />
            ))}
          </div>
        </div>

        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-linear-to-t from-ink/85 via-transparent to-ink/10"
        />
      </div>
    </div>
  );
}
