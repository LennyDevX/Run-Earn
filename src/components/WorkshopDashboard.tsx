"use client";

import { useEffect, useMemo, useState } from "react";
import { formatEther } from "viem";
import { NETWORK_LABEL, usePolygonWallet } from "@/components/Providers";
import { useWorkshop } from "@/hooks/useWorkshop";
import { useSneakerGame } from "@/hooks/useSneakerGame";
import { useSubgraphActivity } from "@/hooks/useSubgraphActivity";
import { modEffectLabel, NO_AUX, SLOTS, type OwnedMod } from "@/lib/mods";
import { centerInScrollRow } from "@/lib/scroll-x";
import { RARITIES } from "@/lib/sneaker-nft";
import { bpsToPercent, conditionBand, conditionPercent, sneakerPower, TAB_CHALLENGE } from "@/lib/tab-challenge";
import SneakerArtwork from "@/components/SneakerArtwork";
import { veSneakerArtworkByDesign } from "@/lib/ve-sneakers";

function formatBps(bps: bigint) {
  return `${(Number(bps) / 100).toFixed(1)}%`;
}

function formatPoints(value: bigint) {
  const num = Number(formatEther(value));
  return num.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

export default function WorkshopDashboard({
  focusRequest,
}: {
  /** Set by the item gallery: opens the matching slot picker and scrolls to it. */
  focusRequest?: { slot: number; nonce: number } | null;
} = {}) {
  const wallet = usePolygonWallet();
  const workshop = useWorkshop();
  const game = useSneakerGame();
  const { addLocalActivity } = useSubgraphActivity(wallet.address);

  const [slotPicker, setSlotPicker] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [nowSeconds, setNowSeconds] = useState(0);

  useEffect(() => {
    const sync = () => setNowSeconds(Math.floor(Date.now() / 1000));
    const frame = window.requestAnimationFrame(sync);
    const interval = setInterval(sync, 30_000);
    return () => {
      window.cancelAnimationFrame(frame);
      clearInterval(interval);
    };
  }, []);

  // "Equip on a veSneaker" in the item gallery opens the slot picker here.
  useEffect(() => {
    if (!focusRequest) return;
    const frame = window.requestAnimationFrame(() => {
      setSlotPicker(focusRequest.slot);
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      document.getElementById("workshop-loadout")?.scrollIntoView({
        behavior: reduced ? "auto" : "smooth",
        block: "start",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusRequest]);

  // The loadout only applies to playable veSneakers. Memoized so the derived
  // `selected` stays referentially stable for the downstream memos.
  const sneakers = useMemo(
    () => workshop.owned.sneakers.filter((sneaker) => sneaker.kind === 0),
    [workshop.owned.sneakers],
  );
  const selectedId = workshop.selectedSneakerId ?? sneakers[0]?.tokenId ?? null;
  const selected = sneakers.find((s) => s.tokenId === selectedId) ?? null;
  const gameStats = game.sneakers.find((s) => s.tokenId === selectedId) ?? null;
  const bonuses = workshop.bonuses;
  const skinOverride = bonuses && bonuses.skinOverride !== 255 ? bonuses.skinOverride : null;
  const boostActive =
    bonuses != null && bonuses.boostExpiresAt > 0 && nowSeconds > 0 && bonuses.boostExpiresAt > nowSeconds;

  /// Live tab-challenge ceiling: condition and equipped mods feed the power
  /// score, so this panel is where a player raises their daily boost cap.
  const equippedModCount = useMemo(
    () => Array.from(workshop.equippedMap.values()).filter((id) => id !== 0n).length,
    [workshop.equippedMap],
  );
  const tabPower = useMemo(() => {
    if (!selected) return null;
    return sneakerPower({
      rarity: Number(selected.rarity),
      conditionBps: bonuses?.conditionBps ?? 10_000,
      equippedMods: equippedModCount,
    });
  }, [bonuses?.conditionBps, equippedModCount, selected]);

  const modsBySlot = useMemo(() => {
    const map = new Map<number, OwnedMod[]>();
    const equippedIds = new Set(Array.from(workshop.equippedMap.values()).map((v) => v.toString()));
    for (const mod of workshop.ownedMods.mods) {
      if (mod.traits.consumable) continue; // consumables burn via useAbility, never equip
      if (equippedIds.has(mod.tokenId.toString())) continue;
      const list = map.get(mod.traits.slot) ?? [];
      list.push(mod);
      map.set(mod.traits.slot, list);
    }
    return map;
  }, [workshop.equippedMap, workshop.ownedMods.mods]);

  const consumables = useMemo(
    () => workshop.ownedMods.mods.filter((m) => m.traits.consumable),
    [workshop.ownedMods.mods],
  );

  const modTraitsById = useMemo(() => {
    const map = new Map<string, OwnedMod["traits"]>();
    for (const mod of workshop.ownedMods.mods) map.set(mod.tokenId.toString(), mod.traits);
    return map;
  }, [workshop.ownedMods.mods]);

  async function runAction(action: () => Promise<`0x${string}`>, label: string) {
    setActionError(null);
    setActionNotice(null);
    try {
      const hash = await action();
      addLocalActivity(label, hash);
      setActionNotice(`${label} confirmed on-chain.`);
      await Promise.all([workshop.refresh(), game.refresh()]);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : `${label} failed.`);
    }
  }

  const notConfigured = !workshop.configured;

  return (
    <div className="flex flex-col gap-8">
      {/* Status bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-foreground/10 bg-surface px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="relative flex size-3">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-mint opacity-75" />
            <span className="relative inline-flex size-3 rounded-full bg-mint" />
          </div>
          <div>
            <span className="font-pixel text-[9px] text-mint">WORKSHOP</span>
            <p className="text-xs font-semibold text-foreground/80">
              Equip mods · service · repair
            </p>
          </div>
        </div>
        <span className="rounded-full border border-foreground/10 bg-background px-3 py-1 text-xs font-semibold text-foreground/60">
          {NETWORK_LABEL}
        </span>
      </div>

      {notConfigured ? (
        <div className="rounded-3xl border border-dashed border-foreground/15 bg-surface p-10 text-center">
          <h3 className="text-lg font-bold">Workshop not deployed yet</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-foreground/60">
            The SneakerWorkshop contract address is not configured for this network. Once the v1.0
            contracts go live on Amoy, this page lets you equip mods across all seven workshop slots.
          </p>
        </div>
      ) : null}

      {/* Sneaker selector */}
      <div className="rounded-2xl border border-foreground/10 bg-surface p-6 sm:p-8">
        <span className="font-pixel text-[9px] text-sky">1 · PICK A SNEAKER</span>
        {sneakers.length > 0 ? (
          <div className="scroll-x -mx-6 mt-4 flex gap-3 px-6 pb-1">
            {sneakers.map((sneaker) => {
              const isSelected = sneaker.tokenId === selectedId;
              const skinArtwork = skinOverride != null && isSelected
                ? veSneakerArtworkByDesign(skinOverride, true)
                : null;
              const rarity = RARITIES[Number(sneaker.tier) % RARITIES.length];
              return (
                <button
                  key={sneaker.tokenId.toString()}
                  type="button"
                  onClick={(event) => {
                    workshop.setSelectedSneakerId(sneaker.tokenId);
                    centerInScrollRow(event.currentTarget);
                  }}
                  className={`flex w-32 shrink-0 cursor-pointer flex-col items-center gap-2 rounded-3xl border p-4 transition-all active:scale-95 ${
                    isSelected
                      ? "border-mint/50 bg-mint/10 shadow-md shadow-mint/10"
                      : "border-foreground/10 bg-background hover:border-foreground/25"
                  }`}
                >
                  <SneakerArtwork
                    src={skinArtwork?.imageSrc ?? sneaker.artwork.src}
                    alt={skinArtwork ? `${skinArtwork.name} virtual sneaker artwork` : sneaker.artwork.alt}
                    className="w-16"
                    sizes="64px"
                  />
                  <span className="text-xs font-bold">#{sneaker.tokenId.toString()}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${rarity?.accent ?? "bg-foreground/10"}`}>
                    {rarity?.label ?? "Sneaker"}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="mt-4 rounded-2xl border border-dashed border-foreground/15 bg-background p-6 text-center text-sm text-foreground/60">
            {!wallet.address
              ? "Connect your wallet to see your veSneakers."
              : "No veSneakers in this wallet. Mint one or buy one from the collection."}
          </p>
        )}
      </div>

      {selected ? (
        <div id="workshop-loadout" className="grid scroll-mt-28 gap-8 lg:grid-cols-[1.4fr_1fr]">
          {/* Slots grid */}
          <div className="rounded-2xl border border-foreground/10 bg-surface p-6 sm:p-8">
            <span className="font-pixel text-[9px] text-mint">2 · UPGRADE SLOTS</span>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {SLOTS.map((slot) => {
                const equippedId = workshop.equippedMap.get(slot.id.toString()) ?? 0n;
                const traits = equippedId > 0n ? modTraitsById.get(equippedId.toString()) : null;
                const candidates = modsBySlot.get(slot.id) ?? [];
                return (
                  <div
                    key={slot.id}
                    className={`flex flex-col rounded-3xl border p-5 ${
                      equippedId > 0n ? "border-mint/30 bg-mint/5" : "border-foreground/10 bg-background"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-sm font-bold">
                        <span aria-hidden="true">{slot.icon}</span> {slot.label}
                      </span>
                      <span className={`font-pixel text-[8px] ${equippedId > 0n ? "text-mint" : "text-foreground/35"}`}>
                        {equippedId > 0n ? "EQUIPPED" : "EMPTY"}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-foreground/50">{slot.effect}</p>

                    {equippedId > 0n ? (
                      <div className="mt-3 flex flex-col gap-2">
                        <span className="rounded-xl bg-surface px-3 py-2 text-xs font-semibold">
                          Mod #{equippedId.toString()}
                          {traits ? ` · ${modEffectLabel(traits)}` : ""}
                        </span>
                        <button
                          type="button"
                          disabled={workshop.isLoading}
                          onClick={() =>
                            void runAction(
                              () => workshop.unequip(selected.tokenId, slot.id),
                              `Mod #${equippedId} unequipped`,
                            )
                          }
                          className="min-h-11 cursor-pointer rounded-full border border-foreground/15 text-xs font-bold text-foreground/70 transition-colors hover:border-foreground/40 disabled:opacity-50"
                        >
                          Unequip
                        </button>
                      </div>
                    ) : (
                      <div className="mt-3 flex flex-col gap-2">
                        {slotPicker === slot.id ? (
                          candidates.length > 0 ? (
                            <div className="flex flex-col gap-2">
                              {candidates.map((mod) => (
                                <button
                                  key={mod.tokenId.toString()}
                                  type="button"
                                  disabled={workshop.isLoading}
                                  onClick={() => {
                                    setSlotPicker(null);
                                    void runAction(
                                      () => workshop.equip(selected.tokenId, mod.tokenId),
                                      `Mod #${mod.tokenId} equipped on sneaker #${selected.tokenId}`,
                                    );
                                  }}
                                  className="cursor-pointer rounded-xl border border-mint/30 bg-mint/10 px-3 py-2 text-left text-xs font-semibold transition-colors hover:bg-mint/20 disabled:opacity-50"
                                >
                                  #{mod.tokenId.toString()} · {modEffectLabel(mod.traits)}
                                </button>
                              ))}
                              <button
                                type="button"
                                onClick={() => setSlotPicker(null)}
                                className="text-left text-[11px] text-foreground/45 underline"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <p className="text-[11px] text-foreground/50">
                              No {slot.label.toLowerCase()} mods in your wallet. Earn badges or buy mods in the marketplace.
                            </p>
                          )
                        ) : (
                          <button
                            type="button"
                            disabled={workshop.isLoading}
                            onClick={() => setSlotPicker(slot.id)}
                            className="min-h-11 cursor-pointer rounded-full bg-foreground px-3 text-xs font-bold text-background transition-transform active:scale-[0.98] disabled:opacity-50"
                          >
                            Equip mod
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Effective stats + care + consumables */}
          <div className="flex flex-col gap-6">
            {/* Vitals: Power / Health / Energy */}
            <div className="rounded-2xl border border-foreground/10 bg-surface p-6 sm:p-8">
              <span className="font-pixel text-[9px] text-magma">VITALS</span>
              <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                <div className="rounded-2xl bg-background p-3">
                  <p className="font-pixel text-[8px] text-sky">EARN POWER</p>
                  <p className="mt-1 text-sm font-bold">
                    {gameStats ? formatPoints(gameStats.power) : "—"}
                  </p>
                  <p className="text-[10px] text-foreground/45">veRUNE/day</p>
                </div>
                <div className="rounded-2xl bg-background p-3">
                  <p className="font-pixel text-[8px] text-mint">HEALTH</p>
                  <p className="mt-1 text-sm font-bold">
                    {gameStats ? `${gameStats.health}` : "—"}
                  </p>
                  <p className="text-[10px] text-foreground/45">
                    {gameStats && gameStats.health === 0 ? "worn out" : "days left"}
                  </p>
                </div>
                <div className="rounded-2xl bg-background p-3">
                  <p className="font-pixel text-[8px] text-magma">ENERGY</p>
                  <p className="mt-1 text-sm font-bold">
                    {gameStats ? `${gameStats.energy}/${gameStats.maxEnergy}` : "—"}
                  </p>
                  <p className="text-[10px] text-foreground/45">charges</p>
                </div>
              </div>
              {gameStats && gameStats.health === 0 ? (
                <p className="mt-3 rounded-xl border border-magma/30 bg-magma/10 px-3 py-2 text-[11px] font-semibold text-magma">
                  This veSneaker is worn out — it stopped mining. Burn a repair kit or repair it with
                  veRUNE to bring it back.
                </p>
              ) : (
                <p className="mt-3 text-[11px] leading-relaxed text-foreground/45">
                  Health decays 1/day. Energy refills on every manual activation and fuels consumable
                  abilities.
                </p>
              )}
              {boostActive ? (
                <p className="mt-3 rounded-xl border border-sky/30 bg-sky/10 px-3 py-2 text-[11px] font-semibold text-sky">
                  Boost capsule active · +{(bonuses.tempBoostBps / 100).toFixed(1)}% earn until{" "}
                  {new Date(bonuses.boostExpiresAt * 1000).toLocaleTimeString()}
                </p>
              ) : null}
            </div>

            <div className="rounded-2xl border border-foreground/10 bg-surface p-6 sm:p-8">
              <span className="font-pixel text-[9px] text-sky">EFFECTIVE STATS</span>
              <dl className="mt-4 flex flex-col gap-3 text-sm">
                {[
                  ["Earn rate bonus", bonuses ? `+${formatBps(bonuses.earnBonusBps)}` : "—"],
                  ["Wear reduction", bonuses ? `-${formatBps(bonuses.wearReductionBps)}` : "—"],
                  ["Repair discount", bonuses ? `-${formatBps(bonuses.repairDiscountBps)}` : "—"],
                  ["Appraisal bonus", bonuses ? `+${formatBps(bonuses.appraisalBonusBps)}` : "—"],
                  ["Staking boost", bonuses ? `+${formatBps(bonuses.stakingBoostBps)}` : "—"],
                  ["Skill bonus", bonuses ? `+${formatBps(bonuses.skillBonusBps)}` : "—"],
                  ["Condition", `${conditionPercent(bonuses?.conditionBps ?? 10_000)}%`],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between border-b border-foreground/5 pb-2">
                    <dt className="text-foreground/60">{label}</dt>
                    <dd className="font-mono font-bold">{value}</dd>
                  </div>
                ))}
                <div className="flex items-center justify-between">
                  <dt className="text-foreground/60">Auto-activation</dt>
                  <dd className={`font-pixel text-[9px] ${bonuses?.autoActive ? "text-mint" : "text-foreground/40"}`}>
                    {bonuses?.autoActive ? "ON" : "OFF"}
                  </dd>
                </div>
              </dl>

              {/* Tab challenge ceiling — the reason to service and equip */}
              <div className="mt-5 rounded-2xl border border-brand/20 bg-brand/8 p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-pixel text-[9px] tracking-[0.18em] text-brand">
                    TAB BOOST CEILING
                  </span>
                  <span className="font-mono text-lg font-bold text-brand">
                    +{bpsToPercent(tabPower?.ceilingBps ?? TAB_CHALLENGE.minBoostBps)}
                  </span>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-foreground/10">
                  <span
                    className="block h-full rounded-full bg-linear-to-r from-mint via-brand to-astra transition-[width] duration-700 ease-out"
                    style={{ width: `${tabPower?.score ?? 0}%` }}
                  />
                </div>
                <p className="mt-2.5 text-[11px] leading-relaxed text-foreground/55">
                  Power {tabPower?.score ?? 0}/{TAB_CHALLENGE.maxPowerScore} · rarity{" "}
                  {tabPower?.effectiveRarity ?? 0} + {equippedModCount} mods ×{" "}
                  {TAB_CHALLENGE.modPowerEach}. Service this pair or equip more mods to raise the
                  ceiling on your daily tab session.
                </p>
              </div>

              {/* Care: the pair wears on a 365-day season, items restore it. */}
              <div className="mt-6 rounded-2xl border border-foreground/10 bg-background p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-mono text-[10px] tracking-[0.16em] text-foreground/45 uppercase">
                    Condition
                  </span>
                  <span className={`font-mono text-sm font-bold ${conditionBand(bonuses?.conditionBps ?? 10_000).tone}`}>
                    {conditionBand(bonuses?.conditionBps ?? 10_000).label} ·{" "}
                    {conditionPercent(bonuses?.conditionBps ?? 10_000)}%
                  </span>
                </div>
                <div
                  className="mt-2 h-2 overflow-hidden rounded-full bg-foreground/10"
                  role="meter"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={conditionPercent(bonuses?.conditionBps ?? 10_000)}
                  aria-label="veSneaker condition"
                >
                  <span
                    className={`block h-full rounded-full transition-[width] duration-700 ease-out ${conditionBand(bonuses?.conditionBps ?? 10_000).bar}`}
                    style={{ width: `${Math.max(3, conditionPercent(bonuses?.conditionBps ?? 10_000))}%` }}
                  />
                </div>
                <p className="mt-2.5 text-[11px] leading-relaxed text-foreground/55">
                  A pair wears from 100% to 50% over a 365-day season. Wear scales its rarity, so
                  the earn rate, the appraisal, and the tab power score all drop with it. Burn a
                  repair kit to restore it — mods are permanent, the sneaker is what wears.
                </p>
              </div>
            </div>

            {/* Consumable ability NFTs */}
            <div className="rounded-2xl border border-foreground/10 bg-surface p-6 sm:p-8">
              <span className="font-pixel text-[9px] text-magma">CONSUMABLES</span>
              {consumables.length > 0 ? (
                <div className="mt-4 flex flex-col gap-2">
                  {consumables.map((mod) => {
                    const kind = mod.traits.aux === NO_AUX ? 0 : mod.traits.aux;
                    const energyCost = kind === 1 || kind === 3 ? 2 : kind === 2 ? 1 : 0;
                    const lacksEnergy = gameStats != null && gameStats.energy < energyCost;
                    return (
                      <button
                        key={mod.tokenId.toString()}
                        type="button"
                        disabled={workshop.isLoading || lacksEnergy}
                        onClick={() =>
                          void runAction(
                            () => workshop.useAbility(selected.tokenId, mod.tokenId),
                            `Consumable #${mod.tokenId} burned on sneaker #${selected.tokenId}`,
                          )
                        }
                        className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-magma/30 bg-magma/10 px-4 py-3 text-left text-xs font-bold text-magma transition-colors hover:bg-magma/20 disabled:opacity-50"
                      >
                        <span>
                          #{mod.tokenId.toString()} · {modEffectLabel(mod.traits)}
                        </span>
                        <span className="shrink-0">
                          {energyCost > 0 ? `${energyCost}⚡` : "free"} · burn
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-4 text-xs leading-relaxed text-foreground/55">
                  No consumables in your wallet. Consumable mod NFTs burn on use — repair kits
                  restore health, surge triggers instant activation, boost capsules raise earn rate
                  for 24h, and service kits restore a worn pair to pristine.
                </p>
              )}
              {consumables.length > 0 && gameStats && gameStats.energy === 0 ? (
                <p className="mt-3 text-[11px] text-foreground/45">
                  No energy left — activate the sneaker from the Game page to refill charges.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {actionNotice ? (
        <p className="rounded-2xl border border-mint/30 bg-mint/10 px-4 py-3 text-sm font-semibold text-mint">{actionNotice}</p>
      ) : null}
      {actionError || workshop.error ? (
        <p className="rounded-2xl border border-magma/30 bg-magma/10 px-4 py-3 text-sm font-semibold text-magma">
          {actionError ?? workshop.error}
        </p>
      ) : null}
    </div>
  );
}
