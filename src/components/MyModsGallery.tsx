"use client";

import { useMemo } from "react";
import { getAddress, isAddress, type Address } from "viem";
import Link from "next/link";
import { usePolygonWallet } from "@/components/Providers";
import { useOwnedMods } from "@/hooks/useOwnedMods";
import { modEffectLabel, slotInfo } from "@/lib/mods";
import { RARITIES } from "@/lib/sneaker-nft";

const modsAddressEnv = process.env.NEXT_PUBLIC_SNEAKER_MODS_ADDRESS;

export default function MyModsGallery() {
  const wallet = usePolygonWallet();
  const modsAddress = useMemo<Address | null>(
    () => (modsAddressEnv && isAddress(modsAddressEnv) ? getAddress(modsAddressEnv) : null),
    [],
  );
  const { mods, isLoading } = useOwnedMods({
    owner: wallet.address,
    contractAddress: modsAddress,
    publicClient: wallet.publicClient,
  });

  if (!wallet.isConnected || !modsAddress) return null;

  return (
    <section className="flex flex-col gap-6">
      <div>
        <span className="font-pixel text-[10px] text-mint">MODS &amp; BADGES</span>
        <h2 className="mt-2 text-2xl font-bold tracking-tight">Your upgrade NFTs</h2>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-foreground/60">
          Equipable mods and achievement badges. Manage them in the Workshop, or sell, rent, and trade them on the marketplace.
        </p>
      </div>

      {mods.length > 0 ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {mods.map((mod, index) => {
            const slot = slotInfo(mod.traits.slot);
            const rarityObj = RARITIES[Number(mod.traits.tier) % RARITIES.length];
            return (
              <article
                key={mod.tokenId.toString()}
                className="group animate-fade-up flex flex-col gap-4 rounded-3xl border border-foreground/8 bg-surface p-6 transition-all duration-500 hover:-translate-y-2 hover:shadow-xl hover:shadow-foreground/8"
                style={{ animationDelay: `${index * 90}ms` }}
              >
                <div className="relative flex items-center justify-center overflow-hidden rounded-2xl bg-background py-10 text-5xl">
                  {slot.icon}
                  <span className={`absolute top-3 right-3 rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-wider uppercase ${rarityObj?.accent ?? ""}`}>
                    {rarityObj?.label ?? "Mod"}
                  </span>
                  {mod.traits.consumable ? (
                    <span className="absolute top-3 left-3 rounded-full bg-magma/10 px-2.5 py-1 font-pixel text-[9px] text-magma">
                      CONSUMABLE
                    </span>
                  ) : null}
                </div>
                <div>
                  <h3 className="font-bold tracking-tight">
                    {mod.traits.consumable ? "Consumable" : `${slot.label} Mod`} #{mod.tokenId.toString()}
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-foreground/50">{modEffectLabel(mod.traits)}</p>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-pixel text-[9px] text-foreground/40">{slot.label.toUpperCase()} SLOT</span>
                  <Link href="/workshop" className="font-semibold text-sky hover:underline">
                    Equip →
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 rounded-3xl border border-dashed border-foreground/15 bg-surface px-8 py-12 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-mint/10 font-pixel text-mint">✦</div>
          <h3 className="text-lg font-bold">No mods yet</h3>
          <p className="max-w-md text-xs leading-relaxed text-foreground/60">
            {isLoading
              ? "Loading your mod collection..."
              : "Claim achievement badges or buy premium mods to start upgrading your sneakers."}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href="/badges" className="rounded-full border border-mint/30 bg-mint/10 px-5 py-2.5 text-xs font-bold text-mint transition-colors hover:bg-mint/20">
              Claim badges
            </Link>
            <Link href="/collection" className="rounded-full border border-foreground/15 px-5 py-2.5 text-xs font-bold text-foreground/70 transition-colors hover:border-foreground/30">
              Browse mods
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
