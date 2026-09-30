import type { Metadata } from "next";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import WorkshopWorkbench from "@/components/WorkshopWorkbench";

export const metadata: Metadata = {
  title: "Workshop — Airen",
  description:
    "Browse the mod NFT line with prices, buy the items, equip them across seven slots on your veSneakers, burn consumable abilities, and service worn pairs before their rarity decays.",
};

export default function WorkshopPage() {
  return (
    <div className="flex flex-1 flex-col overflow-x-clip">
      <Navbar />

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 pb-24">
        <section className="flex flex-col gap-5 py-12 md:py-16">
          <div className="flex flex-wrap items-center gap-3">
            <span className="animate-fade-up rounded-full border border-brand/20 bg-brand/10 px-3.5 py-1.5 font-pixel text-[10px] text-brand">
              WORKSHOP
            </span>
            <span
              className="animate-fade-up rounded-full border border-mint/20 bg-mint/10 px-3.5 py-1.5 font-pixel text-[10px] text-mint"
              style={{ animationDelay: "60ms" }}
            >
              MOD NFTS
            </span>
            <span
              className="animate-fade-up rounded-full border border-magma/20 bg-magma/10 px-3.5 py-1.5 font-pixel text-[10px] text-magma"
              style={{ animationDelay: "120ms" }}
            >
              CARE
            </span>
          </div>

          <h1
            className="animate-fade-up max-w-3xl text-4xl font-extrabold tracking-tight text-balance md:text-5xl lg:text-6xl"
            style={{ animationDelay: "180ms" }}
          >
            Upgrade your <span className="text-gradient text-gradient-wide">veSneakers</span>
          </h1>

          <p
            className="animate-fade-up max-w-2xl text-base leading-relaxed text-foreground/65 md:text-lg"
            style={{ animationDelay: "300ms" }}
          >
            Shop the mod line, then equip it. Each item is an NFT that drops into one of seven slots
            on a veSneaker — cut wear, raise the earn rate, restyle the pair, auto-activate daily,
            amplify staking APY, and run passive skills. Mods are permanent; the sneaker is what wears, so keeping it serviced is what holds your daily
            tab-challenge ceiling.
          </p>
        </section>

        <WorkshopWorkbench />
      </main>

      <Footer />
    </div>
  );
}
