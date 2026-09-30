export type RoadmapStatus = "done" | "active" | "next" | "planned";

export type RoadmapAccent = "mint" | "brand" | "astra" | "sol";

export type RoadmapMilestone = {
  period: string;
  title: string;
  description: string;
  status: RoadmapStatus;
  tags?: readonly string[];
};

export type RoadmapPhase = {
  id: string;
  index: string;
  code: string;
  label: string;
  range: string;
  summary: string;
  accent: RoadmapAccent;
  status: RoadmapStatus;
  milestones: readonly RoadmapMilestone[];
};

/// Phase 01 shipped the whole v1.0 + v1.1 product surface: fifteen Solidity
/// contracts, the AI mint studio, the full web app, the player progression
/// system, and the Airen brand identity. Phase 02 is where it goes on-chain.
export const ROADMAP_PHASES: readonly RoadmapPhase[] = [
  {
    id: "genesis",
    index: "01",
    code: "GENESIS",
    label: "Q3 2026",
    range: "Jul — Sep 2026",
    accent: "mint",
    status: "done",
    summary:
      "The entire product was built and hardened off-chain: fifteen contracts, the AI mint studio, the upgrade economy, player progression, and the Airen identity — all covered by a 430-test suite.",
    milestones: [
      {
        period: "Jul",
        title: "Project kickoff",
        description:
          "Airen is founded. Brand direction, tokenomics, and the Polygon-first stack are defined before a single contract is written.",
        status: "done",
        tags: ["Brand", "Tokenomics"],
      },
      {
        period: "Aug",
        title: "Contract foundation",
        description:
          "SneakerMint (ERC-721), RENToken (REN, 100M cap), SneakerStaking (native POL + rarity APY boosts), SneakerAppraiser, SneakerMarketplace, and SneakerGame ship on Hardhat 3 + OpenZeppelin.",
        status: "done",
        tags: ["Solidity 0.8.36", "OpenZeppelin 5.6"],
      },
      {
        period: "Aug",
        title: "AI mint studio",
        description:
          "The Gemini-powered studio turns a photo into a unique retro-futuristic collectible, ready to mint on Polygon with on-chain rarity and tier.",
        status: "done",
        tags: ["Gemini", "Server-only key"],
      },
      {
        period: "Sep",
        title: "Upgrade economy + progression",
        description:
          "Seven-slot workshop, badges, consumable abilities, atomic swaps, premium mod store, the daily tab arena, the 365-day veSneaker wear cycle, and the live-state XP/level system with level-gated skill NFTs.",
        status: "done",
        tags: ["Workshop", "Badges", "Skills"],
      },
      {
        period: "Sep",
        title: "Full web app",
        description:
          "Twelve routes — Home, Mint, Collection, Marketplace, Game, DeFi, Staking, Workshop, Badges, Profile, My NFTs, Roadmap — with EIP-6963 wallet discovery (MetaMask + OKX), POL transfers, and subgraph activity feeds.",
        status: "done",
        tags: ["Next.js 16", "viem", "EIP-6963"],
      },
      {
        period: "Sep",
        title: "Airen identity v1.1",
        description:
          "Astra, Sol, and Luna replace the legacy artwork, the RUN&EARN wordmark becomes Airen, Chakra Petch becomes the global typeface, and the midnight-navy + cyan palette lands across light and dark.",
        status: "done",
        tags: ["Astra / Sol / Luna", "Chakra Petch"],
      },
      {
        period: "Sep",
        title: "Benefits vault + fee splitter",
        description:
          "SneakerVault adds live-state perks (store discounts and gated designs) and FeeSplitter distributes marketplace fees pro-rata. Both are written, wired into the stores, and tested — deployment is the remaining step.",
        status: "done",
        tags: ["15 contracts", "430 tests"],
      },
    ],
  },
  {
    id: "ignition",
    index: "02",
    code: "IGNITION",
    label: "Q4 2026",
    range: "Oct — Dec 2026",
    accent: "brand",
    status: "active",
    summary:
      "Everything moves on-chain. Contracts deploy to Polygon Amoy with verified source, the reserves get funded, the benefits vault and fee splitter go live, and administration moves behind a multisig.",
    milestones: [
      {
        period: "Oct",
        title: "Amoy testnet deployment",
        description:
          "All fifteen contracts deploy to Polygon Amoy with verified source. The deploy script seeds the fee-splitter recipients, the vault perks, and the store wiring in one run.",
        status: "active",
        tags: ["Verified source", "One-run wiring"],
      },
      {
        period: "Oct",
        title: "Public beta launch",
        description:
          "Mint studio, marketplace, sneaker game, and staking open to early users on Amoy, with the subgraph indexing marketplace and game events.",
        status: "next",
        tags: ["Beta"],
      },
      {
        period: "Nov",
        title: "Reward reserves funded",
        description:
          "The POL staking reserve and the veRUNE redemption pool are funded, and redemption is enabled so daily sneaker activation converts into real REN.",
        status: "planned",
        tags: ["POL reserve", "REN pool"],
      },
      {
        period: "Nov",
        title: "Benefits live for holders",
        description:
          "Vault perks activate on the stores: holders get tier-based discounts and exclusive access to gated designs, with eligibility recalculated live from ownership and staked POL.",
        status: "planned",
        tags: ["Discounts", "Exclusive access"],
      },
      {
        period: "Dec",
        title: "Multisig administration",
        description:
          "Every admin role — treasury, reserves, fee recipients, vault perks, and store catalogs — moves behind a multisig before any real value is at stake.",
        status: "planned",
        tags: ["Multisig", "Role handoff"],
      },
      {
        period: "Dec",
        title: "veSneaker rentals",
        description:
          "ModRental extends from mods to full sneakers, letting owners earn on idle NFTs while players test a design before buying it.",
        status: "planned",
        tags: ["Rental", "Yield"],
      },
    ],
  },
  {
    id: "orbit",
    index: "03",
    code: "ORBIT",
    label: "Q1 2027",
    range: "Jan — Mar 2027",
    accent: "astra",
    status: "planned",
    summary:
      "The economy gets a token and a verdict. REN launches on Polygon, an independent audit reviews every contract and economic invariant, and the marketplace grows beyond single-asset sales.",
    milestones: [
      {
        period: "Q1",
        title: "REN token launch",
        description:
          "REN goes live on Polygon as the ecosystem token, with veRUNE redemption at the configured rate and REN-weighted utility across staking and governance.",
        status: "planned",
        tags: ["REN", "Polygon"],
      },
      {
        period: "Q1",
        title: "Independent security audit",
        description:
          "External review of all contracts, custody invariants, and economic assumptions — published alongside the fixes it produces.",
        status: "planned",
        tags: ["Audit", "Disclosure"],
      },
      {
        period: "Q1",
        title: "Marketplace 2.0",
        description:
          "Bundled listings, collection-wide offers, and richer auction modes on top of the multi-collection marketplace that already trades sneakers and mods.",
        status: "planned",
        tags: ["Bundles", "Offers"],
      },
      {
        period: "Q1",
        title: "Mainnet readiness review",
        description:
          "A published checklist covering keys, reserves, pause paths, upgrade policy, and incident response — signed off before any mainnet transaction.",
        status: "planned",
        tags: ["Checklist", "Runbook"],
      },
    ],
  },
  {
    id: "constellation",
    index: "04",
    code: "CONSTELLATION",
    label: "Q2 2027+",
    range: "Apr 2027 onward",
    accent: "sol",
    status: "planned",
    summary:
      "The long arc: governance handed to holders, the economy running on Polygon mainnet, and growth loops that bring new players and creators into the universe.",
    milestones: [
      {
        period: "Q2",
        title: "DAO governance",
        description:
          "Timelock plus multisig execution with REN-weighted voting over APY, tier boosts, fees, and treasury allocations.",
        status: "planned",
        tags: ["Timelock", "Voting"],
      },
      {
        period: "Q2",
        title: "Polygon mainnet launch",
        description:
          "Airen opens to the public on Polygon mainnet with audited contracts, funded reserves, and multisig administration.",
        status: "planned",
        tags: ["Mainnet"],
      },
      {
        period: "Q2",
        title: "Quests, referrals, and airdrops",
        description:
          "Merkle-based reward campaigns, referral tracking, and seasonal quests that feed the existing XP and skill system.",
        status: "planned",
        tags: ["Merkle", "Quests"],
      },
      {
        period: "Q3",
        title: "Ecosystem expansion",
        description:
          "Cross-collection drops, partner storefronts, and creator tooling that turn the sneaker universe into a platform other collections can build on.",
        status: "planned",
        tags: ["Partners", "Creators"],
      },
    ],
  },
];

const ALL_MILESTONES = ROADMAP_PHASES.flatMap((phase) => phase.milestones);

export const ROADMAP_PROGRESS = {
  phases: ROADMAP_PHASES.length,
  shipped: ALL_MILESTONES.filter((milestone) => milestone.status === "done").length,
  total: ALL_MILESTONES.length,
} as const;
