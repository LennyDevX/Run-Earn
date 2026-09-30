import type { Metadata } from "next";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import PlayerGameProfile from "@/components/PlayerGameProfile";
import SneakerGameDashboard from "@/components/SneakerGameDashboard";
import TabChallengePanel from "@/components/TabChallengePanel";

export const metadata: Metadata = {
  title: "Game — Airen",
  description:
    "Your Airen runner profile: collect veSneakers, equip mods, run the daily tab challenge for a staking APY boost, and mine veRUNE every 24 hours.",
};

export default function GamePage() {
  return (
    <div className="flex flex-1 flex-col overflow-x-clip">
      <Navbar />

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 pb-24">
        {/* Header */}
        <section className="flex flex-col gap-5 py-12 md:py-16">
          <div className="flex flex-wrap items-center gap-3">
            <span className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-mint/20 bg-mint/10 px-3.5 py-1.5 font-pixel text-[10px] tracking-[0.18em] text-mint">
              <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-mint" />
              RUNNER TERMINAL
            </span>
            <span
              className="animate-fade-up rounded-full border border-brand/25 bg-brand/8 px-3.5 py-1.5 font-pixel text-[10px] tracking-[0.18em] text-brand"
              style={{ animationDelay: "60ms" }}
            >
              DAILY TAB CHALLENGE
            </span>
          </div>

          <h1
            className="animate-fade-up max-w-3xl text-4xl font-extrabold tracking-tight text-balance md:text-5xl lg:text-6xl"
            style={{ animationDelay: "120ms" }}
          >
            Your runner, your{" "}
            <span className="text-gradient text-gradient-wide">orbit</span>
          </h1>

          <p
            className="animate-fade-up max-w-2xl text-base leading-relaxed text-foreground/65 md:text-lg"
            style={{ animationDelay: "240ms" }}
          >
            Every veSneaker mines veRUNE at a power rate set by its rarity, and every day you get one
            tab session to raise your staking APY. Collect pairs, equip mods, keep them serviced, and hold the
            streak alive — and repair before the health bar hits zero.
          </p>
        </section>

        <div className="flex flex-col gap-14">
          <PlayerGameProfile />
          <TabChallengePanel />
          <SneakerGameDashboard />
        </div>
      </main>

      <Footer />
    </div>
  );
}
