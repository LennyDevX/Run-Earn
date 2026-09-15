import type { Metadata } from "next";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import VeSneakerStorefront from "@/components/VeSneakerStorefront";

export const metadata: Metadata = {
  title: "veSneakers — RUN&EARN",
  description:
    "Buy RUN&EARN veSneakers with POL — virtual sneakers that boost your POL staking APY, earn veRUNE points, and trade on the marketplace. No physical pair required.",
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
            veSneakers are the virtual version of the RUN&EARN sneakers. Buy them with
            POL whether or not you own a physical pair, then lock them in staking for a
            POL APY boost, activate them daily to earn veRUNE, and trade them on the
            marketplace. Each design is capped at 1,000 copies.
          </p>
        </section>

        <VeSneakerStorefront />
      </main>

      <Footer />
    </div>
  );
}
