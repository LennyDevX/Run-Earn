"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatEther, parseEther } from "viem";
import { usePolygonWallet } from "@/components/Providers";
import { useVeSneakerStore } from "@/hooks/useVeSneakerStore";
import { usePlayerProgress } from "@/hooks/usePlayerProgress";
import { useSubgraphActivity } from "@/hooks/useSubgraphActivity";
import { usePolPrice } from "@/hooks/usePolPrice";
import SneakerArtwork from "@/components/SneakerArtwork";
import { centerInScrollRow } from "@/lib/scroll-x";
import {
  VE_FALLBACK_PRICE_POL,
  VE_MAX_SUPPLY_FALLBACK,
  VE_RARITY_STYLES,
  VE_SNEAKER_CATALOG,
  VE_SNEAKER_FAMILIES,
  VE_TIER_BOOST,
  VE_TIER_LABEL,
  type VeSneakerFamilyId,
} from "@/lib/ve-sneakers";

type Filter = "All" | VeSneakerFamilyId;

const FILTERS: Filter[] = ["All", "astra", "sol", "luna"];
const FILTER_LABELS: Record<Filter, string> = {
  All: "All lines",
  astra: "Astra",
  sol: "Sol",
  luna: "Luna",
};
const FILTER_STYLES: Record<VeSneakerFamilyId, string> = {
  astra: "border-astra/40 bg-astra/10 text-astra",
  sol: "border-sol/40 bg-sol/10 text-sol",
  luna: "border-luna/40 bg-luna/10 text-luna",
};

function formatPol(value: bigint, maxDigits = 2) {
  const num = Number(formatEther(value));
  return num.toLocaleString("en-US", { maximumFractionDigits: maxDigits, minimumFractionDigits: num < 1 ? 2 : 0 });
}

export default function VeSneakerStorefront() {
  const wallet = usePolygonWallet();
  const store = useVeSneakerStore();
  const progress = usePlayerProgress({ owner: wallet.address ?? null, publicClient: wallet.publicClient });
  const playerLevel = progress.snapshot?.level ?? 0;
  const { addLocalActivity } = useSubgraphActivity(wallet.address);
  const polPrice = usePolPrice();
  const [filter, setFilter] = useState<Filter>("All");
  const [quantityByDesign, setQuantityByDesign] = useState<Record<number, number>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const isConfigured = store.configured;

  // Merge the static catalog with on-chain design state (price/supply) by index.
  const rows = useMemo(
    () =>
      VE_SNEAKER_CATALOG.map((entry, index) => {
        const onChain = store.designs[index];
        const family = VE_SNEAKER_FAMILIES.find((item) => item.id === entry.family) ?? VE_SNEAKER_FAMILIES[0];
        const tier = Number(onChain?.tier ?? entry.tier);
        const rarity = Number(onChain?.rarity ?? entry.rarity);
        const price = onChain?.price ?? parseEther(VE_FALLBACK_PRICE_POL[tier] ?? "421");
        const maxSupply = onChain?.maxSupply ?? VE_MAX_SUPPLY_FALLBACK;
        const minted = onChain?.minted ?? 0n;
        return {
          index,
          name: entry.name,
          family: entry.family,
          imageSrc: entry.imageSrc,
          tagline: family.tagline,
          tier,
          rarity,
          price,
          maxSupply,
          minted,
          remaining: maxSupply - minted,
          requiredLevel: onChain?.requiredLevel ?? 0,
          active: onChain?.active ?? true,
          label: VE_TIER_LABEL[tier] ?? "Common",
          boost: VE_TIER_BOOST[tier] ?? "+0.5% APY",
        };
      }),
    [store.designs],
  );

  const visible = filter === "All" ? rows : rows.filter((row) => row.family === filter);

  function setQuantity(index: number, next: number) {
    setQuantityByDesign((current) => ({ ...current, [index]: Math.max(1, Math.min(20, next)) }));
  }

  async function handleBuy(index: number, price: bigint, remaining: bigint) {
    setActionError(null);
    setActionNotice(null);
    if (!isConfigured) {
      setActionNotice("Demo mode: connect a wallet and deploy VeSneakerStore to buy on-chain.");
      return;
    }
    if (!wallet.isConnected) {
      setActionError("Connect your wallet to buy a veSneaker.");
      return;
    }
    const quantity = quantityByDesign[index] ?? 1;
    if (BigInt(quantity) > remaining) {
      setActionError(`Only ${remaining.toString()} copies left for this design.`);
      return;
    }
    try {
      const hash = await store.buy(BigInt(index), price, quantity);
      addLocalActivity(`Bought ${quantity}× veSneaker`, hash);
      setActionNotice(`Purchase confirmed — ${quantity} veSneaker${quantity > 1 ? "s" : ""} minted to your wallet.`);
      await store.refresh();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Could not complete the purchase.");
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Store status */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-foreground/10 bg-surface px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="relative flex size-3">
            <span className={`absolute inline-flex size-full animate-ping rounded-full opacity-75 ${isConfigured ? "bg-mint" : "bg-foreground/30"}`} />
            <span className={`relative inline-flex size-3 rounded-full ${isConfigured ? "bg-mint" : "bg-foreground/40"}`} />
          </div>
          <div>
            <span className={`font-pixel text-[9px] ${isConfigured ? "text-mint" : "text-foreground/50"}`}>
              {isConfigured ? "VE SNEAKER STORE LIVE" : "STORE NOT CONFIGURED"}
            </span>
            <p className="text-xs font-semibold text-foreground/80">
              Buy with POL · purely virtual game NFTs
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-mint/20 bg-mint/10 px-3 py-1 font-pixel text-[9px] text-mint">
            POL APY BOOST
          </span>
          <span className="rounded-full border border-polygon-purple/20 bg-polygon-purple/10 px-3 py-1 font-pixel text-[9px] text-polygon-purple">
            VERUNE EARNINGS
          </span>
          <span className="rounded-full border border-foreground/10 bg-background px-3 py-1 text-xs font-semibold text-foreground/60">
            {VE_MAX_SUPPLY_FALLBACK.toString()} max / design
          </span>
          <button
            type="button"
            onClick={() => void polPrice.refresh(true)}
            title={polPrice.error ?? "POL/USD via Uniswap Trading API"}
            className="min-h-9 cursor-pointer rounded-full border border-sky/20 bg-sky/10 px-3 py-2 font-pixel text-[9px] text-sky transition-colors active:scale-95 hover:bg-sky/20"
          >
            {polPrice.isLoading
              ? "POL PRICE…"
              : `POL $${polPrice.price.usd.toFixed(4)}${polPrice.price.source === "uniswap" ? "" : " (fallback)"}`}
          </button>
        </div>
      </div>

      {/* Benefits */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-3xl border border-foreground/10 bg-surface p-5">
          <span className="font-pixel text-[9px] text-mint">STAKING BOOST</span>
          <p className="mt-2 text-sm font-bold">Lock for POL yield</p>
          <p className="mt-1 text-xs leading-relaxed text-foreground/60">
            Lock a veSneaker in the staking vault to add +0.5% to +1.8% APY to your staked POL.
          </p>
        </div>
        <div className="rounded-3xl border border-foreground/10 bg-surface p-5">
          <span className="font-pixel text-[9px] text-sky">VERUNE POINTS</span>
          <p className="mt-2 text-sm font-bold">Earn passively</p>
          <p className="mt-1 text-xs leading-relaxed text-foreground/60">
            Activate it every 24h in the sneaker game to accrue veRUNE, redeemable for REN.
          </p>
        </div>
        <div className="rounded-3xl border border-foreground/10 bg-surface p-5">
          <span className="font-pixel text-[9px] text-magma">MARKETPLACE</span>
          <p className="mt-2 text-sm font-bold">Trade any time</p>
          <p className="mt-1 text-xs leading-relaxed text-foreground/60">
            List, auction, or accept offers on the marketplace once you own it.
          </p>
        </div>
        <div className="rounded-3xl border border-foreground/10 bg-surface p-5">
          <span className="font-pixel text-[9px] text-polygon-purple">FULLY VIRTUAL</span>
          <p className="mt-2 text-sm font-bold">Playable NFTs</p>
          <p className="mt-1 text-xs leading-relaxed text-foreground/60">
            Buy with POL and put your veSneaker to work: game, staking, workshop mods.
          </p>
        </div>
      </div>

      {/* Filters — horizontal scroll keeps them on one row on narrow screens */}
      <div className="scroll-x -mx-6 flex gap-2 px-6 pb-1">
        {FILTERS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={(event) => {
              setFilter(item);
              centerInScrollRow(event.currentTarget);
            }}
            className={`min-h-11 shrink-0 cursor-pointer rounded-full border px-4 text-xs font-semibold transition-all duration-300 active:scale-95 ${
              filter === item
                ? item === "All"
                  ? "border-sky/40 bg-sky/10 text-sky"
                  : FILTER_STYLES[item]
                : "border-foreground/10 text-foreground/60 hover:border-foreground/30 hover:text-foreground"
            }`}
          >
            {FILTER_LABELS[item]}
          </button>
        ))}
      </div>

      {/* Catalog grid */}
      <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((row, i) => {
          const quantity = quantityByDesign[row.index] ?? 1;
          const soldOut = row.remaining <= 0n;
          const designMissing = isConfigured && row.index >= store.designs.length;
          const levelLocked =
            row.requiredLevel > 0 && (!progress.configured || playerLevel < row.requiredLevel);
          const disabled = !isConfigured || designMissing || !row.active || soldOut || levelLocked || store.isLoading;
          return (
            <article
              key={row.name}
              className="group animate-fade-up flex flex-col gap-4 rounded-3xl border border-foreground/10 bg-surface p-6 transition-all duration-500 hover:-translate-y-2 hover:shadow-xl hover:shadow-foreground/8"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <div className={`relative overflow-hidden rounded-2xl border border-foreground/10 bg-ink ${
                row.family === "astra" ? "shadow-[0_0_36px_rgba(190,114,255,0.14)]" :
                  row.family === "sol" ? "shadow-[0_0_36px_rgba(255,196,71,0.14)]" :
                    "shadow-[0_0_36px_rgba(200,221,255,0.14)]"
              }`}>
                <SneakerArtwork
                  src={row.imageSrc}
                  alt={`${row.name} retro-futuristic pixel sneaker`}
                  className="w-full transition-transform duration-500 group-hover:scale-[1.03]"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                />
                <span
                  className="absolute top-3 left-3 rounded-sm bg-background/80 px-2.5 py-1 font-pixel text-[8px] tracking-widest uppercase backdrop-blur-sm"
                  style={{ color: `var(--color-${row.family})` }}
                >
                  {row.name}
                </span>
                <span className={`absolute top-3 right-3 rounded-sm px-2.5 py-1 text-[10px] font-semibold tracking-wider uppercase ${VE_RARITY_STYLES[row.label]}`}>
                  {row.label}
                </span>
                {row.requiredLevel > 0 ? (
                  <span className={`absolute bottom-3 left-3 rounded-full px-2.5 py-1 font-pixel text-[9px] ${levelLocked ? "bg-magma/10 text-magma" : "bg-mint/10 text-mint"}`}>
                    LV {row.requiredLevel}+
                  </span>
                ) : null}
              </div>

              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold tracking-tight">{row.name}</h3>
                  <p className="mt-1 max-w-[22ch] text-xs leading-relaxed text-foreground/55">{row.tagline}</p>
                  <span className="mt-2 block font-mono text-xs text-foreground/40">
                    veSneaker #{String(row.index + 1).padStart(4, "0")}
                  </span>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm font-bold text-mint">{formatPol(row.price)} POL</div>
                  <div className="text-[10px] text-foreground/45">≈ ${(Number(formatEther(row.price)) * polPrice.price.usd).toFixed(2)}</div>
                </div>
              </div>

              <div className="flex flex-col gap-1 text-xs text-foreground/60">
                <div className="flex items-center justify-between">
                  <span>APY boost:</span>
                  <span className="font-mono font-bold text-mint">{row.boost}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Rarity score:</span>
                  <span className="font-mono font-bold text-foreground">{row.rarity}/100</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Supply:</span>
                  <span className="font-mono text-foreground/70">
                    {row.minted.toString()} / {row.maxSupply.toString()} minted
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center rounded-full border border-foreground/15">
                  <button
                    type="button"
                    onClick={() => setQuantity(row.index, quantity - 1)}
                    disabled={quantity <= 1}
                    className="flex size-11 cursor-pointer items-center justify-center text-base font-bold text-foreground/60 transition-colors active:scale-95 hover:text-foreground disabled:opacity-30"
                    aria-label="Decrease quantity"
                  >
                    −
                  </button>
                  <span className="w-7 text-center font-mono text-xs font-bold tabular-nums">{quantity}</span>
                  <button
                    type="button"
                    onClick={() => setQuantity(row.index, quantity + 1)}
                    disabled={quantity >= 20}
                    className="flex size-11 cursor-pointer items-center justify-center text-base font-bold text-foreground/60 transition-colors active:scale-95 hover:text-foreground disabled:opacity-30"
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => void handleBuy(row.index, row.price, row.remaining)}
                  className="min-h-11 flex-1 cursor-pointer rounded-full bg-mint px-4 text-xs font-bold text-ink shadow-md shadow-mint/10 transition-transform active:scale-[0.98] hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {designMissing
                    ? "Not registered on-chain"
                    : soldOut
                      ? "Sold out"
                      : levelLocked
                      ? `Requires level ${row.requiredLevel}`
                      : store.isLoading
                        ? "Confirming..."
                        : `Buy for ${formatPol(row.price * BigInt(quantity))} POL`}
                </button>
              </div>
            </article>
          );
        })}
      </section>

      {actionNotice ? <p className="rounded-2xl bg-mint/15 px-4 py-3 text-xs font-semibold text-mint">{actionNotice}</p> : null}
      {actionError ? <p className="rounded-2xl bg-magma/15 px-4 py-3 text-xs font-semibold text-magma">{actionError}</p> : null}

      {/* Next steps */}
      <div className="rounded-2xl border border-foreground/10 bg-surface p-6 sm:p-8">
        <span className="font-pixel text-[9px] text-mint">AFTER YOU BUY</span>
        <h3 className="mt-2 text-xl font-bold tracking-tight">Put your veSneaker to work</h3>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <Link href="/staking" className="rounded-2xl bg-background p-5 transition-colors hover:bg-mint/5">
            <span className="font-pixel text-[9px] text-mint">01 · STAKING</span>
            <p className="mt-2 text-sm font-bold">Lock for APY boost</p>
            <p className="mt-1 text-xs text-foreground/60">Deposit POL and lock your veSneaker to raise your yield.</p>
          </Link>
          <Link href="/game" className="rounded-2xl bg-background p-5 transition-colors hover:bg-sky/5">
            <span className="font-pixel text-[9px] text-sky">02 · GAME</span>
            <p className="mt-2 text-sm font-bold">Activate daily</p>
            <p className="mt-1 text-xs text-foreground/60">Activate every 24h to earn veRUNE and build streaks.</p>
          </Link>
          <Link href="/marketplace" className="rounded-2xl bg-background p-5 transition-colors hover:bg-magma/5">
            <span className="font-pixel text-[9px] text-magma">03 · MARKETPLACE</span>
            <p className="mt-2 text-sm font-bold">Sell or trade</p>
            <p className="mt-1 text-xs text-foreground/60">List it, run an auction, or accept offers in POL.</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
