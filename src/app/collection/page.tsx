import type { Metadata } from "next";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import PixelSneaker from "@/components/PixelSneaker";

export const metadata: Metadata = {
  title: "Collection — RUN&EARN",
  description:
    "Explore the genesis collection of retro-futuristic NFT sneakers on Polygon.",
};

type Rarity = "Common" | "Rare" | "Epic" | "Mythic";

const RARITY_STYLES = {
  Common: "bg-foreground/10 text-foreground/60",
  Rare: "bg-sky/15 text-sky",
  Epic: "bg-magma/15 text-magma",
  Mythic: "bg-mint/15 text-mint",
} as const satisfies Record<Rarity, string>;

const SNEAKERS = [
  { id: "0001", name: "Neon Runner", rarity: "Mythic", palette: {}, design: 0 },
  { id: "0002", name: "Sky Drift", rarity: "Rare", palette: { M: "#38bdf8", S: "#3ddc97" }, design: 1 },
  { id: "0003", name: "Magma Rush", rarity: "Epic", palette: { S: "#ff4a2d", G: "#38bdf8" }, design: 2 },
  { id: "0004", name: "Mint Circuit", rarity: "Rare", palette: { M: "#3ddc97", S: "#ff4a2d" }, design: 3 },
  { id: "0005", name: "Ghost Protocol", rarity: "Common", palette: { S: "#d4d4d8", M: "#a1a1aa", G: "#d4d4d8" }, design: 2 },
  { id: "0006", name: "Sol Surge", rarity: "Mythic", palette: { S: "#9945ff", M: "#14f195", G: "#9945ff" }, design: 1 },
] as const satisfies readonly { id: string; name: string; rarity: Rarity; palette: Partial<Record<string, string>>; design: number }[];

export default function CollectionPage() {
  return (
    <div className="flex flex-1 flex-col">
      <Navbar />

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 pb-24">
        {/* Header */}
        <section className="flex flex-col gap-4 py-16">
          <span className="animate-fade-up font-pixel text-[10px] text-sky">
            THE COLLECTION
          </span>
          <h1
            className="animate-fade-up max-w-2xl text-4xl font-bold tracking-tight text-balance md:text-5xl"
            style={{ animationDelay: "120ms" }}
          >
            Genesis sneakers, one by one
          </h1>
          <p
            className="animate-fade-up max-w-lg leading-relaxed text-foreground/60"
            style={{ animationDelay: "240ms" }}
          >
            10,000 unique pairs on Polygon. Each one features generative traits,
            verifiable on-chain rarity, and tier-based DeFi benefits.
          </p>
        </section>

        {/* Filtros (placeholder) */}
        <div className="mb-10 flex flex-wrap gap-2">
          {["All", "Common", "Rare", "Epic", "Mythic"].map((filter, i) => (
            <button
              key={filter}
              type="button"
              className={`cursor-pointer rounded-full px-4 py-2 text-xs font-semibold transition-all duration-300 ${
                i === 0
                  ? "bg-foreground text-background"
                  : "border border-foreground/10 text-foreground/60 hover:border-foreground/30 hover:text-foreground"
              }`}
            >
              {filter}
            </button>
          ))}
        </div>

        {/* Grid */}
        <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {SNEAKERS.map((sneaker, i) => (
            <article
              key={sneaker.id}
              className="group animate-fade-up flex flex-col gap-4 rounded-3xl border border-foreground/8 bg-surface p-6 transition-all duration-500 hover:-translate-y-2 hover:shadow-xl hover:shadow-foreground/8"
              style={{ animationDelay: `${i * 90}ms` }}
            >
              <div className="relative overflow-hidden rounded-2xl bg-background p-6">
                <PixelSneaker
                  design={sneaker.design}
                  palette={sneaker.palette}
                  className="w-full transition-transform duration-500 group-hover:scale-105"
                />
                <span
                  className={`absolute top-3 right-3 rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-wider uppercase ${RARITY_STYLES[sneaker.rarity]}`}
                >
                  {sneaker.rarity}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold tracking-tight">{sneaker.name}</h3>
                  <span className="font-mono text-xs text-foreground/40">
                    #{sneaker.id}
                  </span>
                </div>
                <span className="rounded-full border border-foreground/10 px-3 py-1.5 font-mono text-xs text-foreground/60">
                  Coming soon
                </span>
              </div>
            </article>
          ))}
        </section>

        <p className="mt-16 text-center font-pixel text-[10px] text-foreground/40">
          MINT COMING SOON ON POLYGON
          <span className="animate-blink text-mint">_</span>
        </p>
      </main>

      <Footer />
    </div>
  );
}
