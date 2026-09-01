import type { Metadata } from "next";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = {
  title: "Roadmap — RUN&EARN",
  description:
    "The RUN&EARN roadmap: from contract foundation and AI-generated NFTs in Q3 2026 to the beta launch, online store, and benefits vault in Q4 2026.",
};

type Status = "done" | "active" | "next" | "planned";

type Milestone = {
  month: string;
  title: string;
  description: string;
  status: Status;
};

type Quarter = {
  id: string;
  label: string;
  range: string;
  accent: string;
  highlight: string;
  summary: string;
  milestones: Milestone[];
};

const STATUS_STYLES: Record<Status, string> = {
  done: "bg-mint/15 text-mint",
  active: "bg-sky/15 text-sky",
  next: "bg-magma/15 text-magma",
  planned: "bg-foreground/10 text-foreground/50",
};

const STATUS_LABEL: Record<Status, string> = {
  done: "Done",
  active: "In progress",
  next: "Next up",
  planned: "Planned",
};

const QUARTERS = [
  {
    id: "q3-2026",
    label: "Q3 2026",
    range: "Jul — Sep 2026",
    accent: "text-sky",
    highlight: "bg-sky/10",
    summary:
      "Project foundation. We lay the contract base for mint and staking, ship the AI engine that generates unique NFT artwork, and stand up the basic web sections.",
    milestones: [
      {
        month: "Jul",
        title: "Project kickoff",
        description:
          "RUN&EARN is founded. Brand, tokenomics direction, and the Polygon-first tech stack are defined.",
        status: "done",
      },
      {
        month: "Aug",
        title: "Contract foundation",
        description:
          "ERC-721 SneakerMint and ERC-20 RUNEToken are drafted on Hardhat + OpenZeppelin, with mint and staking interfaces sketched out.",
        status: "active",
      },
      {
        month: "Aug",
        title: "AI-generated NFT artwork",
        description:
          "The Gemini-powered agent turns a photo of a physical sneaker into a unique retro-futuristic collectible, ready to mint on Polygon.",
        status: "active",
      },
      {
        month: "Sep",
        title: "Basic web sections",
        description:
          "Home, Collection, Mint, DeFi, and My NFTs go live with wallet connection, POL transfers, and the mint studio.",
        status: "next",
      },
    ],
  },
  {
    id: "q4-2026",
    label: "Q4 2026",
    range: "Oct — Dec 2026",
    accent: "text-mint",
    highlight: "bg-mint/10",
    summary:
      "Beta launch. The online store opens so the first sneakers can be bought, staking ships its first version, and the benefits vault contract is developed.",
    milestones: [
      {
        month: "Oct",
        title: "Beta launch",
        description:
          "Public beta of RUN&EARN. The mint studio, collection, and wallet flows are open to early users on Polygon Amoy and mainnet.",
        status: "next",
      },
      {
        month: "Oct",
        title: "Online store ready",
        description:
          "The online store goes live to buy the first sneakers, bridging physical product and on-chain NFT provenance.",
        status: "next",
      },
      {
        month: "Nov",
        title: "Staking v1",
        description:
          "Staking service improvements land and the first version of $RUNE staking is released, with tier-based yield and epoch rewards.",
        status: "planned",
      },
      {
        month: "Dec",
        title: "Benefits vault contract",
        description:
          "A dedicated vault contract lets users lock their NFTs for extra benefits: discounts, special offers, and gifts. The vault becomes a benefits boveda for everyone who wants to participate.",
        status: "planned",
      },
    ],
  },
] as const satisfies readonly Quarter[];

export default function RoadmapPage() {
  return (
    <div className="flex flex-1 flex-col">
      <Navbar />

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 pb-24">
        {/* Header */}
        <section className="flex flex-col gap-4 py-16">
          <span className="animate-fade-up font-pixel text-[10px] text-magma">
            THE ROADMAP
          </span>
          <h1
            className="animate-fade-up max-w-2xl text-4xl font-bold tracking-tight text-balance md:text-5xl"
            style={{ animationDelay: "120ms" }}
          >
            From contract foundation to the benefits vault
          </h1>
          <p
            className="animate-fade-up max-w-lg leading-relaxed text-foreground/60"
            style={{ animationDelay: "240ms" }}
          >
            A quarter-by-quarter view of where RUN&EARN is today and where it is
            heading on Polygon. We are currently in Q3 2026.
          </p>
        </section>

        {/* Legend */}
        <div className="mb-10 flex flex-wrap gap-2">
          {(Object.keys(STATUS_LABEL) as Status[]).map((status) => (
            <span
              key={status}
              className={`rounded-full px-4 py-2 text-xs font-semibold ${STATUS_STYLES[status]}`}
            >
              {STATUS_LABEL[status]}
            </span>
          ))}
        </div>

        {/* Quarters grid */}
        <div className="grid gap-6 lg:grid-cols-2">
          {QUARTERS.map((quarter, qIndex) => (
            <section
              key={quarter.id}
              className="animate-fade-up flex flex-col gap-6 rounded-[2.5rem] border border-foreground/8 bg-surface p-8"
              style={{ animationDelay: `${qIndex * 120}ms` }}
            >
              <div className={`flex flex-col gap-3 rounded-3xl ${quarter.highlight} p-6`}>
                <div className="flex items-center justify-between">
                  <span className={`font-pixel text-[10px] ${quarter.accent}`}>
                    {quarter.label}
                  </span>
                  <span className="font-mono text-xs text-foreground/50">
                    {quarter.range}
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-foreground/70">
                  {quarter.summary}
                </p>
              </div>

              {/* Calendar grid */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {quarter.milestones.map((milestone) => (
                  <article
                    key={`${quarter.id}-${milestone.month}-${milestone.title}`}
                    className="group flex flex-col gap-3 rounded-3xl border border-foreground/8 bg-background p-5 transition-all duration-300 hover:-translate-y-1 hover:border-foreground/20 hover:shadow-lg hover:shadow-foreground/5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="flex size-9 items-center justify-center rounded-2xl bg-foreground/5 font-pixel text-[9px] text-foreground/70">
                        {milestone.month}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-wider uppercase ${STATUS_STYLES[milestone.status]}`}
                      >
                        {STATUS_LABEL[milestone.status]}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold tracking-tight">
                      {milestone.title}
                    </h3>
                    <p className="text-xs leading-relaxed text-foreground/55">
                      {milestone.description}
                    </p>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>

        <p className="mt-16 text-center font-pixel text-[10px] text-foreground/40">
          ROADMAP LIVES ON POLYGON
          <span className="animate-blink text-mint">_</span>
        </p>
      </main>

      <Footer />
    </div>
  );
}
