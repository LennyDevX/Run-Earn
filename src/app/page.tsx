import Link from "next/link";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import PolygonLogo from "@/components/PolygonLogo";
import SneakerCarousel from "@/components/SneakerCarousel";

const TRAITS = [
  "Retro-future",
  "On-chain",
  "Staking rewards",
  "Verifiable rarity",
  "Yield by tier",
  "Governance",
  "Pixel art",
  "Polygon",
  "Fees ~$0.002",
  "EVM",
] as const;

type Feature = {
  accent: string;
  title: string;
  description: string;
  tag: string;
};

const FEATURES = [
  {
    accent: "bg-sky",
    title: "Unique styles",
    description:
      "Each pair is a 1/1 piece generated with retro-futuristic traits. No one else will have your sneakers.",
    tag: "DESIGN",
  },
  {
    accent: "bg-magma",
    title: "DeFi benefits",
    description:
      "Stake your NFTs, earn yield based on rarity, and access exclusive community pools.",
    tag: "DEFI",
  },
  {
    accent: "bg-mint",
    title: "On-chain rarity",
    description:
      "Every trait and its provenance lives on the blockchain. Transparent, verifiable scarcity.",
    tag: "PROVENANCE",
  },
] as const satisfies readonly Feature[];

type PolygonFeature = {
  stat: string;
  title: string;
  description: string;
};

const POLYGON_FEATURES = [
  {
    stat: "~$0.002",
    title: "Low-cost fees",
    description:
      "Mint, trade, and stake your sneakers at low cost on Polygon Chain.",
  },
  {
    stat: "2–5s",
    title: "Fast finality",
    description:
      "Polygon Chain milestones finalize transactions in seconds without waiting for Ethereum checkpoints.",
  },
  {
    stat: "EVM",
    title: "Compatible ecosystem",
    description:
      "MetaMask, Rainbow, OpenSea, and Solidity/OpenZeppelin contracts work from day one.",
  },
] as const satisfies readonly PolygonFeature[];

type Stat = { value: string; label: string };

const DEFI_STATS = [
  { value: "12.4%", label: "Average staking APY" },
  { value: "10,000", label: "Pairs in the genesis collection" },
  { value: "5", label: "Rarity tiers with yield boost" },
] as const satisfies readonly Stat[];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col overflow-x-clip">
      <Navbar />

      {/* Hero */}
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6">
        <section className="grid flex-1 items-center gap-16 py-16 md:grid-cols-2 md:py-24">
          <div className="flex flex-col items-start gap-8">
            <span
              className="animate-fade-up rounded-full border border-foreground/10 bg-surface px-4 py-1.5 text-xs font-semibold tracking-widest text-foreground/70 uppercase"
              style={{ animationDelay: "0ms" }}
            >
              Genesis Collection · Polygon
            </span>
            <h1
              className="animate-fade-up text-5xl leading-[1.05] font-bold tracking-tight text-balance md:text-6xl"
              style={{ animationDelay: "120ms" }}
            >
              Walk.
              <br />
              <span className="text-sky">Collect.</span>
              <br />
              <span className="text-mint">Earn.</span>
            </h1>
            <p
              className="animate-fade-up max-w-md text-lg leading-relaxed text-foreground/60"
              style={{ animationDelay: "240ms" }}
            >
              NFT sneakers with retro-futuristic style and real utility: each
              pair lives on Polygon and unlocks staking, rarity-based yield,
              and a voice in ecosystem governance.
            </p>
            <div
              className="animate-fade-up flex flex-wrap items-center gap-4"
              style={{ animationDelay: "360ms" }}
            >
              <Link
                href="/collection"
                className="rounded-full bg-magma px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-magma/25 transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-magma/30"
              >
                Explore collection
              </Link>
              <Link
                href="/defi"
                className="rounded-full border border-foreground/15 px-7 py-3.5 text-sm font-semibold transition-all duration-300 hover:scale-105 hover:border-foreground/30 hover:bg-foreground/5"
              >
                How it works
              </Link>
            </div>
            <p
              className="animate-fade-up font-pixel text-[10px] text-foreground/40"
              style={{ animationDelay: "480ms" }}
            >
              PRESS START
              <span className="animate-blink text-magma">_</span>
            </p>
          </div>

          {/* Sneaker visual */}
          <div className="relative flex items-center justify-center">
            <div className="animate-glow absolute size-72 rounded-full bg-sky/25 blur-3xl" />
            <div
              className="animate-glow absolute size-56 translate-x-24 translate-y-16 rounded-full bg-mint/25 blur-3xl"
              style={{ animationDelay: "-3.5s" }}
            />
            <div
              className="animate-glow absolute size-40 -translate-x-28 -translate-y-20 rounded-full bg-magma/20 blur-3xl"
              style={{ animationDelay: "-1.8s" }}
            />
            <div className="animate-float relative">
              <SneakerCarousel className="w-full max-w-md drop-shadow-[0_24px_32px_rgba(10,10,12,0.18)]" />
            </div>
            <div className="animate-float-slow absolute top-8 right-6 rounded-full border border-foreground/10 bg-surface/80 px-4 py-2 font-pixel text-[9px] backdrop-blur-sm">
              #0001
            </div>
            <div
              className="animate-float-slow absolute bottom-10 left-2 rounded-full border border-foreground/10 bg-surface/80 px-4 py-2 font-pixel text-[9px] text-mint backdrop-blur-sm"
              style={{ animationDelay: "-4s" }}
            >
              MYTHIC
            </div>
          </div>
        </section>
      </main>

      {/* Marquee */}
      <div className="overflow-hidden bg-foreground py-4">
        <div className="animate-marquee flex w-max items-center gap-10">
          {[...TRAITS, ...TRAITS].map((trait, i) => (
            <span
              key={i}
              className="flex items-center gap-10 text-sm font-semibold tracking-widest whitespace-nowrap text-background/80 uppercase"
            >
              {trait}
              <span className="text-mint">✦</span>
            </span>
          ))}
        </div>
      </div>

      {/* Features */}
      <section className="mx-auto w-full max-w-6xl px-6 py-24">
        <div className="mb-14 flex flex-col gap-4">
          <span className="font-pixel text-[10px] text-magma">
            THE COLLECTION
          </span>
          <h2 className="max-w-xl text-4xl font-bold tracking-tight text-balance">
            More than a collectible, an asset
          </h2>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {FEATURES.map((feature) => (
            <article
              key={feature.title}
              className="group flex flex-col gap-5 rounded-3xl border border-foreground/8 bg-surface p-8 transition-all duration-500 hover:-translate-y-2 hover:shadow-xl hover:shadow-foreground/8"
            >
              <span
                className={`size-3 rounded-full ${feature.accent} transition-transform duration-500 group-hover:scale-150`}
              />
              <span className="font-pixel text-[9px] text-foreground/40">
                {feature.tag}
              </span>
              <h3 className="text-xl font-bold tracking-tight">
                {feature.title}
              </h3>
              <p className="text-sm leading-relaxed text-foreground/60">
                {feature.description}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* DeFi band */}
      <section className="mx-auto w-full max-w-6xl px-6 pb-24">
        <div className="rounded-[2.5rem] bg-linear-to-b from-ink to-ink-soft px-8 py-16 text-paper ring-1 ring-transparent md:px-16 dark:ring-paper/10">
          <div className="flex flex-col gap-4">
            <span className="font-pixel text-[10px] text-mint">
              MOTOR DEFI
            </span>
            <h2 className="max-w-xl text-4xl font-bold tracking-tight text-balance">
              Your sneakers work while you walk
            </h2>
            <p className="max-w-lg leading-relaxed text-paper/60">
              Lock your pairs in the vault, accumulate $RUNE based on rarity
              tier, and participate in protocol decisions.
            </p>
          </div>
          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            {DEFI_STATS.map((stat) => (
              <div
                key={stat.label}
                className="flex flex-col gap-2 rounded-3xl border border-paper/10 bg-paper/5 p-6 transition-colors duration-300 hover:border-mint/40"
              >
                <span className="text-3xl font-bold tracking-tight text-mint">
                  {stat.value}
                </span>
                <span className="text-sm text-paper/60">{stat.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Polygon */}
      <section className="mx-auto w-full max-w-6xl px-6 pb-24">
        <div className="flex flex-col items-center gap-6 text-center">
          <PolygonLogo className="animate-float-slow w-24" />
          <span className="font-pixel text-[10px] text-polygon-purple">
            POWERED BY POLYGON
          </span>
          <h2 className="max-w-2xl text-4xl font-bold tracking-tight text-balance">
            The EVM network that makes frictionless collecting possible
          </h2>
          <p className="max-w-xl leading-relaxed text-foreground/60">
            Polygon Chain combines low fees, fast finality, and EVM compatibility:
            mint with Solidity, use wallets like MetaMask, and access OpenSea liquidity.
          </p>
        </div>
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {POLYGON_FEATURES.map((feature) => (
            <article
              key={feature.title}
              className="flex flex-col gap-4 rounded-3xl border border-foreground/8 bg-surface p-8 text-center transition-all duration-500 hover:-translate-y-2 hover:shadow-xl hover:shadow-foreground/8"
            >
              <span className="bg-linear-to-r from-polygon-purple to-mint bg-clip-text text-3xl font-bold tracking-tight text-transparent">
                {feature.stat}
              </span>
              <h3 className="text-lg font-bold tracking-tight">
                {feature.title}
              </h3>
              <p className="text-sm leading-relaxed text-foreground/60">
                {feature.description}
              </p>
            </article>
          ))}
        </div>
      </section>

      <Footer />
    </div>
  );
}
