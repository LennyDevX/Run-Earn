import type { Metadata } from "next";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import SneakerGameDashboard from "@/components/SneakerGameDashboard";

export const metadata: Metadata = {
  title: "Sneaker Game — RUN&EARN",
  description: "Activate your sneaker NFTs every 24 hours, build daily streaks, manage health and energy, and earn virtual veRUNE points redeemable for REN.",
};

export default function GamePage() {
  return (
    <div className="flex flex-1 flex-col">
      <Navbar />

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 pb-24">
        {/* Header Hero Section */}
        <section className="flex flex-col gap-5 py-12 md:py-16">
          <div className="flex flex-wrap items-center gap-3">
            <span className="animate-fade-up rounded-full border border-mint/20 bg-mint/10 px-3.5 py-1.5 font-pixel text-[10px] text-mint">
              SNEAKER GAME
            </span>
            <span className="animate-fade-up rounded-full border border-polygon-purple/20 bg-polygon-purple/10 px-3.5 py-1.5 font-pixel text-[10px] text-polygon-purple" style={{ animationDelay: "60ms" }}>
              VE RUNE POINTS
            </span>
          </div>

          <h1
            className="animate-fade-up max-w-3xl text-4xl font-extrabold tracking-tight text-balance md:text-5xl lg:text-6xl"
            style={{ animationDelay: "120ms" }}
          >
            Keep your sneakers moving, earn every day
          </h1>

          <p
            className="animate-fade-up max-w-2xl text-base leading-relaxed text-foreground/65 md:text-lg"
            style={{ animationDelay: "240ms" }}
          >
            Every veSneaker mines veRUNE at a power rate set by its rarity — but its health decays day by day. Activate every 24 hours to refill energy, build streaks for up to +50% bonus rate, and repair or burn consumable mod NFTs before the health bar hits zero. Redeem your points for real REN once the reward pool opens.
          </p>
        </section>

        <SneakerGameDashboard />
      </main>

      <Footer />
    </div>
  );
}
