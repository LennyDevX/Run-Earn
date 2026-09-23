import type { Metadata } from "next";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import ProfileDashboard from "@/components/ProfileDashboard";

export const metadata: Metadata = {
  title: "Profile — RUN&EARN",
  description: "Your runner identity: customizable username, avatar from uploads or minted NFTs, player level, and activity across the virtual sneaker economy.",
};

export default function ProfilePage() {
  return (
    <div className="flex flex-1 flex-col">
      <Navbar />

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 pb-24">
        <section className="flex flex-col gap-5 py-12 md:py-16">
          <div className="flex flex-wrap items-center gap-3">
            <span className="animate-fade-up rounded-full border border-mint/20 bg-mint/10 px-3.5 py-1.5 font-pixel text-[10px] text-mint">
              PROFILE
            </span>
            <span className="animate-fade-up rounded-full border border-polygon-purple/20 bg-polygon-purple/10 px-3.5 py-1.5 font-pixel text-[10px] text-polygon-purple" style={{ animationDelay: "60ms" }}>
              PLAYER PROGRESSION
            </span>
          </div>

          <h1
            className="animate-fade-up max-w-3xl text-4xl font-extrabold tracking-tight text-balance md:text-5xl lg:text-6xl"
            style={{ animationDelay: "120ms" }}
          >
            Your runner profile
          </h1>

          <p
            className="animate-fade-up max-w-2xl text-base leading-relaxed text-foreground/65 md:text-lg"
            style={{ animationDelay: "240ms" }}
          >
            Customize your name and avatar — from your device or straight from a veSneaker
            you minted. Every mint, trade, and workshop action builds your player level,
            unlocking skill NFTs you can equip and consume in the game.
          </p>
        </section>

        <ProfileDashboard />
      </main>

      <Footer />
    </div>
  );
}
