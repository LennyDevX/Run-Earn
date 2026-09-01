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
  contracts: Partial<Record<"RUNEToken" | "SneakerMint" | "SneakerStaking", { address: Address; constructorArgs: readonly unknown[] }>>;
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
    baseApyBps: bigintEnv("STAKING_BASE_APY_BPS", 400n),
    perNftBonusBps: bigintEnv("STAKING_PER_NFT_BONUS_BPS", 50n),
    maxApyBps: bigintEnv("STAKING_MAX_APY_BPS", 800n),
    tierBonusBps: [0n, 50n, 100n, 150n, 200n, 250n, 300n, 350n] as const,
    minLockSeconds: bigintEnv("STAKING_MIN_LOCK_SECONDS", 604800n),
  };
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
