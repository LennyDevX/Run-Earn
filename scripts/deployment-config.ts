import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getAddress, type Address, type PublicClient, type WalletClient } from "viem";

export type DeploymentRecord = {
  network: string;
  chainId: number;
  deployer: Address;
  admin: Address;
  minter: Address;
  deployedAt: string;
  contracts: Partial<Record<"RUNEToken" | "SneakerMint" | "SneakerStaking" | "SneakerAppraiser" | "SneakerMarketplace" | "SneakerGame" | "VeSneakerStore", { address: Address; constructorArgs: readonly unknown[] }>>;
};

const scriptsDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptsDirectory, "..");
const deploymentsDirectory = resolve(projectRoot, "deployments");

export function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function optionalEnv(name: string, fallback?: string) {
  return process.env[name]?.trim() || fallback;
}

export function numberEnv(name: string, fallback: number) {
  const raw = optionalEnv(name);
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a non-negative number.`);
  return value;
}

export function bigintEnv(name: string, fallback: bigint) {
  const raw = optionalEnv(name);
  if (!raw) return fallback;
  try {
    const value = BigInt(raw);
    if (value < 0n) throw new Error();
    return value;
  } catch {
    throw new Error(`${name} must be a non-negative integer in base units.`);
  }
}

export function addressEnv(name: string, fallback: Address) {
  const value = optionalEnv(name);
  try {
    return getAddress(value || fallback);
  } catch {
    throw new Error(`${name} must be a valid EVM address.`);
  }
}

export function deploymentFile(networkName: string) {
  return resolve(deploymentsDirectory, `${networkName}.json`);
}

export function loadDeployment(networkName: string): DeploymentRecord {
  const file = deploymentFile(networkName);
  if (!existsSync(file)) throw new Error(`No deployment file found at ${file}. Deploy the contracts first or provide the address environment variables.`);
  return JSON.parse(readFileSync(file, "utf8")) as DeploymentRecord;
}

export function saveDeployment(record: DeploymentRecord) {
  mkdirSync(deploymentsDirectory, { recursive: true });
  const file = deploymentFile(record.network);
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return file;
}

export function networkFromEnvironment() {
  return process.env.HARDHAT_NETWORK || "unknown";
}

export function stakingParameters() {
  return {
    rewardTokensPerNftYear: bigintEnv("REWARD_TOKENS_PER_NFT_YEAR", 1000n * 10n ** 18n),
    baseApyBps: bigintEnv("STAKING_BASE_APY_BPS", 280n), // 2.8% sustainable base APY
    perNftBonusBps: bigintEnv("STAKING_PER_NFT_BONUS_BPS", 0n), // 0 — boost is rarity-based
    maxApyBps: bigintEnv("STAKING_MAX_APY_BPS", 800n),
    tierBonusBps: [50n, 80n, 150n, 180n] as const, // Common, Rare, Epic, Mythic
    minLockSeconds: bigintEnv("STAKING_MIN_LOCK_SECONDS", 2592000n), // 30 days minimum lock
  };
}

export function appraiserParameters() {
  return {
    baseValue: bigintEnv("APPRAISER_BASE_VALUE", 5n * 10n ** 17n), // 0.5 POL
    tierValues: [
      bigintEnv("APPRAISER_TIER0_VALUE", 0n),
      bigintEnv("APPRAISER_TIER1_VALUE", 1n * 10n ** 18n), // 1 POL (Rare)
      bigintEnv("APPRAISER_TIER2_VALUE", 3n * 10n ** 18n), // 3 POL (Epic)
      bigintEnv("APPRAISER_TIER3_VALUE", 8n * 10n ** 18n), // 8 POL (Mythic)
    ] as const,
    rarityWeight: bigintEnv("APPRAISER_RARITY_WEIGHT", 1n * 10n ** 16n), // 0.01 POL per rarity point
    globalMultiplierBps: bigintEnv("APPRAISER_MULTIPLIER_BPS", 10_000n), // 1x
  };
}

export function marketplaceParameters() {
  return {
    feeBps: bigintEnv("MARKETPLACE_FEE_BPS", 250n), // 2.5% marketplace fee
    appraiserPremiumBps: bigintEnv("MARKETPLACE_APPRAISER_PREMIUM_BPS", 12_000n), // suggested price = 1.2x appraiser value
  };
}

export function gameParameters() {
  return {
    tierBasePointsPerDay: [
      bigintEnv("GAME_TIER0_POINTS_PER_DAY", 100n * 10n ** 18n), // Common: 100 veRUNE/day
      bigintEnv("GAME_TIER1_POINTS_PER_DAY", 200n * 10n ** 18n), // Rare: 200 veRUNE/day
      bigintEnv("GAME_TIER2_POINTS_PER_DAY", 400n * 10n ** 18n), // Epic: 400 veRUNE/day
      bigintEnv("GAME_TIER3_POINTS_PER_DAY", 800n * 10n ** 18n), // Mythic: 800 veRUNE/day
    ] as const,
    streakBonusStepBps: bigintEnv("GAME_STREAK_BONUS_STEP_BPS", 100n), // +1% per streak day
    maxDurability: Number(bigintEnv("GAME_MAX_DURABILITY", 10n)),
    wearPerActivation: Number(bigintEnv("GAME_WEAR_PER_ACTIVATION", 1n)),
    repairCostPoints: bigintEnv("GAME_REPAIR_COST_POINTS", 50n * 10n ** 18n), // 50 veRUNE
    redemptionRate: bigintEnv("GAME_REDEMPTION_RATE", 100n * 10n ** 18n), // 100 veRUNE = 1 REN
  };
}

/// veSneaker primary-sale pricing. Defaults are 2x the SneakerAppraiser value
/// at the default rarity scores, which keeps the store coherent with the
/// on-chain valuation while leaving the protocol a primary-sale margin:
///
///   appraiser = 0.5 + tierValues[tier] + rarity * 0.01
///   Common (20): 0.70 POL -> 1.4 POL     Rare (45): 1.95 POL -> 3.9 POL
///   Epic   (65): 4.15 POL -> 8.3 POL     Mythic (85): 9.35 POL -> 18.7 POL
///
/// `POL_USD_PRICE` is only used for logging the USD equivalent at deploy time.
export type VeSneakerDesignConfig = {
  name: string;
  design: number; // PixelSneaker design index (0..6)
  rarity: number; // 0..100
  tier: number; // 0..3
  pricePol: bigint; // wei
  maxSupply: number;
};

export function polUsdPrice() {
  const raw = optionalEnv("POL_USD_PRICE", "0.10");
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error("POL_USD_PRICE must be a positive number.");
  return value;
}

export function veSneakerDesigns(): VeSneakerDesignConfig[] {
  const maxSupply = Number(bigintEnv("VE_MAX_SUPPLY", 1000n));
  const prices = {
    common: bigintEnv("VE_PRICE_COMMON_POL", 14n * 10n ** 17n), // 1.4 POL
    rare: bigintEnv("VE_PRICE_RARE_POL", 39n * 10n ** 17n), // 3.9 POL
    epic: bigintEnv("VE_PRICE_EPIC_POL", 83n * 10n ** 17n), // 8.3 POL
    mythic: bigintEnv("VE_PRICE_MYTHIC_POL", 187n * 10n ** 17n), // 18.7 POL
  };
  return [
    { name: "Neon Runner", design: 0, rarity: 85, tier: 3, pricePol: prices.mythic, maxSupply },
    { name: "Sky Drift", design: 1, rarity: 45, tier: 1, pricePol: prices.rare, maxSupply },
    { name: "Magma Rush", design: 2, rarity: 65, tier: 2, pricePol: prices.epic, maxSupply },
    { name: "Mint Circuit", design: 3, rarity: 45, tier: 1, pricePol: prices.rare, maxSupply },
    { name: "Ghost Protocol", design: 2, rarity: 20, tier: 0, pricePol: prices.common, maxSupply },
    { name: "Sol Surge", design: 1, rarity: 85, tier: 3, pricePol: prices.mythic, maxSupply },
    { name: "Cyber Pulse", design: 4, rarity: 85, tier: 3, pricePol: prices.mythic, maxSupply },
    { name: "Violet Haze", design: 5, rarity: 65, tier: 2, pricePol: prices.epic, maxSupply },
    { name: "Ember Trail", design: 6, rarity: 20, tier: 0, pricePol: prices.common, maxSupply },
  ];
}

export const VE_TIER_LABEL = ["Common", "Rare", "Epic", "Mythic"] as const;
export const VE_TIER_BOOST_BPS = [50, 80, 150, 180] as const;

/// Builds the base64 `data:application/json` token URI for a veSneaker design,
/// matching the metadata shape used by the mint studio.
export function veSneakerTokenUri(design: VeSneakerDesignConfig, index: number) {
  const metadata = {
    name: `veSneaker — ${design.name}`,
    description:
      "RUN&EARN virtual sneaker (veSneaker). Buy it with POL, lock it in staking for a POL APY boost, " +
      "and activate it in the sneaker game to earn veRUNE points. No physical sneaker required.",
    image: `pixel://vesneaker/${design.design}`,
    attributes: [
      { trait_type: "Rarity", value: VE_TIER_LABEL[design.tier] },
      { trait_type: "Rarity Score", value: design.rarity },
      { trait_type: "Tier", value: design.tier },
      { trait_type: "APY Boost", value: `+${VE_TIER_BOOST_BPS[design.tier] / 100}%` },
      { trait_type: "Design", value: design.design },
      { trait_type: "Design Index", value: index },
      { trait_type: "Origin", value: "Virtual sneaker · no physical pair required" },
      { trait_type: "Network", value: "Polygon" },
    ],
  };
  return `data:application/json;base64,${Buffer.from(JSON.stringify(metadata), "utf8").toString("base64")}`;
}

export async function assertNetwork(
  publicClient: PublicClient,
  expectedNetwork: "polygon" | "amoy",
) {
  const chainId = await publicClient.getChainId();
  const expectedChainId = expectedNetwork === "polygon" ? 137 : 80002;
  if (chainId !== expectedChainId) {
    throw new Error(`Wrong network. Expected ${expectedNetwork} (${expectedChainId}), received chain ID ${chainId}.`);
  }
  return chainId;
}

export async function assertSignerBalance(
  publicClient: PublicClient,
  walletClient: WalletClient,
  minimumWei = 0n,
) {
  if (!walletClient.account) throw new Error("The configured wallet has no account.");
  const balance = await publicClient.getBalance({ address: walletClient.account.address });
  if (balance < minimumWei) {
    throw new Error(`Insufficient native balance. Required at least ${minimumWei} wei, found ${balance} wei.`);
  }
  return balance;
}

export function shouldVerify() {
  return process.env.SKIP_VERIFY !== "true";
}

export async function waitBeforeVerification() {
  const delay = numberEnv("VERIFY_DELAY_MS", 15000);
  if (delay > 0) await new Promise((resolveDelay) => setTimeout(resolveDelay, delay));
}
