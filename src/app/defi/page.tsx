import type { Metadata } from "next";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import PolygonTransferCard from "@/components/PolygonTransferCard";
import StakingVaultDashboard from "@/components/StakingVaultDashboard";

export const metadata: Metadata = {
  title: "DeFi — RUN&EARN",
  description:
    "NFT sneaker staking, rarity-based yield, and REN rewards on Polygon.",
};

type Tier = {
  name: string;
  apy: string;
  boost: string;
  accent: string;
  bar: string;
  width: string;
};

const TIERS = [
  {
    name: "Common",
    apy: "3.30%",
    boost: "+0.5% APY",
    accent: "text-foreground/60",
    bar: "bg-foreground/20",
    width: "w-1/4",
  },
  {
    name: "Rare",
    apy: "3.60%",
    boost: "+0.8% APY",
    accent: "text-sky",
    bar: "bg-sky",
    width: "w-2/5",
  },
  {
    name: "Epic",
    apy: "4.30%",
    boost: "+1.5% APY",
    accent: "text-magma",
    bar: "bg-magma",
    width: "w-3/5",
  },
  {
    name: "Mythic",
    apy: "4.60%",
    boost: "+1.8% APY",
    accent: "text-mint",
    bar: "bg-mint",
    width: "w-4/5",
  },
] as const satisfies readonly Tier[];

type Step = { title: string; description: string };

const STEPS = [
  {
    title: "Connect your wallet",
    description:
      "MetaMask or another Polygon-compatible EVM wallet. Your NFTs are detected instantly.",
  },
  {
    title: "Lock your pairs",
    description:
      "Deposit native POL, then lock your sneakers into the vault to increase your APY.",
  },
  {
    title: "Accumulate REN",
    description:
      "Earn passive POL rewards from a funded reserve, with a hard APY cap for sustainability.",
  },
] as const satisfies readonly Step[];

export default function DefiPage() {
  return (
    <div className="flex flex-1 flex-col overflow-x-clip">
      <Navbar />

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 pb-24">
        {/* Header */}
        <section className="flex flex-col gap-4 py-12 md:py-16">
          <span className="animate-fade-up font-pixel text-[10px] text-mint">
            DEFI ENGINE
          </span>
          <h1
            className="animate-fade-up max-w-2xl text-4xl font-bold tracking-tight text-balance md:text-5xl"
            style={{ animationDelay: "120ms" }}
          >
            Sneaker staking, yield by rarity
          </h1>
          <p
            className="animate-fade-up max-w-lg leading-relaxed text-foreground/60"
            style={{ animationDelay: "240ms" }}
          >
            Deposit POL in the Polygon vault and earn passive POL rewards.
            Locking SneakerMint NFTs increases your APY by rarity and tier.
          </p>
        </section>

        {/* Tiers */}
        <section className="mb-16 grid gap-6 md:mb-24 md:grid-cols-2">
          <div className="flex flex-col gap-5 rounded-3xl border border-foreground/8 bg-surface p-6 sm:p-8">
            <h2 className="text-xl font-bold tracking-tight">
              Tier multipliers
            </h2>
            {TIERS.map((tier) => (
              <div key={tier.name} className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-sm">
                  <span className={`font-semibold ${tier.accent}`}>
                    {tier.name}
                  </span>
                  <span className="font-mono text-foreground/60">
                    {tier.apy} APY · {tier.boost}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-foreground/8">
                  <div
                    className={`h-full rounded-full ${tier.bar} ${tier.width} transition-all duration-700`}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-6 rounded-3xl bg-linear-to-br from-ink to-ink-soft p-6 text-paper ring-1 ring-transparent sm:p-8 dark:ring-paper/10">
            <span className="font-pixel text-[9px] text-mint">
              HOW IT WORKS
            </span>
            {STEPS.map((step, i) => (
              <div key={step.title} className="flex gap-4">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-paper/10 font-pixel text-[9px] text-mint">
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-semibold">{step.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-paper/60">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <StakingVaultDashboard />

        <div className="mt-10">
          <PolygonTransferCard />
        </div>

        {/* CTA vault */}
        <section className="mt-10 flex flex-col items-center gap-6 rounded-[2.5rem] border border-foreground/8 bg-surface px-8 py-16 text-center">
          <h2 className="max-w-xl text-3xl font-bold tracking-tight text-balance">
            The vault opens with the genesis collection
          </h2>
          <p className="max-w-md text-sm leading-relaxed text-foreground/60">
            Connect your wallet for early access and a welcome boost on your
            first staking deposit.
          </p>
          <span className="rounded-full bg-mint/15 px-5 py-2.5 text-sm font-semibold text-mint">
            Polygon mainnet · claims available after contract deployment
          </span>
        </section>
      </main>

      <Footer />
    </div>
  );
}
