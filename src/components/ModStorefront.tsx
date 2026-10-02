"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatEther, getAddress, isAddress, zeroAddress, type Address } from "viem";
import { usePolygonWallet } from "@/components/Providers";
import { modStoreAbi, sneakerVaultAbi } from "@/lib/contracts";
import { useModEconomy } from "@/hooks/useModEconomy";
import { usePlayerProgress } from "@/hooks/usePlayerProgress";
import { useSubgraphActivity } from "@/hooks/useSubgraphActivity";
import { modEffectLabel, slotInfo } from "@/lib/mods";
import { RARITIES } from "@/lib/sneaker-nft";

const modStoreAddressEnv = process.env.NEXT_PUBLIC_MOD_STORE_ADDRESS;

type ModDesign = {
  index: bigint;
  name: string;
  slot: number;
  tier: number;
  effectBps: number;
  consumable: boolean;
  price: bigint;
  quotedPrice: bigint;
  maxSupply: number;
  minted: number;
  requiredLevel: number;
  requiredPerkPlusOne: bigint;
  perkEligible: boolean | null;
  active: boolean;
};

function formatPol(value: bigint, maxDigits = 4) {
  const num = Number(formatEther(value));
  return num.toLocaleString("en-US", { maximumFractionDigits: maxDigits, minimumFractionDigits: 2 });
}

/// Premium mod primary sale — reads the ModStore catalog on-chain and mints on demand.
export default function ModStorefront() {
  const wallet = usePolygonWallet();
  const economy = useModEconomy();
  const { quoteMod } = economy;
  const progress = usePlayerProgress({ owner: wallet.address ?? null, publicClient: wallet.publicClient });
  const playerLevel = progress.snapshot?.level ?? 0;
  const { addLocalActivity } = useSubgraphActivity(wallet.address);
  const [designs, setDesigns] = useState<ModDesign[]>([]);
  const [isReading, setIsReading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const storeAddress = useMemo<Address | null>(
    () => (modStoreAddressEnv && isAddress(modStoreAddressEnv) ? getAddress(modStoreAddressEnv) : null),
    [],
  );

  const refresh = useCallback(async () => {
    if (!storeAddress || !wallet.publicClient) {
      setDesigns([]);
      return;
    }
    setIsReading(true);
    try {
      const [count, vaultAddress] = await Promise.all([
        wallet.publicClient.readContract({ address: storeAddress, abi: modStoreAbi, functionName: "designCount" }),
        wallet.publicClient.readContract({ address: storeAddress, abi: modStoreAbi, functionName: "vault" }),
      ]);
      const rows = await Promise.all(
        Array.from({ length: Number(count) }, async (_, i) => {
          const [raw, requiredPerkPlusOne] = await Promise.all([
            wallet.publicClient.readContract({
              address: storeAddress,
              abi: modStoreAbi,
              functionName: "designs",
              args: [BigInt(i)],
            }).catch(() => null),
            wallet.publicClient.readContract({
              address: storeAddress,
              abi: modStoreAbi,
              functionName: "requiredPerkPlusOne",
              args: [BigInt(i)],
            }),
          ]);
          if (!raw) return null;
          const [name, , slot, , tier, effectBps, , consumable, price, maxSupply, minted, requiredLevel, active] =
            raw as readonly [string, string, number, number, number, number, number, boolean, bigint, number, number, number, boolean];
          const perkEligible = requiredPerkPlusOne === 0n
            ? true
            : !wallet.address
              ? null
              : vaultAddress.toLowerCase() === zeroAddress
                ? false
                : await wallet.publicClient.readContract({
                    address: vaultAddress,
                    abi: sneakerVaultAbi,
                    functionName: "isEligible",
                    args: [wallet.address, requiredPerkPlusOne - 1n],
                  });
          let quotedPrice = price;
          if (wallet.address && (requiredPerkPlusOne === 0n || perkEligible)) {
            try {
              quotedPrice = await quoteMod(BigInt(i));
            } catch {
              quotedPrice = price;
            }
          }
          return {
            index: BigInt(i),
            name,
            slot: Number(slot),
            tier: Number(tier),
            effectBps: Number(effectBps),
            consumable: Boolean(consumable),
            price,
            quotedPrice,
            maxSupply: Number(maxSupply),
            minted: Number(minted),
            requiredLevel: Number(requiredLevel),
            requiredPerkPlusOne,
            perkEligible,
            active: Boolean(active),
          };
        }),
      );
      setDesigns(rows.filter((design): design is ModDesign => design !== null));
    } catch {
      setDesigns([]);
    } finally {
      setIsReading(false);
    }
  }, [quoteMod, storeAddress, wallet.address, wallet.publicClient]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void refresh());
    return () => window.cancelAnimationFrame(frame);
  }, [refresh]);

  function handleBuy(design: ModDesign) {
    setNotice(null);
    setError(null);
    if (!storeAddress) {
      setNotice("Interactive Demo Mode: ModStore contract pending deployment on this network.");
      return;
    }
    void (async () => {
      try {
        const hash = await economy.buyMod(design.index);
        addLocalActivity(`Bought mod ${design.name}`, hash);
        setNotice(`${design.name} minted to your wallet.`);
        await refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Purchase failed.");
      }
    })();
  }

  return (
    <section className="flex flex-col gap-6">
      <div>
        <span className="font-pixel text-[10px] text-mint">PREMIUM MODS</span>
        <h2 className="mt-2 text-2xl font-bold tracking-tight">Upgrade your sneakers</h2>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-foreground/60">
          Equipable mod NFTs minted on demand — wear reduction, durability, repair discounts, auto-activation, staking boosts, and repair kits. Equip them in the Workshop.
        </p>
      </div>

      {designs.length > 0 ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {designs.map((design, index) => {
            const slot = slotInfo(design.slot);
            const rarityObj = RARITIES[design.tier % RARITIES.length];
            const soldOut = design.maxSupply > 0 && design.minted >= design.maxSupply;
            const levelLocked =
              design.requiredLevel > 0 && (!progress.configured || playerLevel < design.requiredLevel);
            const perkLocked = design.requiredPerkPlusOne > 0n && wallet.address !== null && design.perkEligible !== true;
            const traits = {
              slot: design.slot,
              rarity: 0,
              tier: design.tier,
              effectBps: design.effectBps,
              aux: 255,
              consumable: design.consumable,
              proofHash: "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`,
            };
            return (
              <article
                key={design.index.toString()}
                className="group animate-fade-up flex flex-col justify-between gap-4 rounded-3xl border border-foreground/8 bg-surface p-6 transition-[transform,box-shadow] duration-500 hover:-translate-y-2 hover:shadow-xl hover:shadow-foreground/8"
                style={{ animationDelay: `${index * 90}ms` }}
              >
                <div>
                  <div className="relative flex items-center justify-center overflow-hidden rounded-2xl bg-background py-10 text-5xl">
                    {slot.icon}
                    <span className={`absolute top-3 right-3 rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-wider uppercase ${rarityObj?.accent ?? ""}`}>
                      {rarityObj?.label ?? "Mod"}
                    </span>
                    {design.consumable ? (
                      <span className="absolute top-3 left-3 rounded-full bg-magma/10 px-2.5 py-1 font-pixel text-[9px] text-magma">
                        CONSUMABLE
                      </span>
                    ) : null}
                    {design.requiredLevel > 0 ? (
                      <span className={`absolute bottom-3 left-3 rounded-full px-2.5 py-1 font-pixel text-[9px] ${levelLocked ? "bg-magma/10 text-magma" : "bg-mint/10 text-mint"}`}>
                        LV {design.requiredLevel}+
                      </span>
                    ) : null}
                    {design.requiredPerkPlusOne > 0n ? (
                      <span className={`absolute right-3 bottom-3 rounded-full px-2.5 py-1 font-pixel text-[9px] ${perkLocked ? "bg-magma/10 text-magma" : "bg-brand/10 text-brand"}`}>
                        PERK {String(design.requiredPerkPlusOne - 1n)}
                      </span>
                    ) : null}
                  </div>
                  <h3 className="mt-4 font-bold tracking-tight">{design.name}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-foreground/50">{modEffectLabel(traits)}</p>
                  {design.maxSupply > 0 ? (
                    <p className="mt-2 font-pixel text-[9px] text-foreground/40">
                      {design.minted} / {design.maxSupply} MINTED
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  disabled={isReading || economy.isLoading || !design.active || soldOut || levelLocked || perkLocked}
                  onClick={() => handleBuy(design)}
                  className="min-h-11 w-full cursor-pointer rounded-full bg-mint px-4 text-sm font-bold text-ink shadow-md shadow-mint/10 transition-transform active:scale-[0.98] hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {soldOut
                    ? "Sold out"
                    : levelLocked
                      ? `Requires level ${design.requiredLevel}`
                      : perkLocked
                        ? "Access perk required"
                        : design.requiredPerkPlusOne > 0n && !wallet.address
                          ? "Connect to check access"
                          : `Buy · ${formatPol(design.quotedPrice)} POL`}
                </button>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-foreground/15 bg-surface px-8 py-12 text-center">
          <p className="text-sm text-foreground/60">
            {isReading
              ? "Loading the mod catalog..."
              : "No premium mod designs published yet. The ModStore catalog is configured on-chain at deployment."}
          </p>
        </div>
      )}

      {notice ? <p className="rounded-2xl bg-mint/15 px-4 py-3 text-xs font-semibold text-mint">{notice}</p> : null}
      {error ? <p className="rounded-2xl bg-magma/15 px-4 py-3 text-xs font-semibold text-magma">{error}</p> : null}
    </section>
  );
}
