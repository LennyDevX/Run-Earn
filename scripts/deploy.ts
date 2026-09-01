import hre from "hardhat";
import { verifyContract } from "@nomicfoundation/hardhat-verify/verify";
import { getAddress, type Address } from "viem";
import {
  addressEnv,
  assertNetwork,
  assertSignerBalance,
  bigintEnv,
  optionalEnv,
  saveDeployment,
  shouldVerify,
  stakingParameters,
  waitBeforeVerification,
  type DeploymentRecord,
} from "./deployment-config.js";

const TARGETS = new Set(["all", "RUNEToken", "SneakerMint", "SneakerStaking"]);

type ContractName = "RUNEToken" | "SneakerMint" | "SneakerStaking";

type Deployment = {
  name: ContractName;
  address: Address;
  constructorArgs: readonly unknown[];
};

function targetFromEnvironment() {
  const target = process.env.DEPLOY_TARGET?.trim() || "all";
  if (!TARGETS.has(target)) {
    throw new Error(`DEPLOY_TARGET must be one of: ${[...TARGETS].join(", ")}.`);
  }
  return target;
}

function shouldVerifyOnNetwork(networkName: string) {
  return shouldVerify() && (networkName === "polygon" || networkName === "amoy");
}

async function verifyDeployment(deployment: Deployment) {
  try {
    await verifyContract({
      address: deployment.address,
      constructorArgs: [...deployment.constructorArgs],
      provider: "etherscan",
    }, hre);
    console.log(`Verified ${deployment.name} at ${deployment.address}`);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    if (/already verified|source code already verified/i.test(message)) {
      console.log(`${deployment.name} is already verified at ${deployment.address}`);
      return;
    }
    throw new Error(`Verification failed for ${deployment.name}: ${message}`);
  }
}

async function deployContract(
  viem: Awaited<ReturnType<typeof hre.network.create>>["viem"],
  name: ContractName,
  constructorArgs: readonly unknown[],
): Promise<Deployment> {
  console.log(`Deploying ${name}...`);
  const contract = await viem.deployContract(name, constructorArgs as never);
  const deployment = { name, address: getAddress(contract.address), constructorArgs };
  console.log(`${name}: ${deployment.address}`);
  return deployment;
}

async function main() {
  const connection = await hre.network.create();
  const { viem } = connection;
  const publicClient = await viem.getPublicClient();
  const [wallet] = await viem.getWalletClients();
  if (!wallet.account) throw new Error("No deployer account is configured.");

  const networkName = connection.networkName;
  if (networkName !== "polygon" && networkName !== "amoy") {
    throw new Error("Use --network polygon or --network amoy for contract deployment.");
  }
  const chainId = await assertNetwork(publicClient, networkName);
  await assertSignerBalance(publicClient, wallet, bigintEnv("MIN_DEPLOYER_BALANCE_WEI", 0n));

  const deployer = getAddress(wallet.account.address);
  const admin = addressEnv("DEPLOY_ADMIN_ADDRESS", deployer);
  const minter = addressEnv("RUNE_MINTER_ADDRESS", admin);
  const target = targetFromEnvironment();
  const deployments: Deployment[] = [];

  if (target === "all" || target === "RUNEToken") {
    deployments.push(await deployContract(viem, "RUNEToken", [admin, minter]));
  }

  if (target === "all" || target === "SneakerMint") {
    const name = optionalEnv("SNEAKER_NFT_NAME", "RUN&EARN Sneakers");
    const symbol = optionalEnv("SNEAKER_NFT_SYMBOL", "RSNEAK");
    deployments.push(await deployContract(viem, "SneakerMint", [name, symbol, admin]));
  }

  if (target === "all" || target === "SneakerStaking") {
    const runeDeployment = deployments.find((item) => item.name === "RUNEToken");
    const sneakerDeployment = deployments.find((item) => item.name === "SneakerMint");
    const runeAddress = runeDeployment?.address ?? addressEnv("RUNE_TOKEN_ADDRESS", "0x0000000000000000000000000000000000000000" as Address);
    const sneakerAddress = sneakerDeployment?.address ?? addressEnv("SNEAKER_MINT_ADDRESS", "0x0000000000000000000000000000000000000000" as Address);
    if (runeAddress === "0x0000000000000000000000000000000000000000" || sneakerAddress === "0x0000000000000000000000000000000000000000") {
      throw new Error("SneakerStaking requires RUNE_TOKEN_ADDRESS and SNEAKER_MINT_ADDRESS when deployed separately.");
    }
    const params = stakingParameters();
    deployments.push(await deployContract(viem, "SneakerStaking", [
      addressEnv("STAKING_ADMIN_ADDRESS", admin),
      sneakerAddress,
      runeAddress,
      params.rewardTokensPerNftYear,
      params.baseApyBps,
      params.perNftBonusBps,
      params.maxApyBps,
      params.tierBonusBps,
      params.minLockSeconds,
    ]));
  }

  const record: DeploymentRecord = {
    network: networkName,
    chainId,
    deployer,
    admin,
    minter,
    deployedAt: new Date().toISOString(),
    contracts: Object.fromEntries(deployments.map((item) => [item.name, { address: item.address, constructorArgs: item.constructorArgs }])) as DeploymentRecord["contracts"],
  };
  const file = saveDeployment(record);
  console.log(`Saved deployment manifest: ${file}`);

  if (shouldVerifyOnNetwork(networkName)) {
    await waitBeforeVerification();
    for (const deployment of deployments) await verifyDeployment(deployment);
  } else {
    console.log("Verification skipped. Set POLYGONSCAN_API_KEY and do not use SKIP_VERIFY=true for explorer verification.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
