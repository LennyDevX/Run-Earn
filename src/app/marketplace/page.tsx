import type { Metadata } from "next";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import MarketplaceDashboard from "@/components/MarketplaceDashboard";

export const metadata: Metadata = {
  title: "Marketplace — RUN&EARN",
  description: "Buy, sell, auction, and make POL offers on SneakerMint NFTs. On-chain appraiser valuations and value-improvement recommendations.",
};

export default function MarketplacePage() {
  return (
    <div className="flex flex-1 flex-col">
      <Navbar />

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 pb-24">
        {/* Header Hero Section */}
        <section className="flex flex-col gap-5 py-12 md:py-16">
          <div className="flex flex-wrap items-center gap-3">
            <span className="animate-fade-up rounded-full border border-sky/20 bg-sky/10 px-3.5 py-1.5 font-pixel text-[10px] text-sky">
              SNEAKER MARKETPLACE
            </span>
            <span className="animate-fade-up rounded-full border border-mint/20 bg-mint/10 px-3.5 py-1.5 font-pixel text-[10px] text-mint" style={{ animationDelay: "60ms" }}>
              NATIVE POL PAYMENTS
            </span>
          </div>

          <h1
            className="animate-fade-up max-w-3xl text-4xl font-extrabold tracking-tight text-balance md:text-5xl lg:text-6xl"
            style={{ animationDelay: "120ms" }}
          >
            Trade sneakers with on-chain valuations
          </h1>

          <p
            className="animate-fade-up max-w-2xl text-base leading-relaxed text-foreground/65 md:text-lg"
            style={{ animationDelay: "240ms" }}
          >
            List at a fixed price, run an English auction, or make escrowed POL offers on any published sneaker. The SneakerAppraiser contract suggests a fair price and shows how to grow your NFT&apos;s value over time.
          </p>
        </section>

        <MarketplaceDashboard />
      </main>

      <Footer />
    </div>
  );
}
