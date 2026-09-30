"use client";

import Image from "next/image";
import { formatEther } from "viem";
import { useHoloPointer } from "@/hooks/useHoloPointer";
import { modEffectLabel, slotInfo, type ModTraits } from "@/lib/mods";
import type { ModItem } from "@/lib/mod-items";
import { RARITIES } from "@/lib/sneaker-nft";

export type ModItemCardProps = {
  item: ModItem;
  /** Matching `ModStore` design index, or null when not registered on-chain. */
  designIndex: bigint | null;
  /** Live price from the store contract; falls back to the catalog price. */
  livePricePol: bigint | null;
  /** Copies already owned by the connected wallet. */
  ownedCount: number;
  maxSupply: number | null;
  minted: number | null;
  /** Live POL/USD rate for the price hint, from `usePolPrice`. */
  polUsd: number;
  isBusy: boolean;
  onBuy: (item: ModItem, designIndex: bigint) => void;
  onEquip: (item: ModItem) => void;
};

function formatUsd(polAmount: number, polUsd: number) {
  return `≈ $${(polAmount * polUsd).toFixed(2)}`;
}

/// Holographic shop card for a mod NFT: artwork, tier, slot, effect, price, and
/// the buy/equip action. Mirrors `HoloSneakerCard` so the two read as one line.
export default function ModItemCard({
  item,
  designIndex,
  livePricePol,
  ownedCount,
  maxSupply,
  minted,
  polUsd,
  isBusy,
  onBuy,
  onEquip,
}: ModItemCardProps) {
  const slot = slotInfo(item.slot);
  const rarity = RARITIES[item.tier % RARITIES.length];
  const { ref: holoRef, onPointerMove: onHoloMove, onPointerLeave: onHoloLeave } =
    useHoloPointer<HTMLElement>();
  const traits: ModTraits = {
    slot: item.slot,
    rarity: item.rarity,
    tier: item.tier,
    effectBps: item.effectBps,
    aux: 255,
    consumable: false,
    proofHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
  };

  const registered = designIndex !== null;
  const owned = ownedCount > 0;
  const soldOut = maxSupply !== null && minted !== null && maxSupply > 0 && minted >= maxSupply;
  const pricePolNumber = livePricePol !== null ? Number(formatEther(livePricePol)) : Number(item.pricePol);
  const priceLabel = pricePolNumber.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });

  return (
    <article
      ref={holoRef}
      onPointerMove={onHoloMove}
      onPointerLeave={onHoloLeave}
      className="holo-card group"
    >
      <div className="flex h-full flex-col gap-4 rounded-2xl bg-surface p-4">
        {/* Artwork */}
        <div className="relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-ink">
          <Image
            src={item.imageSrc}
            alt={`${item.name} — ${slot.label} mod artwork`}
            fill
            sizes="(max-width: 640px) 90vw, (max-width: 1024px) 45vw, 300px"
            className="object-contain p-3 transition-transform duration-700 ease-out group-hover:scale-[1.05]"
          />
          <span aria-hidden className="holo-grid pointer-events-none absolute inset-0" />
          <span aria-hidden className="holo-sheen" />
          <span aria-hidden className="holo-glare" />

          <span
            className={`absolute top-2.5 left-2.5 rounded-sm px-2 py-1 font-pixel text-[8px] tracking-[0.14em] uppercase backdrop-blur-sm ${rarity?.accent ?? ""}`}
          >
            {rarity?.label ?? "Mod"}
          </span>
          <span className="absolute top-2.5 right-2.5 flex items-center gap-1.5 rounded-sm border border-foreground/15 bg-ink/75 px-2 py-1 font-pixel text-[8px] tracking-[0.14em] text-paper/85 uppercase backdrop-blur-sm">
            <span aria-hidden>{slot.icon}</span>
            {slot.label}
          </span>
          {owned ? (
            <span className="absolute bottom-2.5 left-2.5 rounded-full border border-mint/40 bg-ink/80 px-2.5 py-1 font-mono text-[10px] font-bold text-mint backdrop-blur-sm">
              OWNED ×{ownedCount}
            </span>
          ) : null}
          {soldOut ? (
            <span className="absolute bottom-2.5 right-2.5 rounded-full border border-magma/40 bg-ink/80 px-2.5 py-1 font-pixel text-[8px] tracking-[0.14em] text-magma uppercase backdrop-blur-sm">
              Sold out
            </span>
          ) : null}
        </div>

        {/* Body */}
        <div className="flex flex-1 flex-col gap-3">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="truncate text-sm font-bold tracking-tight">{item.name}</h3>
            <span className="shrink-0 font-mono text-[10px] text-foreground/40">
              R{item.rarity}
            </span>
          </div>

          <p className="text-xs leading-relaxed text-foreground/55">{modEffectLabel(traits)}</p>
          <p className="line-clamp-2 text-[11px] leading-relaxed text-foreground/40">
            {item.description}
          </p>

          {maxSupply !== null && minted !== null ? (
            <p className="font-mono text-[10px] text-foreground/40">
              {minted} / {maxSupply} minted
            </p>
          ) : null}
        </div>

        {/* Action */}
        <div className="flex flex-col gap-2 border-t border-foreground/8 pt-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-[10px] tracking-[0.14em] text-foreground/45 uppercase">
              Price
            </span>
            <span className="text-right">
              <span className="block font-mono text-sm font-bold text-mint">{priceLabel} POL</span>
              <span className="mt-0.5 block font-mono text-[10px] text-foreground/45">
                {formatUsd(pricePolNumber, polUsd)}
              </span>
            </span>
          </div>

          {!registered ? (
            <button
              type="button"
              disabled
              className="min-h-11 w-full cursor-not-allowed rounded-full border border-foreground/12 px-4 text-xs font-semibold text-foreground/40"
            >
              Not registered on-chain yet
            </button>
          ) : owned ? (
            <>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => onEquip(item)}
                className="min-h-11 w-full cursor-pointer rounded-full bg-brand px-4 text-xs font-bold text-paper transition-transform active:scale-[0.98] hover:scale-[1.02] disabled:cursor-wait disabled:opacity-50 dark:text-ink"
              >
                Equip on a veSneaker
              </button>
              <button
                type="button"
                disabled={isBusy || soldOut}
                onClick={() => onBuy(item, designIndex)}
                className="min-h-9 w-full cursor-pointer rounded-full border border-foreground/12 px-4 font-mono text-[11px] text-foreground/60 transition-colors hover:border-mint/40 hover:text-mint disabled:cursor-not-allowed disabled:opacity-45"
              >
                {soldOut ? "Sold out" : `Buy another · ${priceLabel} POL`}
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={isBusy || soldOut}
              onClick={() => onBuy(item, designIndex)}
              className="min-h-11 w-full cursor-pointer rounded-full bg-mint px-4 text-xs font-bold text-ink shadow-md shadow-mint/10 transition-transform active:scale-[0.98] hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isBusy ? "Confirming…" : soldOut ? "Sold out" : `Buy · ${priceLabel} POL`}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
