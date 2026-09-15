import type { Metadata } from "next";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = {
  title: "Roadmap — RUN&EARN",
  description:
    "The RUN&EARN roadmap: six audited-ready contracts, the AI mint studio, marketplace, and sneaker game shipped in Q3 2026 — beta launch, online store, and benefits vault next.",
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
      "Foundation shipped. Six contracts drafted and tested (mint, REN token, POL staking, appraiser, marketplace, game), the AI mint studio live, and the full web app — including the marketplace and the daily sneaker game — built on top.",
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
          "Six contracts on Hardhat 3 + OpenZeppelin: SneakerMint (ERC-721), RUNEToken (REN, 100M cap), SneakerStaking (native POL, rarity-based APY boosts), SneakerAppraiser, SneakerMarketplace, and SneakerGame — covered by 221 Solidity + TypeScript tests.",
        status: "done",
      },
      {
        month: "Aug",
        title: "AI-generated NFT artwork",
        description:
          "The Gemini-powered agent turns a photo of a physical sneaker into a unique retro-futuristic collectible, ready to mint on Polygon with on-chain rarity and tier.",
        status: "done",
      },
      {
        month: "Sep",
        title: "Full web app",
        description:
          "Home, Mint, Collection, Marketplace, Game, DeFi, Staking, and My NFTs go live with EIP-6963 wallet discovery (MetaMask + OKX), POL transfers, subgraph activity feeds, and the staking dashboard.",
        status: "done",
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
      "Beta launch and economy activation. Contracts deploy to Polygon Amoy, the veRUNE redemption pool opens, the online store bridges physical sneakers, and the benefits vault contract is developed.",
    milestones: [
      {
        month: "Oct",
        title: "Amoy testnet deployment",
        description:
          "All six contracts deploy to Polygon Amoy with verified source, the POL reward reserve is funded, and the subgraph indexes marketplace and game events.",
        status: "next",
      },
      {
        month: "Oct",
        title: "Beta launch",
        description:
          "Public beta of RUN&EARN. Mint studio, marketplace, sneaker game, and staking open to early users on Polygon Amoy.",
        status: "next",
      },
      {
        month: "Nov",
        title: "veRUNE redemption pool opens",
        description:
          "The play-to-earn pool is funded with REN and redemption is enabled: virtual points earned by daily sneaker activation become real, tradable tokens.",
        status: "planned",
      },
      {
        month: "Nov",
        title: "Online store ready",
        description:
          "The online store goes live to buy the first physical sneakers, bridging real product and on-chain NFT provenance.",
        status: "planned",
      },
      {
        month: "Dec",
        title: "Benefits vault contract",
        description:
          "A dedicated vault contract lets users lock their NFTs for extra benefits: discounts, special offers, and gifts. The vault becomes a benefits bóveda for everyone who wants to participate.",
        status: "planned",
      },
      {
        month: "Dec",
        title: "Sneaker upgrades with veRUNE",
        description:
          "Burn veRUNE points to level up an existing sneaker: raise its rarity score and tier, increasing its appraiser valuation, staking APY boost, and marketplace price.",
        status: "planned",
      },
      {
        month: "Q1 2027",
        title: "Physical redemption bridge",
        description:
          "Redeem veRUNE or REN for real sneakers from the store, with a one-time verifier registry linking on-chain claims to physical fulfillment.",
        status: "planned",
      },
      {
        month: "Q1 2027",
        title: "DAO governance and mainnet",
        description:
          "Timelock + multisig governance for APY, tier, fee, and treasury parameters — with REN-weighted voting — before the Polygon mainnet launch.",
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
            From contract foundation to the physical bridge
          </h1>
          <p
            className="animate-fade-up max-w-lg leading-relaxed text-foreground/60"
            style={{ animationDelay: "240ms" }}
          >
            A quarter-by-quarter view of where RUN&EARN is today and where it is
            heading on Polygon. We are closing Q3 2026 with the full contract
            suite and web app shipped.
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
