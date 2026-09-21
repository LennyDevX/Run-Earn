import type { Metadata } from "next";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import SneakerMintStudio from "@/components/SneakerMintStudio";

export const metadata: Metadata = {
  title: "AI Mint — RUN&EARN",
  description:
    "Photograph your sneaker, let AI create unique virtual artwork, and mint it as a playable NFT on Polygon.",
};

export default function MintPage() {
  return (
    <div className="flex flex-1 flex-col">
      <Navbar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 pb-24">
        <section className="flex flex-col gap-4 py-16">
          <span className="font-pixel text-[10px] text-sky">YOUR SNEAKER → AI → NFT</span>
          <h1 className="max-w-3xl text-4xl font-bold tracking-tight text-balance md:text-5xl">
            Your sneaker, reimagined by AI and minted on Polygon
          </h1>
          <p className="max-w-2xl leading-relaxed text-foreground/60">
            Upload a photo of your sneaker, let the AI agent create a unique virtual collectible,
            customize it with a name, rarity, and palette, and mint it as a playable veSneaker NFT —
            upgradeable in the workshop and tradable in the marketplace.
          </p>
        </section>
        <SneakerMintStudio />
      </main>
      <Footer />
    </div>
  );
}
