"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getAddress, isAddress, type Address } from "viem";
import { usePolygonWallet } from "@/components/Providers";
import ModItemCard from "@/components/ModItemCard";
import { SkeletonCardGrid } from "@/components/Skeleton";
import { useModEconomy } from "@/hooks/useModEconomy";
import { useOwnedMods } from "@/hooks/useOwnedMods";
import { usePolPrice } from "@/hooks/usePolPrice";
import { modStoreAbi } from "@/lib/contracts";
import { centerInScrollRow } from "@/lib/scroll-x";
import { MOD_ITEMS, MOD_ITEM_SLOTS, lowestPricePol, type ModItem } from "@/lib/mod-items";
import { slotInfo } from "@/lib/mods";
import { useSubgraphActivity } from "@/hooks/useSubgraphActivity";

const modsAddressEnv = process.env.NEXT_PUBLIC_SNEAKER_MODS_ADDRESS;

type DesignRow = {
  index: bigint;
  slot: number;
  tier: number;
  price: bigint;
  maxSupply: number;
  minted: number;
  active: boolean;
};

/// The item shop. Every card is a `SneakerMods` ERC-721 that gets equipped into
/// one of the seven workshop slots on a veSneaker. Cards stay readable before
/// deployment: they show the catalog and price, and the action flips to
/// "Not registered on-chain yet" until `ModStore.addDesign` matches slot+tier.
export default function ModItemGallery({ onEquip }: { onEquip: (slot: number) => void }) {
  const wallet = usePolygonWallet();
  const economy = useModEconomy();
  const polPrice = usePolPrice();
  const { addLocalActivity } = useSubgraphActivity(wallet.address);

  const modsAddress = useMemo<Address | null>(
    () => (modsAddressEnv && isAddress(modsAddressEnv) ? getAddress(modsAddressEnv) : null),
    [],
  );
  const owned = useOwnedMods({ owner: wallet.address, contractAddress: modsAddress, publicClient: wallet.publicClient });

  const [designs, setDesigns] = useState<DesignRow[]>([]);
  const [isReading, setIsReading] = useState(false);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slotFilter, setSlotFilter] = useState<number | "all">("all");

  const storeAddress = economy.modStoreAddress;

  const refreshDesigns = useCallback(async () => {
    if (!storeAddress) {
      setDesigns([]);
      return;
    }
    setIsReading(true);
    try {
      const count = await wallet.publicClient.readContract({
        address: storeAddress,
        abi: modStoreAbi,
        functionName: "designCount",
      });
      const rows = await Promise.all(
        Array.from({ length: Number(count) }, (_, i) =>
          wallet.publicClient
            .readContract({
              address: storeAddress,
              abi: modStoreAbi,
              functionName: "designs",
              args: [BigInt(i)],
            })
            .catch(() => null),
        ),
      );
      const next: DesignRow[] = [];
      rows.forEach((raw, i) => {
        if (!raw) return;
        // `designs` is a struct, so viem returns a named object.
        const { slot, tier, consumable, price, maxSupply, minted, active } = raw;
        if (consumable) return; // consumables live in the dashboard, not the equip gallery
        next.push({
          index: BigInt(i),
          slot: Number(slot),
          tier: Number(tier),
          price,
          maxSupply: Number(maxSupply),
          minted: Number(minted),
          active: Boolean(active),
        });
      });
      setDesigns(next);
    } catch {
      setDesigns([]);
    } finally {
      setIsReading(false);
    }
  }, [storeAddress, wallet.publicClient]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void refreshDesigns());
    return () => window.cancelAnimationFrame(frame);
  }, [refreshDesigns]);

  /// Owned non-consumable mods grouped by `slot:tier` so the card can show a count.
  const ownedBySlotTier = useMemo(() => {
    const map = new Map<string, number>();
    for (const mod of owned.mods) {
      if (mod.traits.consumable) continue;
      const key = `${mod.traits.slot}:${mod.traits.tier}`;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [owned.mods]);

  const designBySlotTier = useMemo(() => {
    const map = new Map<string, DesignRow>();
    for (const design of designs) map.set(`${design.slot}:${design.tier}`, design);
    return map;
  }, [designs]);

  const visibleItems = useMemo(
    () => (slotFilter === "all" ? MOD_ITEMS : MOD_ITEMS.filter((item) => item.slot === slotFilter)),
    [slotFilter],
  );

  const registeredCount = useMemo(
    () => MOD_ITEMS.filter((item) => designBySlotTier.has(`${item.slot}:${item.tier}`)).length,
    [designBySlotTier],
  );

  async function handleBuy(item: ModItem, designIndex: bigint) {
    setNotice(null);
    setError(null);
    setBusyItemId(item.id);
    try {
      const hash = await economy.buyMod(designIndex);
      addLocalActivity(`Bought ${item.name}`, hash);
      setNotice(`${item.name} minted to your wallet — equip it on a veSneaker below.`);
      await Promise.all([refreshDesigns(), owned.refresh()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `${item.name} purchase failed.`);
    } finally {
      setBusyItemId(null);
    }
  }

  const filters: { id: number | "all"; label: string; icon?: string }[] = [
    { id: "all", label: "All items" },
    ...MOD_ITEM_SLOTS.map((slot) => ({ id: slot, label: slotInfo(slot).label, icon: slotInfo(slot).icon })),
  ];

  return (
    <section aria-labelledby="item-gallery-title" className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-mint/25 bg-mint/8 px-3 py-1.5 font-pixel text-[10px] tracking-[0.2em] text-mint">
            <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-mint" />
            ITEM LINE
          </span>
          <h2 id="item-gallery-title" className="text-gradient mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
            Mod NFTs you can equip
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-foreground/60">
            Each item is a real NFT that slots into one of seven positions on a veSneaker. Buy it
            here, then equip it below — the effect is live from the next read, and unequipping
            returns the exact NFT to your wallet.
          </p>
        </div>

        <dl className="grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-foreground/8 bg-surface px-4 py-3 text-center">
            <dt className="font-mono text-[10px] tracking-[0.14em] text-foreground/45 uppercase">Items</dt>
            <dd className="mt-1 font-mono text-lg font-bold">{MOD_ITEMS.length}</dd>
          </div>
          <div className="rounded-2xl border border-foreground/8 bg-surface px-4 py-3 text-center">
            <dt className="font-mono text-[10px] tracking-[0.14em] text-foreground/45 uppercase">Live</dt>
            <dd className={`mt-1 font-mono text-lg font-bold ${registeredCount > 0 ? "text-mint" : "text-foreground/40"}`}>
              {registeredCount}
            </dd>
          </div>
          <div className="rounded-2xl border border-foreground/8 bg-surface px-4 py-3 text-center">
            <dt className="font-mono text-[10px] tracking-[0.14em] text-foreground/45 uppercase">From</dt>
            <dd className="mt-1 font-mono text-lg font-bold text-mint">{lowestPricePol()} POL</dd>
          </div>
        </dl>
      </div>

      {/* Filters */}
      <div className="scroll-x -mx-6 flex gap-2 px-6 pb-1">
        {filters.map((filter) => {
          const active = slotFilter === filter.id;
          return (
            <button
              key={String(filter.id)}
              type="button"
              onClick={(event) => {
                setSlotFilter(filter.id);
                centerInScrollRow(event.currentTarget);
              }}
              aria-pressed={active}
              className={`flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-full border px-4 text-xs font-semibold transition-[transform,color,background-color,border-color,fill,stroke] duration-300 active:scale-95 ${
                active
                  ? "border-mint/40 bg-mint/10 text-mint"
                  : "border-foreground/10 text-foreground/60 hover:border-foreground/30 hover:text-foreground"
              }`}
            >
              {filter.icon ? <span aria-hidden>{filter.icon}</span> : null}
              {filter.label}
            </button>
          );
        })}
      </div>

      {/* Grid — skeletons first so the shop does not jump when the read lands. */}
      {isReading && designs.length === 0 ? (
        <div aria-busy="true" aria-live="polite" aria-label="Loading the item line">
          <SkeletonCardGrid count={4} columns="sm:grid-cols-2 lg:grid-cols-4" />
        </div>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {visibleItems.map((item) => {
          const design = designBySlotTier.get(`${item.slot}:${item.tier}`) ?? null;
          return (
            <ModItemCard
              key={item.id}
              item={item}
              designIndex={design?.index ?? null}
              livePricePol={design?.price ?? null}
              ownedCount={ownedBySlotTier.get(`${item.slot}:${item.tier}`) ?? 0}
              maxSupply={design?.maxSupply ?? null}
              minted={design?.minted ?? null}
              polUsd={polPrice.price.usd}
              isBusy={busyItemId === item.id || economy.isLoading}
              onBuy={handleBuy}
              onEquip={(target) => onEquip(target.slot)}
            />
          );
        })}
      </div>

      {/* Status */}
      {!storeAddress ? (
        <p className="rounded-2xl border border-dashed border-foreground/15 bg-surface px-5 py-4 text-xs leading-relaxed text-foreground/55">
          <strong className="text-foreground/75">Shop offline.</strong>{" "}
          {MOD_ITEMS.length} items are catalogued with artwork and prices. Once the ModStore is
          deployed and each item is registered with <code className="font-mono">addDesign</code>,
          the buy buttons activate automatically — no frontend change needed.
        </p>
      ) : registeredCount < MOD_ITEMS.length ? (
        <p className="rounded-2xl border border-dashed border-foreground/15 bg-surface px-5 py-4 text-xs leading-relaxed text-foreground/55">
          {MOD_ITEMS.length - registeredCount} of {MOD_ITEMS.length} items still need an{" "}
          <code className="font-mono">addDesign</code> call matching their slot and tier. The rest
          are purchasable now.
        </p>
      ) : null}

      {notice ? <p className="rounded-2xl bg-mint/15 px-4 py-3 text-xs font-semibold text-mint">{notice}</p> : null}
      {error ? <p className="rounded-2xl bg-magma/15 px-4 py-3 text-xs font-semibold text-magma">{error}</p> : null}
    </section>
  );
}
