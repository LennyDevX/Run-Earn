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
  contracts: Partial<Record<"RENToken" | "SneakerMint" | "SneakerStaking" | "SneakerAppraiser" | "SneakerMarketplace" | "SneakerGame" | "VeSneakerStore" | "SneakerMods" | "SneakerWorkshop" | "SneakerSwap" | "SneakerTabArena" | "ModStore" | "PlayerProgress" | "FeeSplitter" | "SneakerVault", { address: Address; constructorArgs: readonly unknown[] }>>;
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

/// AI collectible valuation track. Separate from the veSneaker set so tuning art
/// prices never moves a playable valuation. Defaults land the MARKETPLACE price
/// (appraisal x the 1.2x premium) inside the 250 - 8,000 POL band:
///
///   Common r0 -> 210 appraised ->  252 listed
///   Rare r50  -> 1,310         -> 1,572
///   Epic r70  -> 3,110         -> 3,732
///   Mythic r100 -> 6,560       -> 7,872
export function collectibleAppraiserParameters() {
  return {
    baseValue: bigintEnv("COLLECTIBLE_APPRAISER_BASE_VALUE", 210n * 10n ** 18n),
    tierValues: [
      bigintEnv("COLLECTIBLE_APPRAISER_TIER0_VALUE", 0n),
      bigintEnv("COLLECTIBLE_APPRAISER_TIER1_VALUE", 600n * 10n ** 18n),
      bigintEnv("COLLECTIBLE_APPRAISER_TIER2_VALUE", 2_200n * 10n ** 18n),
      bigintEnv("COLLECTIBLE_APPRAISER_TIER3_VALUE", 5_350n * 10n ** 18n),
    ] as const,
    rarityWeight: bigintEnv("COLLECTIBLE_APPRAISER_RARITY_WEIGHT", 10n * 10n ** 18n),
    multiplierBps: bigintEnv("COLLECTIBLE_APPRAISER_MULTIPLIER_BPS", 10_000n),
  };
}

export function marketplaceParameters() {
  return {
    feeBps: bigintEnv("MARKETPLACE_FEE_BPS", 250n), // 2.5% marketplace fee
    appraiserPremiumBps: bigintEnv("MARKETPLACE_APPRAISER_PREMIUM_BPS", 12_000n), // suggested price = 1.2x appraiser value
  };
}

/// veSneaker care model: a 365-day wear season with a 50% floor.
/// There is no forge — mods are the only upgrade path, and the sneaker is the
/// only thing that wears. Restoring condition is what the repair kit is for.
export function workshopParameters() {
  return {
    conditionFloorBps: Number(bigintEnv("WORKSHOP_CONDITION_FLOOR_BPS", 5_000n)), // 50% at full wear
    seasonSeconds: bigintEnv("WORKSHOP_SEASON_SECONDS", 31_536_000n), // 365 days
  };
}

export function feeSplitterRecipients(fallbackRecipient: Address) {
  return [
    addressEnv("FEE_SPLITTER_TREASURY_ADDRESS", fallbackRecipient),
    addressEnv("FEE_SPLITTER_STAKING_WALLET_ADDRESS", fallbackRecipient),
    addressEnv("FEE_SPLITTER_REDEMPTION_WALLET_ADDRESS", fallbackRecipient),
    addressEnv("FEE_SPLITTER_TEAM_ADDRESS", fallbackRecipient),
  ] as const;
}

export function sneakerVaultParameters() {
  const discountBps = bigintEnv("SNEAKER_VAULT_DISCOUNT_BPS", 1_000n);
  const discountMinTier = bigintEnv("SNEAKER_VAULT_DISCOUNT_MIN_TIER", 3n);
  const discountRequiredLevel = bigintEnv("SNEAKER_VAULT_DISCOUNT_REQUIRED_LEVEL", 0n);
  const discountMinPolStaked = bigintEnv("SNEAKER_VAULT_DISCOUNT_MIN_POL_WEI", 0n);
  const discountMinConditionBps = bigintEnv("SNEAKER_VAULT_DISCOUNT_MIN_CONDITION_BPS", 0n);
  const discountMinModCount = bigintEnv("SNEAKER_VAULT_DISCOUNT_MIN_MOD_COUNT", 0n);
  const accessMinTier = bigintEnv("SNEAKER_VAULT_ACCESS_MIN_TIER", 3n);
  const accessRequiredLevel = bigintEnv("SNEAKER_VAULT_ACCESS_REQUIRED_LEVEL", 5n);
  const accessMinPolStaked = bigintEnv("SNEAKER_VAULT_ACCESS_MIN_POL_WEI", 0n);
  const accessMinConditionBps = bigintEnv("SNEAKER_VAULT_ACCESS_MIN_CONDITION_BPS", 0n);
  const accessMinModCount = bigintEnv("SNEAKER_VAULT_ACCESS_MIN_MOD_COUNT", 0n);

  if (discountBps === 0n || discountBps > 5_000n) throw new Error("SNEAKER_VAULT_DISCOUNT_BPS must be between 1 and 5000.");
  if (discountMinTier > 3n || accessMinTier > 3n) throw new Error("SneakerVault tier gates must be between 0 and 3.");
  if (discountRequiredLevel > 10n || accessRequiredLevel > 10n) throw new Error("SneakerVault level gates must be between 0 and 10.");
  if (discountMinConditionBps > 10_000n || accessMinConditionBps > 10_000n) throw new Error("SneakerVault condition gates must fit uint16.");

  return {
    discountBps: Number(discountBps),
    discountMinTier: Number(discountMinTier),
    discountRequiredLevel: Number(discountRequiredLevel),
    discountMinPolStaked,
    discountMinConditionBps: Number(discountMinConditionBps),
    discountMinModCount,
    accessMinTier: Number(accessMinTier),
    accessRequiredLevel: Number(accessRequiredLevel),
    accessMinPolStaked,
    accessMinConditionBps: Number(accessMinConditionBps),
    accessMinModCount,
  };
}

/// PlayerProgress level curve — XP needed to reach each level (index 0 = L1).
/// Override with PROGRESS_LEVEL_THRESHOLDS="0,300,800,..." (comma-separated,
/// strictly increasing, first entry must be 0).
export function progressParameters() {
  const raw = optionalEnv("PROGRESS_LEVEL_THRESHOLDS");
  const defaults = [0, 300, 800, 1600, 2800, 4500, 7000, 10500, 15000, 21000];
  const thresholds = (raw ? raw.split(",").map((part) => BigInt(part.trim())) : defaults.map(BigInt));
  if (thresholds.length < 2 || thresholds[0] !== 0n) {
    throw new Error("PROGRESS_LEVEL_THRESHOLDS needs >= 2 ascending entries starting at 0.");
  }
  return { levelThresholds: thresholds };
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
/// move only needs a single env change. The USD targets match the POL ladder in
/// `src/lib/ve-sneakers.ts` at POL = $0.09764:
///
///   Sol   (Rare)   1,500 POL -> $146
///   Luna  (Epic)   2,100 POL -> $205
///   Astra (Mythic) 3,000 POL -> $293
///   Common (unused) 1,000 POL -> $98
///
/// Set `VE_PRICE_*_POL` to override an individual design price in POL directly.
export type VeSneakerDesignConfig = {
  name: string;
  family: "Astra" | "Sol" | "Luna";
  design: number;
  imagePath: string;
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
    common: bigintEnv("VE_PRICE_COMMON_POL", usdToPolWhole(numberEnv("VE_PRICE_COMMON_USD", 98))),
    rare: bigintEnv("VE_PRICE_RARE_POL", usdToPolWhole(numberEnv("VE_PRICE_RARE_USD", 146))),
    epic: bigintEnv("VE_PRICE_EPIC_POL", usdToPolWhole(numberEnv("VE_PRICE_EPIC_USD", 205))),
    mythic: bigintEnv("VE_PRICE_MYTHIC_POL", usdToPolWhole(numberEnv("VE_PRICE_MYTHIC_USD", 293))),
  };
}

export function veSneakerDesigns(): VeSneakerDesignConfig[] {
  const maxSupply = Number(bigintEnv("VE_MAX_SUPPLY", 1000n));
  const prices = veSneakerPricesPol();
  return [
    { name: "Astra", family: "Astra", design: 0, imagePath: "/veSneakerAstra.png", rarity: 85, tier: 3, pricePol: prices.mythic, maxSupply },
    { name: "Sol", family: "Sol", design: 1, imagePath: "/veSneakerSol.png", rarity: 45, tier: 1, pricePol: prices.rare, maxSupply },
    { name: "Luna", family: "Luna", design: 2, imagePath: "/veSneakerLuna.png", rarity: 65, tier: 2, pricePol: prices.epic, maxSupply },
  ];
}

export const VE_TIER_LABEL = ["Common", "Rare", "Epic", "Mythic"] as const;
export const VE_TIER_BOOST_BPS = [50, 80, 150, 180] as const;

/// Builds the base64 `data:application/json` token URI for a veSneaker design,
/// matching the metadata shape used by the mint studio.
export function veSneakerTokenUri(design: VeSneakerDesignConfig, index: number) {
  const assetBaseUrl = new URL(requiredEnv("VE_SNEAKER_ASSET_BASE_URL"));
  if (
    !["https:", "http:"].includes(assetBaseUrl.protocol) ||
    assetBaseUrl.username ||
    assetBaseUrl.password ||
    assetBaseUrl.pathname !== "/" ||
    assetBaseUrl.search ||
    assetBaseUrl.hash ||
    (assetBaseUrl.protocol === "http:" && !["localhost", "127.0.0.1"].includes(assetBaseUrl.hostname))
  ) {
    throw new Error("VE_SNEAKER_ASSET_BASE_URL must be a public HTTPS origin (HTTP is allowed only for localhost).");
  }
  const metadata = {
    name: `veSneaker — ${design.name}`,
    description:
      "Airen virtual sneaker (veSneaker). Buy it with POL, lock it in staking for a POL APY boost, " +
      "equip mod NFTs across seven slots, and run the daily tab challenge to raise your yield. " +
      "Every pair wears over a 365-day season — keep it serviced to hold its rarity. " +
      "No physical sneaker required.",
    image: `${assetBaseUrl.origin}${design.imagePath}`,
    attributes: [
      { trait_type: "Collection", value: design.family },
      { trait_type: "Rarity", value: VE_TIER_LABEL[design.tier] },
      { trait_type: "Rarity Score", value: design.rarity },
      { trait_type: "Tier", value: design.tier },
      { trait_type: "Staking APY Boost", value: `+${VE_TIER_BOOST_BPS[design.tier] / 100}%` },
      // Base tab ceiling with no mods equipped: 50 + rarity, in basis points.
      { trait_type: "Tab Ceiling", value: `+${(50 + design.rarity) / 100}%` },
      { trait_type: "Tab Multiplier", value: tabMultiplierLabel(design.rarity) },
      { trait_type: "Season", value: "365 days" },
      { trait_type: "Design", value: design.design },
      { trait_type: "Design Index", value: index },
      { trait_type: "Origin", value: "Virtual sneaker · no physical pair required" },
      { trait_type: "Network", value: "Polygon" },
    ],
  };
  return `data:application/json;base64,${Buffer.from(JSON.stringify(metadata), "utf8").toString("base64")}`;
}

/// Points-per-tap band a pristine pair starts in (mirrors `pointsPerTap` in
/// `src/lib/tab-challenge.ts`).
function tabMultiplierLabel(rarity: number) {
  if (rarity >= 76) return "x4";
  if (rarity >= 51) return "x3";
  if (rarity >= 26) return "x2";
  return "x1";
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
