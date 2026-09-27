import type { Metadata } from "next";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import StakingVaultDashboard from "@/components/StakingVaultDashboard";

export const metadata: Metadata = {
  title: "Staking Dashboard — Airen",
  description: "Deposit POL, track accumulated rewards, earn sustainable yield, and boost APY up to 8.00% by locking SneakerMint NFTs.",
};

export default function StakingPage() {
  return (
    <div className="flex flex-1 flex-col">
      <Navbar />

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 pb-24">
        {/* Header Hero Section */}
        <section className="flex flex-col gap-5 py-12 md:py-16">
          <div className="flex flex-wrap items-center gap-3">
            <span className="animate-fade-up rounded-full border border-mint/20 bg-mint/10 px-3.5 py-1.5 font-pixel text-[10px] text-mint">
              STAKING ENGINE V2
            </span>
            <span className="animate-fade-up rounded-full border border-brand/20 bg-brand/10 px-3.5 py-1.5 font-pixel text-[10px] text-brand" style={{ animationDelay: "60ms" }}>
              30-DAY LOCK CYCLE
            </span>
          </div>

          <h1
            className="animate-fade-up max-w-3xl text-4xl font-extrabold tracking-tight text-balance md:text-5xl lg:text-6xl"
            style={{ animationDelay: "120ms" }}
          >
            Sustainable POL yield, amplified by sneaker NFTs
          </h1>

          <p
            className="animate-fade-up max-w-2xl text-base leading-relaxed text-foreground/65 md:text-lg"
            style={{ animationDelay: "240ms" }}
          >
            Stake native POL to earn a sustainable 2.80% base APY. Lock your AI-generated SneakerMint NFTs into the non-custodial vault to boost your returns up to 8.00% APY. Rewards are liquid and claimable at any time.
          </p>
        </section>

        {/* Staking Dashboard Terminal */}
        <StakingVaultDashboard />
      </main>

      <Footer />
    </div>
  );
}
