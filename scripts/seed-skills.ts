import hre from "hardhat";
import { parseEther, type Address } from "viem";
import { addressEnv, assertNetwork, assertSignerBalance, bigintEnv } from "./deployment-config.js";

/// Seeds the level-gated skill economy:
///   1. `SneakerMods.addAchievement` — one free claimable skill per level gate
///      (ReqKind.PlayerLevel, threshold = required player level).
///   2. `ModStore.addDesign` — purchasable extra copies at accessible POL
///      prices, gated by the same `requiredLevel`.
///
/// Requires SneakerMods + ModStore deployed and wired to PlayerProgress
/// (`mods.setProgress`, `modStore.setProgress` — done by deploy.ts).
///
///   SNEAKER_MODS_ADDRESS=0x... MOD_STORE_ADDRESS=0x... \
///     npx hardhat run scripts/seed-skills.ts --network amoy
///
/// The script is idempotent: skills whose level already has a PlayerLevel
/// achievement are skipped, and store designs are matched by name.

const SLOT_SKILL = 6;
const REQ_PLAYER_LEVEL = 4; // SneakerMods.ReqKind.PlayerLevel
const NO_AUX = 255;

type SkillSeed = {
  name: string;
  description: string;
  level: number;
  slot: number;
  rarity: number;
  tier: number;
  effectBps: number;
  aux: number;
  consumable: boolean;
  pricePol: string;
  maxSupply: number;
};

const SKILLS: SkillSeed[] = [
  {
    name: "Focus Chip",
    description: "Passive skill — +2% veRUNE earn rate while equipped in the Skill slot.",
    level: 2,
    slot: SLOT_SKILL,
    rarity: 55,
    tier: 0,
    effectBps: 200,
    aux: NO_AUX,
    consumable: false,
    pricePol: "8",
    maxSupply: 500,
  },
  {
    name: "Overdrive Cell",
    description: "Consumable skill — +15% earn rate for 48h (3 energy).",
    level: 3,
    slot: SLOT_SKILL,
    rarity: 65,
    tier: 1,
    effectBps: 1500,
    aux: 4,
    consumable: true,
    pricePol: "5",
    maxSupply: 500,
  },
  {
    name: "Stim Pack",
    description: "Consumable skill — instantly refills sneaker energy to max.",
    level: 4,
    slot: SLOT_SKILL,
    rarity: 65,
    tier: 1,
    effectBps: 0,
    aux: 5,
    consumable: true,
    pricePol: "3",
    maxSupply: 500,
  },
  {
    name: "Lucky Repair",
    description: "Consumable skill — full health restore plus +5% earn for 24h (1 energy).",
    level: 5,
    slot: SLOT_SKILL,
    rarity: 75,
    tier: 2,
    effectBps: 500,
    aux: 6,
    consumable: true,
    pricePol: "6",
    maxSupply: 300,
  },
  {
    name: "Momentum Core",
    description: "Passive skill — +4% veRUNE earn rate while equipped in the Skill slot.",
    level: 6,
    slot: SLOT_SKILL,
    rarity: 80,
    tier: 2,
    effectBps: 400,
    aux: NO_AUX,
    consumable: false,
    pricePol: "15",
    maxSupply: 300,
  },
  {
    name: "Apex Instinct",
    description: "Passive skill — +8% veRUNE earn rate while equipped in the Skill slot.",
    level: 8,
    slot: SLOT_SKILL,
    rarity: 95,
    tier: 3,
    effectBps: 800,
    aux: NO_AUX,
    consumable: false,
    pricePol: "40",
    maxSupply: 150,
  },
];

function skillUri(skill: SkillSeed) {
  const metadata = {
    name: skill.name,
    description: skill.description,
    attributes: [
      { trait_type: "Kind", value: "Skill" },
      { trait_type: "Required Level", value: skill.level },
      { trait_type: "Consumable", value: skill.consumable },
      { trait_type: "Effect (bps)", value: skill.effectBps },
    ],
  };
  return `data:application/json;base64,${Buffer.from(JSON.stringify(metadata)).toString("base64")}`;
}

async function main() {
  const connection = await hre.network.create();
  const { viem } = connection;
  const publicClient = await viem.getPublicClient();
  const [wallet] = await viem.getWalletClients();
  if (!wallet.account) throw new Error("No deployer account is configured.");

  const networkName = connection.networkName;
  if (networkName !== "polygon" && networkName !== "amoy") {
    throw new Error("Use --network polygon or --network amoy.");
  }
  await assertNetwork(publicClient, networkName);
  await assertSignerBalance(publicClient, wallet, bigintEnv("MIN_DEPLOYER_BALANCE_WEI", 0n));

  const modsAddress = addressEnv("SNEAKER_MODS_ADDRESS", "0x0000000000000000000000000000000000000000" as Address);
  const storeAddress = addressEnv("MOD_STORE_ADDRESS", "0x0000000000000000000000000000000000000000" as Address);
  if (modsAddress === "0x0000000000000000000000000000000000000000") {
    throw new Error("SNEAKER_MODS_ADDRESS is required.");
  }
  if (storeAddress === "0x0000000000000000000000000000000000000000") {
    throw new Error("MOD_STORE_ADDRESS is required.");
  }
  const mods = await viem.getContractAt("SneakerMods", modsAddress);
  const store = await viem.getContractAt("ModStore", storeAddress);

  const progress = await mods.read.progress();
  if (progress === "0x0000000000000000000000000000000000000000") {
    throw new Error("SneakerMods.progress is not set — run deploy wiring (mods.setProgress) first.");
  }
  console.log(`SneakerMods: ${modsAddress} | ModStore: ${storeAddress} | PlayerProgress: ${progress}`);

  // ─── 1. Free claimable skills (achievements) ─────────────────────────────
  const achievementCount = await mods.read.achievementCount();
  const gatedLevels = new Set<number>();
  for (let i = 0; i < Number(achievementCount); i++) {
    const ach = await mods.read.achievements([BigInt(i)]);
    if (Number(ach.kind) === REQ_PLAYER_LEVEL) gatedLevels.add(Number(ach.threshold));
  }

  for (const skill of SKILLS) {
    if (gatedLevels.has(skill.level)) {
      console.log(`Achievement for level ${skill.level} already exists — skipping ${skill.name}.`);
      continue;
    }
    const hash = await mods.write.addAchievement(
      [
        {
          kind: REQ_PLAYER_LEVEL,
          threshold: BigInt(skill.level),
          slot: skill.slot,
          rarity: skill.rarity,
          tier: skill.tier,
          effectBps: skill.effectBps,
          aux: skill.aux,
          consumable: skill.consumable,
          uri: skillUri(skill),
          active: true,
        },
      ],
      { account: wallet.account },
    );
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`addAchievement failed for ${skill.name} (${hash}).`);
    console.log(`Achievement: ${skill.name} — free claim at level ${skill.level}`);
  }

  // ─── 2. Purchasable extra copies (ModStore) ──────────────────────────────
  const designCount = await store.read.designCount();
  const existingNames = new Set<string>();
  for (let i = 0; i < Number(designCount); i++) {
    const design = await store.read.designs([BigInt(i)]);
    existingNames.add(design.name);
  }

  for (const skill of SKILLS) {
    if (existingNames.has(skill.name)) {
      console.log(`Store design ${skill.name} already exists — skipping.`);
      continue;
    }
    const hash = await store.write.addDesign(
      [
        {
          name: skill.name,
          uri: skillUri(skill),
          slot: skill.slot,
          rarity: skill.rarity,
          tier: skill.tier,
          effectBps: skill.effectBps,
          aux: skill.aux,
          consumable: skill.consumable,
          price: parseEther(skill.pricePol),
          maxSupply: skill.maxSupply,
          minted: 0,
          requiredLevel: skill.level,
          active: true,
        },
      ],
      { account: wallet.account },
    );
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`addDesign failed for ${skill.name} (${hash}).`);
    console.log(`Store design: ${skill.name} — ${skill.pricePol} POL, level ${skill.level}+`);
  }

  console.log("\nSkill seeding complete. Skills appear at /badges and extra copies at /collection.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
