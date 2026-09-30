import type { Metadata } from "next";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import BadgesDashboard from "@/components/BadgesDashboard";

export const metadata: Metadata = {
  title: "Badges — Airen",
  description: "Claim achievement badges minted as NFT mods — streaks, lifetime veRUNE, collection size, and POL staked all unlock equipable badges.",
};

export default function BadgesPage() {
  return (
    <div className="flex flex-1 flex-col">
      <Navbar />

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 pb-24">
        <section className="flex flex-col gap-5 py-12 md:py-16">
          <div className="flex flex-wrap items-center gap-3">
            <span className="animate-fade-up rounded-full border border-polygon-purple/20 bg-polygon-purple/10 px-3.5 py-1.5 font-pixel text-[10px] text-polygon-purple">
              BADGES
            </span>
            <span className="animate-fade-up rounded-full border border-mint/20 bg-mint/10 px-3.5 py-1.5 font-pixel text-[10px] text-mint" style={{ animationDelay: "60ms" }}>
              ON-CHAIN ACHIEVEMENTS
            </span>
          </div>

          <h1
            className="animate-fade-up max-w-3xl text-4xl font-extrabold tracking-tight text-balance md:text-5xl lg:text-6xl"
            style={{ animationDelay: "120ms" }}
          >
            Achievements <span className="text-gradient">you can wear</span>
          </h1>

          <p
            className="animate-fade-up max-w-2xl text-base leading-relaxed text-foreground/65 md:text-lg"
            style={{ animationDelay: "240ms" }}
          >
            Every milestone — daily streaks, lifetime veRUNE, collection size, POL staked — is
            verified on-chain and mints a badge NFT you can equip in the workshop, trade, sell,
            auction, or rent out.
          </p>
        </section>

        <BadgesDashboard />
      </main>

      <Footer />
    </div>
  );
}
