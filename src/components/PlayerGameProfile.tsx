"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getAddress, isAddress, type Address } from "viem";
import { usePolygonWallet } from "@/components/Providers";
import HoloSneakerCard from "@/components/HoloSneakerCard";
import { useOwnedMods } from "@/hooks/useOwnedMods";
import { useOwnedSneakers } from "@/hooks/useOwnedSneakers";
import { usePlayerProgress } from "@/hooks/usePlayerProgress";
import { sneakerWorkshopAbi } from "@/lib/contracts";
import { ABILITY_LABELS, NO_AUX, slotInfo } from "@/lib/mods";
import { bpsToPercent, sneakerPower, TAB_CHALLENGE } from "@/lib/tab-challenge";

const mintAddressEnv = process.env.NEXT_PUBLIC_SNEAKER_MINT_ADDRESS;
const modsAddressEnv = process.env.NEXT_PUBLIC_SNEAKER_MODS_ADDRESS;
const workshopAddressEnv = process.env.NEXT_PUBLIC_SNEAKER_WORKSHOP_ADDRESS;

function resolve(value: string | undefined): Address | null {
  return value && isAddress(value) ? getAddress(value) : null;
}

type SneakerPowerRow = {
  tokenId: bigint;
  rarity: number;
  tier: number;
  conditionBps: number;
  equippedMods: number;
  family: "astra" | "sol" | "luna";
  label: string;
};

export default function PlayerGameProfile() {
  const wallet = usePolygonWallet();
  const mintAddress = useMemo(() => resolve(mintAddressEnv), []);
  const modsAddress = useMemo(() => resolve(modsAddressEnv), []);
  const workshopAddress = useMemo(() => resolve(workshopAddressEnv), []);

  const owned = useOwnedSneakers({ owner: wallet.address, contractAddress: mintAddress, publicClient: wallet.publicClient });
  const ownedMods = useOwnedMods({ owner: wallet.address, contractAddress: modsAddress, publicClient: wallet.publicClient });
  const progress = usePlayerProgress({ owner: wallet.address ?? null, publicClient: wallet.publicClient });

  const [powerRows, setPowerRows] = useState<SneakerPowerRow[]>([]);
  const [isReadingPower, setIsReadingPower] = useState(false);

  const readPower = useCallback(async () => {
    // Collectibles are art — the runner profile only counts veSneakers.
    if (!wallet.address || owned.sneakers.length === 0) {
      setPowerRows([]);
      return;
    }
    setIsReadingPower(true);
    try {
      const rows = await Promise.all(
        owned.sneakers.filter((sneaker) => sneaker.kind === 0).map(async (sneaker) => {
          const [conditionBps, equippedMods] = workshopAddress
            ? await Promise.all([
                wallet.publicClient
                  .readContract({
                    address: workshopAddress,
                    abi: sneakerWorkshopAbi,
                    functionName: "conditionBps",
                    args: [sneaker.tokenId],
                  })
                  .catch(() => 0),
                wallet.publicClient
                  .readContract({
                    address: workshopAddress,
                    abi: sneakerWorkshopAbi,
                    functionName: "equippedCount",
                    args: [sneaker.tokenId],
                  })
                  .catch(() => 0n),
              ])
            : [10_000, 0n];
          const artwork = sneaker.artwork;
          return {
            tokenId: sneaker.tokenId,
            rarity: Number(sneaker.rarity),
            tier: Number(sneaker.tier),
            conditionBps: Number(conditionBps),
            equippedMods: Number(equippedMods),
            family: artwork.family ?? "astra",
            label: artwork.name ?? "veSneaker",
          } satisfies SneakerPowerRow;
        }),
      );
      setPowerRows(rows);
    } catch {
      setPowerRows([]);
    } finally {
      setIsReadingPower(false);
    }
  }, [owned.sneakers, wallet.address, wallet.publicClient, workshopAddress]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void readPower());
    return () => window.cancelAnimationFrame(frame);
  }, [readPower]);

  const snapshot = progress.snapshot;
  const level = snapshot?.level ?? 1;
  const xpProgress = useMemo(() => {
    if (!snapshot || snapshot.nextLevelXp === 0n) return 100;
    const span = snapshot.nextLevelXp - snapshot.currentLevelXp;
    if (span <= 0n) return 100;
    return Math.min(100, Math.round((Number(snapshot.xp - snapshot.currentLevelXp) / Number(span)) * 100));
  }, [snapshot]);

  const consumables = useMemo(
    () => ownedMods.mods.filter((mod) => mod.traits.consumable),
    [ownedMods.mods],
  );
  const equippables = useMemo(
    () => ownedMods.mods.filter((mod) => !mod.traits.consumable),
    [ownedMods.mods],
  );

  const bestCeiling = useMemo(() => {
    if (powerRows.length === 0) return TAB_CHALLENGE.minBoostBps;
    return Math.max(
      ...powerRows.map(
        (row) =>
          sneakerPower({
            rarity: row.rarity,
            conditionBps: row.conditionBps,
            equippedMods: row.equippedMods,
          }).ceilingBps,
      ),
    );
  }, [powerRows]);

  const averagePower = useMemo(() => {
    if (powerRows.length === 0) return 0;
    const total = powerRows.reduce(
      (sum, row) =>
        sum +
        sneakerPower({
          rarity: row.rarity,
          conditionBps: row.conditionBps,
          
          equippedMods: row.equippedMods,
        }).score,
      0,
    );
    return Math.round(total / powerRows.length);
  }, [powerRows]);

  if (!wallet.address) {
    return (
      <section className="rounded-3xl border border-dashed border-foreground/15 bg-surface px-8 py-14 text-center">
        <span className="font-pixel text-[10px] tracking-[0.2em] text-brand">PLAYER PROFILE</span>
        <p className="mt-3 text-sm text-foreground/60">
          Connect your wallet to load your runner profile — level, veSneakers, mods, and the boost
          ceiling each pair can reach.
        </p>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Identity + stats */}
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="group relative overflow-hidden rounded-3xl border border-brand/20 bg-surface p-6 sm:p-7">
          <span
            aria-hidden
            className="pointer-events-none absolute -top-20 -right-12 size-52 rounded-full bg-brand/12 blur-3xl animate-drift"
          />
          <span aria-hidden className="hud-grid pointer-events-none absolute inset-0 opacity-50" />
          <span aria-hidden className="hud-corner hud-corner-tl text-brand" />
          <span aria-hidden className="hud-corner hud-corner-tr text-brand" />
          <span aria-hidden className="hud-corner hud-corner-bl text-brand" />
          <span aria-hidden className="hud-corner hud-corner-br text-brand" />

          <div className="relative flex items-start gap-4">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-brand/25 bg-brand/8 font-mono text-lg font-bold text-brand">
              {String(level).padStart(2, "0")}
            </span>
            <div className="min-w-0 flex-1">
              <span className="font-pixel text-[9px] tracking-[0.2em] text-foreground/45">
                RUNNER PROFILE
              </span>
              <p className="mt-1.5 truncate text-lg font-bold tracking-tight">
                {progress.username || `${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}`}
              </p>
              <p className="mt-1 font-mono text-[11px] text-foreground/45">
                LEVEL {level} · {progress.configured ? "ON-CHAIN XP" : "LOCAL ESTIMATE"}
              </p>
            </div>
            <Link
              href="/profile"
              className="hidden shrink-0 rounded-full border border-foreground/12 px-3 py-2 font-mono text-[10px] text-foreground/55 transition-colors hover:border-brand/40 hover:text-brand sm:block"
            >
              EDIT →
            </Link>
          </div>

          <div className="relative mt-6">
            <div className="flex items-center justify-between font-mono text-[10px] text-foreground/45">
              <span>LEVEL PROGRESS</span>
              <span>{snapshot ? `${snapshot.xp.toString()} XP` : "—"}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-foreground/8">
              <span
                className="block h-full rounded-full bg-linear-to-r from-mint via-brand to-astra transition-[width] duration-1000 ease-out"
                style={{ width: `${xpProgress}%` }}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-2">
          {[
            { label: "veSneakers", value: owned.sneakers.filter((s) => s.kind === 0).length.toString(), accent: "text-astra" },
            { label: "Mods owned", value: ownedMods.mods.length.toString(), accent: "text-sol" },
            { label: "Avg. power", value: `${averagePower}/100`, accent: "text-brand" },
            { label: "Best ceiling", value: `+${bpsToPercent(bestCeiling)}`, accent: "text-mint" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="flex flex-col justify-center gap-1 rounded-3xl border border-foreground/8 bg-surface p-5 transition-all duration-500 hover:-translate-y-1 hover:shadow-lg hover:shadow-ink/5"
            >
              <span className="font-mono text-[10px] tracking-[0.14em] text-foreground/45 uppercase">
                {stat.label}
              </span>
              <span className={`font-mono text-2xl font-bold ${stat.accent}`}>{stat.value}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Collection */}
      <section aria-labelledby="profile-collection">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <span className="font-pixel text-[9px] tracking-[0.2em] text-foreground/45">
              COLLECTION
            </span>
            <h2 id="profile-collection" className="mt-2 text-xl font-bold tracking-tight">
              Your veSneakers
            </h2>
          </div>
          <p className="font-mono text-[11px] text-foreground/45">
            power = worn rarity + {TAB_CHALLENGE.modPowerEach}/mod
          </p>
        </div>

        {owned.isLoading || isReadingPower ? (
          <p className="rounded-3xl border border-dashed border-foreground/15 bg-surface px-8 py-12 text-center text-sm text-foreground/55">
            Loading your collection…
          </p>
        ) : powerRows.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-foreground/15 bg-surface px-8 py-12 text-center">
            <p className="text-sm text-foreground/60">
              No veSneakers yet. Grab one from the collection to unlock the daily tab challenge.
            </p>
            <Link
              href="/collection"
              className="mt-4 inline-flex min-h-11 items-center rounded-full bg-brand px-6 text-sm font-bold text-paper transition-transform hover:scale-105 dark:text-ink"
            >
              Explore collection
            </Link>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {powerRows.map((row) => {
              const power = sneakerPower({
                rarity: row.rarity,
                conditionBps: row.conditionBps,
                
                equippedMods: row.equippedMods,
              });
              return (
                <HoloSneakerCard
                  key={row.tokenId.toString()}
                  family={row.family}
                  label={row.label}
                  tier={row.tier}
                  rarity={row.rarity}
                  conditionBps={row.conditionBps}
                  equippedMods={row.equippedMods}
                  tokenId={row.tokenId}
                  caption={`Rarity ${row.rarity} · LV ${sneakerPower({ rarity: row.rarity, conditionBps: row.conditionBps, equippedMods: row.equippedMods }).level} · ceiling +${bpsToPercent(power.ceilingBps)}`}
                />
              );
            })}
          </div>
        )}
      </section>

      {/* Inventory */}
      <section aria-labelledby="profile-inventory" className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-foreground/8 bg-surface p-6 sm:p-7">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="profile-inventory" className="text-lg font-bold tracking-tight">
              Consumables
            </h2>
            <span className="font-mono text-[11px] text-foreground/45">
              {consumables.length} held
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-foreground/50">
            Burned in the workshop for one-shot effects — repairs, surges, temp boosts, and energy.
          </p>

          {consumables.length === 0 ? (
            <p className="mt-5 rounded-2xl bg-background px-4 py-6 text-center text-xs text-foreground/45">
              No consumables yet. Buy them from the mod store or claim achievement badges.
            </p>
          ) : (
            <ul className="mt-5 flex flex-col gap-2">
              {consumables.map((mod) => {
                const kind = mod.traits.aux === NO_AUX ? 0 : mod.traits.aux;
                return (
                  <li
                    key={mod.tokenId.toString()}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-magma/20 bg-magma/5 px-4 py-3"
                  >
                    <span className="min-w-0">
                      <span className="block font-mono text-[11px] text-magma">
                        #{String(mod.tokenId).padStart(4, "0")}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-foreground/60">
                        {ABILITY_LABELS[kind] ?? "Consumable — burns on use"}
                      </span>
                    </span>
                    {mod.traits.effectBps > 0 ? (
                      <span className="shrink-0 font-mono text-xs font-bold text-magma">
                        +{bpsToPercent(mod.traits.effectBps)}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}

          <Link
            href="/workshop"
            className="mt-5 inline-flex min-h-10 items-center rounded-full border border-foreground/12 px-4 font-mono text-[11px] text-foreground/60 transition-colors hover:border-brand/40 hover:text-brand"
          >
            Open workshop →
          </Link>
        </div>

        <div className="rounded-3xl border border-foreground/8 bg-surface p-6 sm:p-7">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-bold tracking-tight">Equipped mods</h2>
            <span className="font-mono text-[11px] text-foreground/45">
              {equippables.length} owned
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-foreground/50">
            Seven slots per sneaker. Equipping a mod raises its power score and can push your tab
            boost ceiling to the maximum.
          </p>

          {equippables.length === 0 ? (
            <p className="mt-5 rounded-2xl bg-background px-4 py-6 text-center text-xs text-foreground/45">
              No equippable mods yet.
            </p>
          ) : (
            <ul className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {equippables.map((mod) => {
                const slot = slotInfo(mod.traits.slot);
                return (
                  <li
                    key={mod.tokenId.toString()}
                    className="flex items-center gap-3 rounded-2xl border border-foreground/8 bg-background px-4 py-3"
                  >
                    <span aria-hidden className="text-lg">
                      {slot.icon}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold">{slot.label}</span>
                      <span className="mt-0.5 block font-mono text-[10px] text-foreground/45">
                        +{bpsToPercent(mod.traits.effectBps)}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          <Link
            href="/my-nfts"
            className="mt-5 inline-flex min-h-10 items-center rounded-full border border-foreground/12 px-4 font-mono text-[11px] text-foreground/60 transition-colors hover:border-brand/40 hover:text-brand"
          >
            View all NFTs →
          </Link>
        </div>
      </section>

      {owned.error || ownedMods.error ? (
        <p className="rounded-2xl bg-magma/10 px-4 py-3 text-xs text-magma">
          {owned.error ?? ownedMods.error}
        </p>
      ) : null}
    </div>
  );
}
