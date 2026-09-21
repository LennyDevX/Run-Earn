import type { Metadata } from "next";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import VeSneakerStorefront from "@/components/VeSneakerStorefront";
import ModStorefront from "@/components/ModStorefront";

export const metadata: Metadata = {
  title: "veSneakers — RUN&EARN",
  description:
    "Buy RUN&EARN veSneakers with POL — virtual sneakers that boost your POL staking APY, earn veRUNE points, equip mods, and trade on the marketplace.",
};

export default function CollectionPage() {
  return (
    <div className="flex flex-1 flex-col">
      <Navbar />

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 pb-24">
        {/* Header */}
        <section className="flex flex-col gap-4 py-16">
          <span className="animate-fade-up font-pixel text-[10px] text-sky">
            VE SNEAKERS · VIRTUAL COLLECTION
          </span>
          <h1
            className="animate-fade-up max-w-3xl text-4xl font-bold tracking-tight text-balance md:text-5xl"
            style={{ animationDelay: "120ms" }}
          >
            Buy virtual sneakers with POL, put them to work
          </h1>
          <p
            className="animate-fade-up max-w-2xl leading-relaxed text-foreground/60"
            style={{ animationDelay: "240ms" }}
          >
            veSneakers are the playable NFTs of the RUN&EARN virtual sneaker economy.
            Buy them with POL, lock them in staking for a POL APY boost, activate them
            daily to earn veRUNE, equip mod NFTs in the workshop, and trade them on the
            marketplace. Each design is capped at 1,000 copies.
          </p>
        </section>

        <VeSneakerStorefront />

        <div className="mt-16">
          <ModStorefront />
        </div>
      </main>

      <Footer />
    </div>
  );
}
