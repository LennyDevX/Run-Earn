import type { Metadata } from "next";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import RoadmapTimeline from "@/components/RoadmapTimeline";
import { ROADMAP_PROGRESS } from "@/lib/roadmap";

export const metadata: Metadata = {
  title: "Roadmap — Airen",
  description:
    "The Airen roadmap: fifteen contracts, the AI mint studio, the upgrade economy, and the full web app are shipped — Polygon Amoy deployment, the benefits vault, and REN are next.",
};

export default function RoadmapPage() {
  const { shipped, total, phases } = ROADMAP_PROGRESS;

  return (
    <div className="flex flex-1 flex-col overflow-x-clip">
      <Navbar />

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 pb-24">
        {/* Header */}
        <section className="flex flex-col gap-5 py-12 md:py-16">
          <span className="animate-fade-up inline-flex w-fit items-center gap-2 rounded-full border border-brand/25 bg-brand/8 px-3 py-1.5 font-pixel text-[10px] tracking-[0.2em] text-brand">
            <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-brand" />
            THE ROADMAP
          </span>
          <h1
            className="animate-fade-up max-w-3xl text-4xl font-bold tracking-tight text-balance md:text-6xl"
            style={{ animationDelay: "120ms" }}
          >
            From genesis to the{" "}
            <span className="text-gradient text-gradient-wide">constellation</span>
          </h1>
          <p
            className="animate-fade-up max-w-xl leading-relaxed text-foreground/60"
            style={{ animationDelay: "240ms" }}
          >
            Four phases, one universe. Phase 01 built the entire product off-chain;
            phase 02 puts it on Polygon. {shipped} of {total} milestones across {phases}{" "}
            phases are already shipped.
          </p>
        </section>

        <RoadmapTimeline />

        <p className="mt-16 text-center font-pixel text-[10px] tracking-[0.2em] text-foreground/40">
          ROADMAP LIVES ON POLYGON
          <span className="animate-blink text-mint">_</span>
        </p>
      </main>

      <Footer />
    </div>
  );
}
