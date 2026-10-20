import type { Metadata } from "next";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import TreasuryDashboard from "@/components/TreasuryDashboard";

export const metadata: Metadata = {
  title: "Treasury — Airen",
  description:
    "Where Airen's revenue comes from, where it lands, and what is still owed to the treasury.",
};

export default function TreasuryPage() {
  return (
    <div className="min-h-dvh bg-background">
      <Navbar />
      <main className="mx-auto w-full max-w-5xl px-4 pb-24 pt-28 sm:px-6 sm:pt-32">
        <header className="mb-10 flex flex-col gap-3">
          <span className="font-pixel text-[10px] text-foreground/40">PUBLIC LEDGER</span>
          <h1 className="font-display text-4xl leading-tight sm:text-5xl">
            The treasury, <span className="text-mint">open</span>.
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-foreground/60">
            Every number on this page is read from Polygon or from the contracts at the moment you load it — nothing is
            copied into the app at build time, so it cannot drift from what the chain says. It is here so the
            protocol&apos;s finances can be checked without trusting anyone&apos;s summary.
          </p>
        </header>

        <TreasuryDashboard />

        <section className="mt-10 flex flex-col gap-4 rounded-3xl border border-foreground/8 bg-surface p-6 sm:p-8">
          <h2 className="font-pixel text-[10px] text-foreground/40">HOW TO READ THIS</h2>
          <div className="flex flex-col gap-3 text-xs leading-relaxed text-foreground/60">
            <p>
              <span className="font-semibold text-foreground/80">The balance is not the whole picture.</span> Two revenue
              paths take more than one step to complete, and the money is real at every step. That is what the
              &ldquo;earned but not received&rdquo; figures are for.
            </p>
            <p>
              <span className="font-semibold text-foreground/80">Marketplace fees take two steps.</span> A sale accrues
              2.5% inside the marketplace. An admin transaction forwards it to the fee splitter. A permissionless
              transaction then distributes it. Until the first of those runs, the treasury balance stays at zero while
              the fees sit in the marketplace.
            </p>
            <p>
              <span className="font-semibold text-foreground/80">The split is verifiable, not asserted.</span> The
              recipients and their weights are read from the FeeSplitter contract, so a change to them shows up here
              immediately.
            </p>
            <p>
              <span className="font-semibold text-foreground/80">The treasury is a plain wallet.</span> One key controls
              it today. That is stated rather than hidden: it is the most important thing to improve, and a multisig is
              the usual answer.
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
