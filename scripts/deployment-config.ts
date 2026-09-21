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
  contracts: Partial<Record<"RENToken" | "SneakerMint" | "SneakerStaking" | "SneakerAppraiser" | "SneakerMarketplace" | "SneakerGame" | "VeSneakerStore" | "SneakerMods" | "SneakerWorkshop" | "SneakerSwap" | "ModRental" | "ModStore", { address: Address; constructorArgs: readonly unknown[] }>>;
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

/// Workshop forge parameters — the veRUNE sink for permanent sneaker upgrades.
///   forgeCostPoints  base veRUNE per level (actual cost = base * (level + 1))
///   forgeRarityStep  rarity points gained per level
///   forgeEarnStepBps earn-rate bonus per level
///   maxForgeLevel    level cap per sneaker
export function workshopParameters() {
  return {
    forgeCostPoints: bigintEnv("WORKSHOP_FORGE_COST_POINTS", 250n * 10n ** 18n), // 250 veRUNE base
    forgeRarityStep: Number(bigintEnv("WORKSHOP_FORGE_RARITY_STEP", 5n)), // +5 rarity per level
    forgeEarnStepBps: Number(bigintEnv("WORKSHOP_FORGE_EARN_STEP_BPS", 250n)), // +2.5% earn per level
    maxForgeLevel: Number(bigintEnv("WORKSHOP_MAX_FORGE_LEVEL", 10n)),
  };
}

export function rentalParameters() {
  return {
    feeBps: bigintEnv("RENTAL_FEE_BPS", 250n), // 2.5% rental fee
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

/// veSneaker primary-sale pricing.
///
/// Prices are defined in USD and converted to POL with `POL_USD_PRICE`, so a POL
/// move only needs a single env change. The USD targets follow a geometric
/// progression from $40 (Common) to $150 (Mythic):
///
///   Common $40 -> 410 POL     Rare $62  -> 635 POL
///   Epic   $97 -> 993 POL    Mythic $150 -> 1536 POL   (at POL = $0.09764)
///
/// Set `VE_PRICE_*_POL` to override an individual design price in POL directly.
export type VeSneakerDesignConfig = {
  name: string;
  design: number; // PixelSneaker design index (0..6)
  rarity: number; // 0..100
  tier: number; // 0..3
  pricePol: bigint; // wei
  maxSupply: number;
};

export function polUsdPrice() {
  const raw = optionalEnv("POL_USD_PRICE", "0.09764");
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error("POL_USD_PRICE must be a positive number.");
  return value;
}

/// Converts a USD target into whole POL at the configured POL price.
function usdToPolWhole(usd: number) {
  const pol = usd / polUsdPrice();
  return BigInt(Math.max(1, Math.round(pol))) * 10n ** 18n;
}

export function veSneakerPricesPol() {
  return {
    common: bigintEnv("VE_PRICE_COMMON_POL", usdToPolWhole(numberEnv("VE_PRICE_COMMON_USD", 40))),
    rare: bigintEnv("VE_PRICE_RARE_POL", usdToPolWhole(numberEnv("VE_PRICE_RARE_USD", 62))),
    epic: bigintEnv("VE_PRICE_EPIC_POL", usdToPolWhole(numberEnv("VE_PRICE_EPIC_USD", 97))),
    mythic: bigintEnv("VE_PRICE_MYTHIC_POL", usdToPolWhole(numberEnv("VE_PRICE_MYTHIC_USD", 150))),
  };
}

export function veSneakerDesigns(): VeSneakerDesignConfig[] {
  const maxSupply = Number(bigintEnv("VE_MAX_SUPPLY", 1000n));
  const prices = veSneakerPricesPol();
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
