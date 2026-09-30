import Link from "next/link";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import PolygonLogo from "@/components/PolygonLogo";
import SneakerCarousel from "@/components/SneakerCarousel";
import TabChallengeSection from "@/components/TabChallengeSection";

const TRAITS = [
  "Astra",
  "Sol",
  "Luna",
  "Pixel art",
  "Virtual sneaker game",
  "Level up",
  "Equip skills",
  "On-chain",
  "Polygon",
  "Play to earn",
] as const;

type Feature = {
  accent: string;
  title: string;
  description: string;
  tag: string;
};

const FEATURES = [
  {
    accent: "bg-astra",
    title: "Three cosmic lines",
    description:
      "Start with Astra, Sol, and Luna — distinct pixel-art families designed for a shared virtual sneaker universe.",
    tag: "COLLECTIONS",
  },
  {
    accent: "bg-sol",
    title: "Play to progress",
    description:
      "Activate veSneakers, build streaks, upgrade equipment, and unlock level-gated skill NFTs.",
    tag: "GAMEPLAY",
  },
  {
    accent: "bg-luna",
    title: "On-chain ownership",
    description:
      "Your virtual sneakers remain ERC-721 assets with verifiable ownership, rarity, and trading history.",
    tag: "POLYGON",
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
  { value: "2.80%", label: "Base staking APY on POL" },
  { value: "4", label: "Rarity tiers with yield boost" },
  { value: "03", label: "Signature sneaker families" },
] as const satisfies readonly Stat[];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col overflow-x-clip">
      <Navbar />

      {/* Hero */}
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 sm:px-6">
        <section className="grid flex-1 items-center gap-10 py-12 sm:py-16 md:grid-cols-2 md:gap-16 md:py-24">
          <div className="flex flex-col items-start gap-6 sm:gap-8">
            <span
              className="animate-fade-up rounded-full border border-foreground/10 bg-surface px-4 py-1.5 text-xs font-semibold tracking-widest text-foreground/70 uppercase"
              style={{ animationDelay: "0ms" }}
            >
              Astra · Sol · Luna / Genesis Series
            </span>
            <h1
              className="animate-fade-up text-4xl leading-[1.05] font-bold tracking-tight text-balance sm:text-5xl md:text-6xl"
              style={{ animationDelay: "120ms" }}
            >
              Choose your
              <br />
              <span className="text-gradient text-gradient-wide">orbit.</span>
              <br />
              <span className="text-luna">Run. Earn.</span>
            </h1>
            <p
              className="animate-fade-up max-w-md text-base leading-relaxed text-foreground/60 sm:text-lg"
              style={{ animationDelay: "240ms" }}
            >
              A virtual sneaker universe in pixel art. Collect Astra, Sol, or Luna;
              level up your player, upgrade your veSneakers, and put each pair to
              work in the game economy.
            </p>
            <div
              className="animate-fade-up flex w-full flex-wrap items-center gap-3 sm:w-auto sm:gap-4"
              style={{ animationDelay: "360ms" }}
            >
              <Link
                href="/collection"
                className="flex min-h-12 flex-1 items-center justify-center rounded-full bg-brand px-7 text-sm font-bold text-paper dark:text-ink shadow-lg shadow-brand/25 transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-brand/30 sm:flex-none sm:py-3.5"
              >
                Explore collection
              </Link>
              <Link
                href="/defi"
                className="flex min-h-12 flex-1 items-center justify-center rounded-full border border-brand/30 px-7 text-sm font-semibold transition-all duration-300 hover:scale-105 hover:border-brand/60 hover:bg-brand/5 sm:flex-none sm:py-3.5"
              >
                How it works
              </Link>
            </div>
            <p
              className="animate-fade-up font-pixel text-[10px] text-foreground/40"
              style={{ animationDelay: "480ms" }}
            >
              PRESS START
              <span className="animate-blink text-brand">_</span>
            </p>
          </div>

          {/* Sneaker visual */}
          <div className="relative flex items-center justify-center">
            <div className="animate-glow absolute size-52 rounded-full bg-brand/20 blur-3xl sm:size-72" />
            <div
              className="animate-glow absolute size-44 translate-x-16 translate-y-12 rounded-full bg-sol/25 blur-3xl sm:size-56 sm:translate-x-24 sm:translate-y-16"
              style={{ animationDelay: "-3.5s" }}
            />
            <div
              className="animate-glow absolute size-32 -translate-x-20 -translate-y-14 rounded-full bg-luna/25 blur-3xl sm:size-40 sm:-translate-x-28 sm:-translate-y-20"
              style={{ animationDelay: "-1.8s" }}
            />
            <div className="animate-float relative">
              <SneakerCarousel className="w-full max-w-md drop-shadow-[0_24px_32px_rgba(10,10,12,0.18)]" />
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
      <section className="mx-auto w-full max-w-6xl px-6 py-16 md:py-24">
        <div className="mb-10 flex flex-col gap-4 md:mb-14">
          <span className="font-pixel text-[10px] text-brand">
            THE COLLECTION
          </span>
          <h2 className="text-gradient max-w-xl text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            Built for your next run.
          </h2>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {FEATURES.map((feature) => (
            <article
              key={feature.title}
              className="group flex flex-col gap-5 rounded-3xl border border-foreground/8 bg-surface p-6 transition-all duration-500 hover:-translate-y-2 hover:shadow-xl hover:shadow-foreground/8 sm:p-8"
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

      <TabChallengeSection />

      {/* DeFi band */}
      <section className="mx-auto w-full max-w-6xl px-6 pb-16 md:pb-24">
        <div className="rounded-2xl border border-foreground/8 bg-surface px-6 py-12 sm:px-8 sm:py-16 md:px-16 dark:bg-linear-to-b dark:from-ink dark:to-ink-soft dark:text-paper dark:ring-paper/10">
          <div className="flex flex-col gap-4">
            <span className="font-pixel text-[10px] text-brand">
              MOTOR DEFI
            </span>
            <h2 className="text-gradient max-w-xl text-3xl font-bold tracking-tight text-balance sm:text-4xl">
              Your sneakers work while you walk
            </h2>
            <p className="max-w-lg leading-relaxed text-foreground/60 dark:text-paper/60">
              Lock your pairs in the vault, accumulate REN based on rarity
              tier, and participate in protocol decisions.
            </p>
          </div>
          <div className="mt-10 grid gap-6 sm:grid-cols-3 md:mt-12 md:gap-8">
            {DEFI_STATS.map((stat) => (
              <div
                key={stat.label}
                className="flex flex-col gap-2 rounded-2xl border border-foreground/10 bg-background p-6 transition-colors duration-300 hover:border-brand/40 dark:border-paper/10 dark:bg-paper/5 dark:hover:border-mint/40"
              >
                <span className="text-gradient text-3xl font-bold tracking-tight">
                  {stat.value}
                </span>
                <span className="text-sm text-foreground/60 dark:text-paper/60">{stat.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Polygon */}
      <section className="mx-auto w-full max-w-6xl px-6 pb-16 md:pb-24">
        <div className="flex flex-col items-center gap-6 text-center">
          <PolygonLogo className="animate-float-slow w-20 sm:w-24" />
          <span className="font-pixel text-[10px] text-brand dark:text-polygon-purple">
            POWERED BY POLYGON
          </span>
          <h2 className="text-gradient max-w-2xl text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            The EVM network that makes frictionless collecting possible
          </h2>
          <p className="max-w-xl leading-relaxed text-foreground/60">
            Polygon Chain combines low fees, fast finality, and EVM compatibility:
            mint with Solidity, use wallets like MetaMask, and access OpenSea liquidity.
          </p>
        </div>
        <div className="mt-10 grid gap-6 md:mt-14 md:grid-cols-3">
          {POLYGON_FEATURES.map((feature) => (
            <article
              key={feature.title}
              className="flex flex-col gap-4 rounded-3xl border border-foreground/8 bg-surface p-6 text-center transition-all duration-500 hover:-translate-y-2 hover:shadow-xl hover:shadow-foreground/8 sm:p-8"
            >
              <span className="text-gradient text-3xl font-bold tracking-tight">
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
