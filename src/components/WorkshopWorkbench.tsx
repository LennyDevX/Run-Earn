"use client";

import { useCallback, useState } from "react";
import ModItemGallery from "@/components/ModItemGallery";
import WorkshopDashboard from "@/components/WorkshopDashboard";

export type WorkshopFocusRequest = { slot: number; nonce: number };

/// Ties the item shop to the loadout: "Equip on a veSneaker" in the gallery
/// opens the matching slot picker in the workshop below and scrolls to it.
export default function WorkshopWorkbench() {
  const [focusRequest, setFocusRequest] = useState<WorkshopFocusRequest | null>(null);

  const handleEquip = useCallback((slot: number) => {
    setFocusRequest((current) => ({ slot, nonce: (current?.nonce ?? 0) + 1 }));
  }, []);

  return (
    <div className="flex flex-col gap-16">
      <ModItemGallery onEquip={handleEquip} />

      <section aria-labelledby="loadout-title" className="flex flex-col gap-6">
        <div>
          <span className="font-pixel text-[9px] tracking-[0.2em] text-foreground/45">LOADOUT</span>
          <h2 id="loadout-title" className="text-gradient mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
            Equip, service, and repair
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-foreground/60">
            Pick a veSneaker, drop an item into its slot, and burn consumables for instant effects. Every pair runs a 365-day season — wear scales its rarity, so servicing it is what keeps it earning.
            Every equip escrows the NFT in the workshop and returns the exact token when you
            unequip.
          </p>
        </div>
        <WorkshopDashboard focusRequest={focusRequest} />
      </section>
    </div>
  );
}
