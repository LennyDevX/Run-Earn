import type { Metadata } from "next";
import Footer from "@/components/Footer";
import MintShowcase from "@/components/MintShowcase";
import Navbar from "@/components/Navbar";
import SneakerMintStudio from "@/components/SneakerMintStudio";

export const metadata: Metadata = {
  title: "AI Mint — Airen",
  description:
    "Photograph your sneaker, let AI rebuild it as a unique retro-futuristic pixel-art collectible, and mint it on Polygon. One physical pair, one collectible, forever.",
};

export default function MintPage() {
  return (
    <div className="flex flex-1 flex-col overflow-x-clip">
      <Navbar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 pb-24">
        <section className="grid items-center gap-10 py-14 md:py-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-14">
          <div className="flex flex-col gap-5">
            <span className="animate-fade-up w-fit rounded-full border border-brand/25 bg-brand/8 px-3.5 py-1.5 font-pixel text-[10px] tracking-[0.18em] text-brand">
              YOUR SNEAKER → AI → NFT
            </span>
            <h1
              className="animate-fade-up max-w-2xl text-4xl font-bold tracking-tight text-balance md:text-5xl"
              style={{ animationDelay: "120ms" }}
            >
              Your sneaker, <span className="text-gradient">reimagined by AI</span> and minted on
              Polygon
            </h1>
            <p
              className="animate-fade-up max-w-xl leading-relaxed text-foreground/60"
              style={{ animationDelay: "240ms" }}
            >
              Upload a photo and the AI rebuilds your pair as a one-of-one retro-futuristic pixel-art
              collectible. It grades the rarity, writes the description, and picks a style no other
              collector has. One physical pair becomes one NFT — permanently.
            </p>

            <dl
              className="animate-fade-up grid gap-3 sm:grid-cols-3"
              style={{ animationDelay: "320ms" }}
            >
              {[
                { label: "Per pair", value: "1 NFT" },
                { label: "Style", value: "One-of-one" },
                { label: "Priced by", value: "Appraiser" },
              ].map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-foreground/10 bg-surface px-4 py-3">
                  <dt className="font-mono text-[10px] tracking-[0.14em] text-foreground/45 uppercase">
                    {stat.label}
                  </dt>
                  <dd className="mt-1 text-sm font-bold">{stat.value}</dd>
                </div>
              ))}
            </dl>

            <p
              className="animate-fade-up max-w-xl text-[11px] leading-relaxed text-foreground/45"
              style={{ animationDelay: "400ms" }}
            >
              Collectibles are digital art. They trade on the marketplace at a price the appraiser
              sets — they do not enter staking, the tab arena, or the workshop. Those are reserved for
              the official veSneaker collection.
            </p>
          </div>

          <MintShowcase className="animate-fade-up" />
        </section>

        <SneakerMintStudio />
      </main>
      <Footer />
    </div>
  );
}
