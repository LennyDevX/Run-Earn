import type { Metadata } from "next";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import MyNftsGallery from "@/components/MyNftsGallery";
import MyModsGallery from "@/components/MyModsGallery";

export const metadata: Metadata = {
  title: "My NFTs — RUN&EARN",
  description: "Your personal collection of sneakers minted on Polygon.",
};

export default function MyNftsPage() {
  return (
    <div className="flex flex-1 flex-col">
      <Navbar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 pb-24">
        <section className="flex flex-col gap-4 py-16">
          <span className="font-pixel text-[10px] text-mint">MY COLLECTION</span>
          <h1 className="max-w-3xl text-4xl font-bold tracking-tight text-balance md:text-5xl">
            Your minted sneakers
          </h1>
          <p className="max-w-2xl leading-relaxed text-foreground/60">
            Every virtual sneaker NFT you have created with the AI studio.
          </p>
        </section>
        <MyNftsGallery />
        <div className="mt-16">
          <MyModsGallery />
        </div>
      </main>
      <Footer />
    </div>
  );
}
