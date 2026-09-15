import hre from "hardhat";
import { verifyContract } from "@nomicfoundation/hardhat-verify/verify";
import { getAddress, type Address } from "viem";
import {
  addressEnv,
  appraiserParameters,
  assertNetwork,
  assertSignerBalance,
  bigintEnv,
  gameParameters,
  marketplaceParameters,
  optionalEnv,
  saveDeployment,
  shouldVerify,
  stakingParameters,
  waitBeforeVerification,
  type DeploymentRecord,
} from "./deployment-config.js";

const TARGETS = new Set([
  "all",
  "RUNEToken",
  "SneakerMint",
  "SneakerStaking",
  "SneakerAppraiser",
  "SneakerMarketplace",
  "SneakerGame",
  "VeSneakerStore",
]);

type ContractName =
  | "RUNEToken"
  | "SneakerMint"
  | "SneakerStaking"
  | "SneakerAppraiser"
  | "SneakerMarketplace"
  | "SneakerGame"
  | "VeSneakerStore";

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

  if (target === "all" || target === "SneakerAppraiser") {
    const sneakerDeployment = deployments.find((item) => item.name === "SneakerMint");
    const sneakerAddress = sneakerDeployment?.address ?? addressEnv("SNEAKER_MINT_ADDRESS", "0x0000000000000000000000000000000000000000" as Address);
    if (sneakerAddress === "0x0000000000000000000000000000000000000000") {
      throw new Error("SneakerAppraiser requires SNEAKER_MINT_ADDRESS when deployed separately.");
    }
    const ap = appraiserParameters();
    deployments.push(await deployContract(viem, "SneakerAppraiser", [
      addressEnv("APPRAISER_ADMIN_ADDRESS", admin),
      sneakerAddress,
      ap.baseValue,
      ap.tierValues,
      ap.rarityWeight,
      ap.globalMultiplierBps,
    ]));
  }

  if (target === "all" || target === "SneakerMarketplace") {
    const sneakerDeployment = deployments.find((item) => item.name === "SneakerMint");
    const appraiserDeployment = deployments.find((item) => item.name === "SneakerAppraiser");
    const stakingDeployment = deployments.find((item) => item.name === "SneakerStaking");
    const sneakerAddress = sneakerDeployment?.address ?? addressEnv("SNEAKER_MINT_ADDRESS", "0x0000000000000000000000000000000000000000" as Address);
    const appraiserAddress = appraiserDeployment?.address ?? addressEnv("SNEAKER_APPRAISER_ADDRESS", "0x0000000000000000000000000000000000000000" as Address);
    const stakingAddress = stakingDeployment?.address ?? addressEnv("STAKING_VAULT_ADDRESS", "0x0000000000000000000000000000000000000000" as Address);
    if (
      sneakerAddress === "0x0000000000000000000000000000000000000000" ||
      appraiserAddress === "0x0000000000000000000000000000000000000000" ||
      stakingAddress === "0x0000000000000000000000000000000000000000"
    ) {
      throw new Error("SneakerMarketplace requires SNEAKER_MINT_ADDRESS, SNEAKER_APPRAISER_ADDRESS, and STAKING_VAULT_ADDRESS when deployed separately.");
    }
    const mp = marketplaceParameters();
    deployments.push(await deployContract(viem, "SneakerMarketplace", [
      addressEnv("MARKETPLACE_ADMIN_ADDRESS", admin),
      sneakerAddress,
      appraiserAddress,
      stakingAddress,
      mp.feeBps,
      mp.appraiserPremiumBps,
      addressEnv("MARKETPLACE_FEE_COLLECTOR_ADDRESS", admin),
    ]));
  }

  if (target === "all" || target === "SneakerGame") {
    const sneakerDeployment = deployments.find((item) => item.name === "SneakerMint");
    const runeDeployment = deployments.find((item) => item.name === "RUNEToken");
    const sneakerAddress = sneakerDeployment?.address ?? addressEnv("SNEAKER_MINT_ADDRESS", "0x0000000000000000000000000000000000000000" as Address);
    const runeAddress = runeDeployment?.address ?? addressEnv("RUNE_TOKEN_ADDRESS", "0x0000000000000000000000000000000000000000" as Address);
    if (sneakerAddress === "0x0000000000000000000000000000000000000000" || runeAddress === "0x0000000000000000000000000000000000000000") {
      throw new Error("SneakerGame requires SNEAKER_MINT_ADDRESS and RUNE_TOKEN_ADDRESS when deployed separately.");
    }
    const gp = gameParameters();
    deployments.push(await deployContract(viem, "SneakerGame", [
      addressEnv("GAME_ADMIN_ADDRESS", admin),
      sneakerAddress,
      runeAddress,
      gp.tierBasePointsPerDay,
      gp.streakBonusStepBps,
      gp.maxDurability,
      gp.wearPerActivation,
      gp.repairCostPoints,
      gp.redemptionRate,
    ]));
  }

  if (target === "all" || target === "VeSneakerStore") {
    const sneakerDeployment = deployments.find((item) => item.name === "SneakerMint");
    const sneakerAddress = sneakerDeployment?.address ?? addressEnv("SNEAKER_MINT_ADDRESS", "0x0000000000000000000000000000000000000000" as Address);
    if (sneakerAddress === "0x0000000000000000000000000000000000000000") {
      throw new Error("VeSneakerStore requires SNEAKER_MINT_ADDRESS when deployed separately.");
    }
    const storeDeployment = await deployContract(viem, "VeSneakerStore", [
      addressEnv("VE_STORE_ADMIN_ADDRESS", admin),
      sneakerAddress,
      addressEnv("VE_STORE_TREASURY_ADDRESS", admin),
    ]);
    deployments.push(storeDeployment);

    // The store mints on demand, so it needs MINTER_ROLE on SneakerMint.
    const nft = await viem.getContractAt("SneakerMint", sneakerAddress);
    const minterRole = await nft.read.MINTER_ROLE();
    const hasRole = await nft.read.hasRole([minterRole, storeDeployment.address]);
    if (!hasRole) {
      const hash = await nft.write.grantRole([minterRole, storeDeployment.address], { account: wallet.account });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(`Granting MINTER_ROLE to VeSneakerStore failed (${hash}).`);
      console.log(`Granted MINTER_ROLE on SneakerMint to VeSneakerStore (${storeDeployment.address})`);
    }
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
