"use client";

import SneakerArtwork from "@/components/SneakerArtwork";
import { useHoloPointer } from "@/hooks/useHoloPointer";
import {
  bpsToPercent,
  CONDITION,
  conditionBand,
  conditionPercent,
  sneakerPower,
  TAB_CHALLENGE,
} from "@/lib/tab-challenge";
import {
  VE_RARITY_STYLES,
  VE_SNEAKER_FAMILIES,
  VE_TIER_LABEL,
  type VeSneakerFamilyId,
} from "@/lib/ve-sneakers";

export type HoloSneakerCardProps = {
  family: VeSneakerFamilyId;
  label: string;
  tier: number;
  rarity: number;
  /** Live wear, `CONDITION.floorBps` … `CONDITION.fullBps`. */
  conditionBps?: number;
  equippedMods?: number;
  tokenId?: bigint;
  /** Small caption under the name — e.g. a wallet state or challenge result. */
  caption?: string;
  /** Highlighted boost to show in the corner chip (defaults to the ceiling). */
  boostBps?: number;
  className?: string;
};

/// Holographic veSneaker card: rotating conic foil frame, iridescent sheen over
/// the artwork, and the live condition bar that shows how worn the pair is.
/// Condition scales rarity, so the bar is the single best indicator of what the
/// runner is currently worth.
export default function HoloSneakerCard({
  family,
  label,
  tier,
  rarity,
  conditionBps = CONDITION.fullBps,
  equippedMods = 0,
  tokenId,
  caption,
  boostBps,
  className = "",
}: HoloSneakerCardProps) {
  const meta = VE_SNEAKER_FAMILIES.find((item) => item.id === family) ?? VE_SNEAKER_FAMILIES[0];
  const rarityLabel = VE_TIER_LABEL[tier] ?? "Common";
  const { ref: holoRef, onPointerMove: onHoloMove, onPointerLeave: onHoloLeave } =
    useHoloPointer<HTMLElement>();
  const power = sneakerPower({ rarity, conditionBps, equippedMods });
  const shownBoost = boostBps ?? power.ceilingBps;
  const band = conditionBand(conditionBps);
  const wearPercent = conditionPercent(conditionBps);
  const isWorn = conditionBps < CONDITION.fullBps;

  return (
    <article
      ref={holoRef}
      onPointerMove={onHoloMove}
      onPointerLeave={onHoloLeave}
      className={`holo-card group ${className}`}
    >
      <div className="flex h-full flex-col gap-4 rounded-2xl bg-surface p-4">
        <div className="relative overflow-hidden rounded-xl border border-white/10 bg-ink">
          <SneakerArtwork
            src={meta.imageSrc}
            alt={`${meta.name} veSneaker artwork`}
            sizes="(max-width: 640px) 90vw, (max-width: 1024px) 33vw, 280px"
            className="w-full"
            imageClassName="transition-transform duration-700 ease-out group-hover:scale-[1.06]"
          />
          <span aria-hidden className="holo-grid pointer-events-none absolute inset-0" />
          <span aria-hidden className="holo-sheen" />
          <span aria-hidden className="holo-glare" />

          <span
            className={`absolute top-2.5 left-2.5 rounded-sm px-2 py-1 font-pixel text-[8px] tracking-[0.14em] uppercase backdrop-blur-sm ${VE_RARITY_STYLES[rarityLabel]}`}
          >
            {rarityLabel}
          </span>
          <span className="absolute top-2.5 right-2.5 rounded-sm border border-mint/30 bg-ink/75 px-2 py-1 font-mono text-[10px] font-bold text-mint backdrop-blur-sm">
            +{bpsToPercent(shownBoost)}
          </span>
          <span
            className="absolute bottom-2.5 left-2.5 rounded-sm bg-ink/75 px-2 py-1 font-mono text-[10px] font-bold text-paper/90 backdrop-blur-sm"
          >
            LV {power.level}
          </span>
          <span
            className="absolute right-2.5 bottom-2.5 font-pixel text-[8px] tracking-[0.18em] uppercase"
            style={{ color: `var(--color-${meta.id})` }}
          >
            {meta.id}
          </span>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="truncate text-sm font-bold tracking-tight">{label}</h3>
            {tokenId !== undefined ? (
              <span className="shrink-0 font-mono text-[10px] text-foreground/40">
                #{String(tokenId).padStart(4, "0")}
              </span>
            ) : null}
          </div>

          {/* Condition bar — decays daily and shifts colour as it wears. */}
          <div>
            <div className="flex items-center justify-between font-mono text-[10px]">
              <span className="tracking-[0.14em] text-foreground/45 uppercase">Condition</span>
              <span className={`font-bold ${band.tone}`}>
                {band.label} · {wearPercent}%
              </span>
            </div>
            <div
              className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-foreground/8"
              role="meter"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={wearPercent}
              aria-label={`${label} condition`}
            >
              <span
                className={`block h-full rounded-full transition-[width] duration-700 ease-out ${band.bar}`}
                style={{ width: `${Math.max(3, wearPercent)}%` }}
              />
            </div>
            {isWorn ? (
              <p className="mt-1.5 font-mono text-[10px] text-foreground/40">
                Servicing restores full rarity
              </p>
            ) : null}
          </div>

          <div>
            <div className="flex items-center justify-between font-mono text-[10px] text-foreground/45">
              <span>POWER</span>
              <span className="text-foreground/70">{power.score}/100</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-foreground/8">
              <span
                className="block h-full rounded-full bg-linear-to-r from-mint via-brand to-astra transition-[width] duration-700 ease-out"
                style={{ width: `${power.score}%` }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 font-mono text-[10px] text-foreground/45">
            <span className="flex items-center gap-1.5">
              RARITY
              <span className="text-foreground/70">
                {power.effectiveRarity}
                {power.effectiveRarity !== rarity ? `/${rarity}` : ""}
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              MODS
              <span className="text-foreground/70">
                {Math.min(TAB_CHALLENGE.maxEquippedMods, equippedMods)}/{TAB_CHALLENGE.maxEquippedMods}
              </span>
            </span>
          </div>

          {caption ? (
            <p className="border-t border-foreground/8 pt-2.5 text-[11px] leading-relaxed text-foreground/50">
              {caption}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}
