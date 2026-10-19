import type { Metadata } from "next";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import VeSneakerStorefront from "@/components/VeSneakerStorefront";
import ModStorefront from "@/components/ModStorefront";
import { trailsApiKey } from "@/lib/trails";

export const metadata: Metadata = {
  title: "Astra · Sol · Luna — Airen veSneakers",
  description:
    "Explore Astra, Sol, and Luna: three pixel-art sneaker families in Airen's virtual on-chain game."
};

export default function CollectionPage() {
  return (
    <div className="flex flex-1 flex-col">
      <Navbar />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-20 sm:px-6 sm:pb-24">
        {/* Header */}
        <section className="flex flex-col gap-4 py-10 sm:py-14">
          <span className="animate-fade-up font-pixel text-[10px] text-brand">
            THREE LINES · ONE UNIVERSE
          </span>
          <h1
            className="animate-fade-up max-w-3xl text-4xl font-bold tracking-tight text-balance md:text-5xl"
            style={{ animationDelay: "120ms" }}
          >
            Choose your <span className="text-gradient text-gradient-wide">orbit.</span>
          </h1>
          <p
            className="animate-fade-up max-w-2xl leading-relaxed text-foreground/60"
            style={{ animationDelay: "240ms" }}
          >
            Meet Astra, Sol, and Luna — the first three pixel-art families in the
            Airen sneaker universe. Each family keeps its own on-chain design index
            and purchase rules; collect one, then stake it, play, upgrade, and trade.
          </p>
        </section>

        <VeSneakerStorefront trailsApiKey={trailsApiKey()} />

        <div className="mt-12 sm:mt-16">
          <ModStorefront />
        </div>
      </main>

      <Footer />
    </div>
  );
}
