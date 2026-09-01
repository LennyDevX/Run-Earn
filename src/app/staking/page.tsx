import type { Metadata } from "next";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import StakingVaultDashboard from "@/components/StakingVaultDashboard";

export const metadata: Metadata = {
  title: "Staking — RUN&EARN",
  description: "Deposit POL, earn passive POL rewards, and boost APY by locking SneakerMint NFTs.",
};

export default function StakingPage() {
  return (
    <div className="flex flex-1 flex-col">
      <Navbar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 pb-24">
        <section className="flex flex-col gap-4 py-16">
          <span className="animate-fade-up font-pixel text-[10px] text-mint">STAKING ENGINE</span>
          <h1 className="animate-fade-up max-w-3xl text-4xl font-bold tracking-tight text-balance md:text-5xl" style={{ animationDelay: "120ms" }}>
            Stake POL and boost your APY with sneakers
          </h1>
          <p className="animate-fade-up max-w-2xl leading-relaxed text-foreground/60" style={{ animationDelay: "240ms" }}>
            Deposit native POL, track your earnings, and lock your SneakerMint NFTs to activate on-chain rarity boosts. Your principal and rewards are accounted for separately.
          </p>
        </section>
        <StakingVaultDashboard />
      </main>
      <Footer />
    </div>
  );
}
