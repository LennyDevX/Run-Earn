import hre from "hardhat";
import { verifyContract } from "@nomicfoundation/hardhat-verify/verify";
import { getAddress, type Address } from "viem";
import {
  addressEnv,
  appraiserParameters,
  assertNetwork,
  assertSignerBalance,
  bigintEnv,
  feeSplitterRecipients,
  gameParameters,
  marketplaceParameters,
  optionalEnv,
  progressParameters,
  saveDeployment,
  shouldVerify,
  sneakerVaultParameters,
  stakingParameters,
  waitBeforeVerification,
  workshopParameters,
  type DeploymentRecord,
} from "./deployment-config.js";

const TARGETS = new Set([
  "all",
  "RENToken",
  "SneakerMint",
  "SneakerStaking",
  "SneakerAppraiser",
  "SneakerMarketplace",
  "SneakerGame",
  "VeSneakerStore",
  "SneakerMods",
  "SneakerWorkshop",
  "SneakerTabArena",
  "SneakerSwap",
  "ModStore",
  "PlayerProgress",
  "FeeSplitter",
  "SneakerVault",
]);

type ContractName =
  | "RENToken"
  | "SneakerMint"
  | "SneakerStaking"
  | "SneakerAppraiser"
  | "SneakerMarketplace"
  | "SneakerGame"
  | "VeSneakerStore"
  | "SneakerMods"
  | "SneakerWorkshop"
  | "SneakerSwap"
  | "SneakerTabArena"
  | "ModStore"
  | "PlayerProgress"
  | "FeeSplitter"
  | "SneakerVault";

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

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

/// Resolves a contract address from this run's deployments or an env fallback.
function resolveAddress(deployments: Deployment[], name: ContractName, envName: string): Address {
  const deployed = deployments.find((item) => item.name === name);
  return deployed?.address ?? addressEnv(envName, ZERO);
}

function requireAddress(value: Address, envName: string, forContract: string): Address {
  if (value === ZERO) throw new Error(`${forContract} requires ${envName} when deployed separately.`);
  return value;
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

  if (target === "all" || target === "RENToken") {
    deployments.push(await deployContract(viem, "RENToken", [admin, minter]));
  }

  if (target === "all" || target === "SneakerMint") {
    const name = optionalEnv("SNEAKER_NFT_NAME", "Airen Sneakers");
    const symbol = optionalEnv("SNEAKER_NFT_SYMBOL", "ASNEAK");
    deployments.push(await deployContract(viem, "SneakerMint", [name, symbol, admin]));
  }

  if (target === "all" || target === "SneakerStaking") {
    const runeDeployment = deployments.find((item) => item.name === "RENToken");
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
    const runeDeployment = deployments.find((item) => item.name === "RENToken");
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

  if (target === "all" || target === "SneakerMods") {
    const sneakerAddress = requireAddress(resolveAddress(deployments, "SneakerMint", "SNEAKER_MINT_ADDRESS"), "SNEAKER_MINT_ADDRESS", "SneakerMods");
    const gameAddress = requireAddress(resolveAddress(deployments, "SneakerGame", "SNEAKER_GAME_ADDRESS"), "SNEAKER_GAME_ADDRESS", "SneakerMods");
    const stakingAddress = requireAddress(resolveAddress(deployments, "SneakerStaking", "STAKING_VAULT_ADDRESS"), "STAKING_VAULT_ADDRESS", "SneakerMods");
    const name = optionalEnv("MODS_NFT_NAME", "Airen Mods");
    const symbol = optionalEnv("MODS_NFT_SYMBOL", "AMOD");
    deployments.push(await deployContract(viem, "SneakerMods", [
      name,
      symbol,
      addressEnv("MODS_ADMIN_ADDRESS", admin),
      sneakerAddress,
      gameAddress,
      stakingAddress,
    ]));
  }

  if (target === "all" || target === "SneakerWorkshop") {
    const sneakerAddress = requireAddress(resolveAddress(deployments, "SneakerMint", "SNEAKER_MINT_ADDRESS"), "SNEAKER_MINT_ADDRESS", "SneakerWorkshop");
    const modsAddress = requireAddress(resolveAddress(deployments, "SneakerMods", "SNEAKER_MODS_ADDRESS"), "SNEAKER_MODS_ADDRESS", "SneakerWorkshop");
    const gameAddress = requireAddress(resolveAddress(deployments, "SneakerGame", "SNEAKER_GAME_ADDRESS"), "SNEAKER_GAME_ADDRESS", "SneakerWorkshop");
    const stakingAddress = requireAddress(resolveAddress(deployments, "SneakerStaking", "STAKING_VAULT_ADDRESS"), "STAKING_VAULT_ADDRESS", "SneakerWorkshop");
    const wp = workshopParameters();
    deployments.push(await deployContract(viem, "SneakerWorkshop", [
      addressEnv("WORKSHOP_ADMIN_ADDRESS", admin),
      sneakerAddress,
      modsAddress,
      gameAddress,
      stakingAddress,
      wp.conditionFloorBps,
      wp.seasonSeconds,
    ]));
  }

  if (target === "all" || target === "SneakerSwap") {
    const sneakerAddress = requireAddress(resolveAddress(deployments, "SneakerMint", "SNEAKER_MINT_ADDRESS"), "SNEAKER_MINT_ADDRESS", "SneakerSwap");
    const stakingAddress = requireAddress(resolveAddress(deployments, "SneakerStaking", "STAKING_VAULT_ADDRESS"), "STAKING_VAULT_ADDRESS", "SneakerSwap");
    const workshopAddress = resolveAddress(deployments, "SneakerWorkshop", "SNEAKER_WORKSHOP_ADDRESS");
    deployments.push(await deployContract(viem, "SneakerSwap", [
      addressEnv("SWAP_ADMIN_ADDRESS", admin),
      sneakerAddress,
      stakingAddress,
      workshopAddress,
    ]));
  }


  if (target === "all" || target === "ModStore") {
    const modsForStore = requireAddress(resolveAddress(deployments, "SneakerMods", "SNEAKER_MODS_ADDRESS"), "SNEAKER_MODS_ADDRESS", "ModStore");
    const modStoreDeployment = await deployContract(viem, "ModStore", [
      addressEnv("MOD_STORE_ADMIN_ADDRESS", admin),
      modsForStore,
      addressEnv("MOD_STORE_TREASURY_ADDRESS", admin),
    ]);
    deployments.push(modStoreDeployment);

    // The mod store mints on demand, so it needs MINTER_ROLE on SneakerMods.
    const mods = await viem.getContractAt("SneakerMods", modsForStore);
    const modsMinterRole = await mods.read.MINTER_ROLE();
    const modsHasRole = await mods.read.hasRole([modsMinterRole, modStoreDeployment.address]);
    if (!modsHasRole) {
      const hash = await mods.write.grantRole([modsMinterRole, modStoreDeployment.address], { account: wallet.account });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(`Granting MINTER_ROLE to ModStore failed (${hash}).`);
      console.log(`Granted MINTER_ROLE on SneakerMods to ModStore (${modStoreDeployment.address})`);
    }
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

  if (target === "all" || target === "PlayerProgress") {
    const sneakerAddress = requireAddress(resolveAddress(deployments, "SneakerMint", "SNEAKER_MINT_ADDRESS"), "SNEAKER_MINT_ADDRESS", "PlayerProgress");
    const modsAddress = requireAddress(resolveAddress(deployments, "SneakerMods", "SNEAKER_MODS_ADDRESS"), "SNEAKER_MODS_ADDRESS", "PlayerProgress");
    const gameAddress = requireAddress(resolveAddress(deployments, "SneakerGame", "SNEAKER_GAME_ADDRESS"), "SNEAKER_GAME_ADDRESS", "PlayerProgress");
    const marketplaceAddress = requireAddress(resolveAddress(deployments, "SneakerMarketplace", "MARKETPLACE_ADDRESS"), "MARKETPLACE_ADDRESS", "PlayerProgress");
    const workshopAddress = requireAddress(resolveAddress(deployments, "SneakerWorkshop", "SNEAKER_WORKSHOP_ADDRESS"), "SNEAKER_WORKSHOP_ADDRESS", "PlayerProgress");
    const stakingAddress = requireAddress(resolveAddress(deployments, "SneakerStaking", "STAKING_VAULT_ADDRESS"), "STAKING_VAULT_ADDRESS", "PlayerProgress");
    const pp = progressParameters();
    deployments.push(await deployContract(viem, "PlayerProgress", [
      addressEnv("PROGRESS_ADMIN_ADDRESS", admin),
      sneakerAddress,
      modsAddress,
      gameAddress,
      marketplaceAddress,
      workshopAddress,
      stakingAddress,
      pp.levelThresholds,
    ]));
  }

  if (target === "all" || target === "FeeSplitter") {
    const splitterDeployment = await deployContract(viem, "FeeSplitter", [addressEnv("FEE_SPLITTER_ADMIN_ADDRESS", admin)]);
    deployments.push(splitterDeployment);

    const splitter = await viem.getContractAt("FeeSplitter", splitterDeployment.address);
    const recipients = feeSplitterRecipients(admin);
    const setRecipientsHash = await splitter.write.setRecipients(
      [recipients, [4_000n, 3_000n, 2_000n, 1_000n]],
      { account: wallet.account },
    );
    const setRecipientsReceipt = await publicClient.waitForTransactionReceipt({ hash: setRecipientsHash });
    if (setRecipientsReceipt.status !== "success") throw new Error(`FeeSplitter recipient setup failed (${setRecipientsHash}).`);
    console.log("Configured FeeSplitter recipients with the recommended 40/30/20/10 split");
  }

  if (target === "all" || target === "SneakerVault") {
    const sneakerAddress = requireAddress(resolveAddress(deployments, "SneakerMint", "SNEAKER_MINT_ADDRESS"), "SNEAKER_MINT_ADDRESS", "SneakerVault");
    const modsAddress = requireAddress(resolveAddress(deployments, "SneakerMods", "SNEAKER_MODS_ADDRESS"), "SNEAKER_MODS_ADDRESS", "SneakerVault");
    const workshopAddress = requireAddress(resolveAddress(deployments, "SneakerWorkshop", "SNEAKER_WORKSHOP_ADDRESS"), "SNEAKER_WORKSHOP_ADDRESS", "SneakerVault");
    const stakingAddress = requireAddress(resolveAddress(deployments, "SneakerStaking", "STAKING_VAULT_ADDRESS"), "STAKING_VAULT_ADDRESS", "SneakerVault");
    const progressAddress = requireAddress(resolveAddress(deployments, "PlayerProgress", "PLAYER_PROGRESS_ADDRESS"), "PLAYER_PROGRESS_ADDRESS", "SneakerVault");
    const vaultDeployment = await deployContract(viem, "SneakerVault", [
      addressEnv("VAULT_ADMIN_ADDRESS", admin),
      sneakerAddress,
      modsAddress,
      sneakerAddress, // sneakerTraits = SneakerMint.traitsOf
      workshopAddress,
      stakingAddress,
      progressAddress,
    ]);
    deployments.push(vaultDeployment);

    const vault = await viem.getContractAt("SneakerVault", vaultDeployment.address);
    const vp = sneakerVaultParameters();
    const discountPerkHash = await vault.write.setPerk([
      0n, 0, vp.discountBps, vp.discountMinTier, vp.discountRequiredLevel,
      vp.discountMinPolStaked, vp.discountMinConditionBps, vp.discountMinModCount, true,
    ], { account: wallet.account });
    const discountPerkReceipt = await publicClient.waitForTransactionReceipt({ hash: discountPerkHash });
    if (discountPerkReceipt.status !== "success") throw new Error(`SneakerVault discount perk setup failed (${discountPerkHash}).`);

    const accessPerkHash = await vault.write.setPerk([
      1n, 1, 0, vp.accessMinTier, vp.accessRequiredLevel,
      vp.accessMinPolStaked, vp.accessMinConditionBps, vp.accessMinModCount, true,
    ], { account: wallet.account });
    const accessPerkReceipt = await publicClient.waitForTransactionReceipt({ hash: accessPerkHash });
    if (accessPerkReceipt.status !== "success") throw new Error(`SneakerVault access perk setup failed (${accessPerkHash}).`);
    console.log("Seeded SneakerVault perk 0 (discount) and perk 1 (exclusive access)");
  }

  if (target === "all" || target === "SneakerTabArena") {
    const sneakerAddress = requireAddress(resolveAddress(deployments, "SneakerMint", "SNEAKER_MINT_ADDRESS"), "SNEAKER_MINT_ADDRESS", "SneakerTabArena");
    const workshopAddress = requireAddress(resolveAddress(deployments, "SneakerWorkshop", "SNEAKER_WORKSHOP_ADDRESS"), "SNEAKER_WORKSHOP_ADDRESS", "SneakerTabArena");
    const stakingAddress = requireAddress(resolveAddress(deployments, "SneakerStaking", "STAKING_VAULT_ADDRESS"), "STAKING_VAULT_ADDRESS", "SneakerTabArena");
    const arenaSignerAddress = requireAddress(
      resolveAddress(deployments, "SneakerTabArena", "ARENA_SIGNER_ADDRESS"),
      "ARENA_SIGNER_ADDRESS",
      "SneakerTabArena",
    );
    deployments.push(await deployContract(viem, "SneakerTabArena", [
      addressEnv("ARENA_ADMIN_ADDRESS", admin),
      sneakerAddress,
      workshopAddress,
      stakingAddress,
      arenaSignerAddress,
    ]));
  }

  // ─── Upgrade economy wiring ────────────────────────────────────
  // Link the workshop as the boost provider, authorize it on the game/mods,
  // connect the tab arena, and allow the mods collection on the
  // marketplace and swap venue.
  const workshopAddress = resolveAddress(deployments, "SneakerWorkshop", "SNEAKER_WORKSHOP_ADDRESS");
  const arenaAddress = resolveAddress(deployments, "SneakerTabArena", "SNEAKER_TAB_ARENA_ADDRESS");
  const modsAddress = resolveAddress(deployments, "SneakerMods", "SNEAKER_MODS_ADDRESS");
  const gameAddress = resolveAddress(deployments, "SneakerGame", "SNEAKER_GAME_ADDRESS");
  const stakingAddress = resolveAddress(deployments, "SneakerStaking", "STAKING_VAULT_ADDRESS");
  const appraiserAddress = resolveAddress(deployments, "SneakerAppraiser", "SNEAKER_APPRAISER_ADDRESS");
  const marketplaceAddress = resolveAddress(deployments, "SneakerMarketplace", "MARKETPLACE_ADDRESS");
  const swapAddress = resolveAddress(deployments, "SneakerSwap", "SNEAKER_SWAP_ADDRESS");
  const modStoreAddress = resolveAddress(deployments, "ModStore", "MOD_STORE_ADDRESS");
  const veStoreAddress = resolveAddress(deployments, "VeSneakerStore", "VE_SNEAKER_STORE_ADDRESS");
  const progressAddress = resolveAddress(deployments, "PlayerProgress", "PLAYER_PROGRESS_ADDRESS");

  async function wire(name: string, write: () => Promise<`0x${string}`>) {
    const hash = await write();
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`Wiring failed for ${name} (${hash}).`);
    console.log(`Wired ${name}`);
  }

  const feeSplitterAddress = resolveAddress(deployments, "FeeSplitter", "FEE_SPLITTER_ADDRESS");
  if (feeSplitterAddress !== ZERO) {
    if (marketplaceAddress !== ZERO) {
      const marketplace = await viem.getContractAt("SneakerMarketplace", marketplaceAddress);
      const [feeBps, premiumBps, currentCollector] = await Promise.all([
        marketplace.read.feeBps(),
        marketplace.read.appraiserPremiumBps(),
        marketplace.read.feeCollector(),
      ]);
      if (currentCollector.toLowerCase() !== feeSplitterAddress.toLowerCase()) {
        await wire("SneakerMarketplace.feeCollector", () =>
          marketplace.write.updateParams([feeBps, premiumBps, feeSplitterAddress], { account: wallet.account }),
        );
      }
    }
  }

  if (workshopAddress !== ZERO) {
    if (gameAddress !== ZERO) {
      const game = await viem.getContractAt("SneakerGame", gameAddress);
      await wire("SneakerGame.boosts", () => game.write.setBoosts([workshopAddress], { account: wallet.account }));
      await wire("SneakerGame.workshop", () => game.write.setWorkshop([workshopAddress], { account: wallet.account }));
    }
    if (stakingAddress !== ZERO) {
      const staking = await viem.getContractAt("SneakerStaking", stakingAddress);
      await wire("SneakerStaking.boosts", () => staking.write.setBoosts([workshopAddress], { account: wallet.account }));
      if (arenaAddress !== ZERO) {
        const tabArenaRole = await staking.read.TAB_ARENA_ROLE();
        await wire("SneakerStaking.TAB_ARENA_ROLE", () =>
          staking.write.grantRole([tabArenaRole, arenaAddress], { account: wallet.account }),
        );
      }
    }
    if (appraiserAddress !== ZERO) {
      const appraiser = await viem.getContractAt("SneakerAppraiser", appraiserAddress);
      await wire("SneakerAppraiser.boosts", () => appraiser.write.setBoosts([workshopAddress], { account: wallet.account }));
    }
    if (modsAddress !== ZERO) {
      const mods = await viem.getContractAt("SneakerMods", modsAddress);
      await wire("SneakerMods.workshop", () => mods.write.setWorkshop([workshopAddress], { account: wallet.account }));
    }
    if (marketplaceAddress !== ZERO) {
      const marketplace = await viem.getContractAt("SneakerMarketplace", marketplaceAddress);
      await wire("SneakerMarketplace.workshop", () => marketplace.write.setWorkshop([workshopAddress], { account: wallet.account }));
    }
  }

  if (modsAddress !== ZERO) {
    if (marketplaceAddress !== ZERO) {
      const marketplace = await viem.getContractAt("SneakerMarketplace", marketplaceAddress);
      await wire("SneakerMarketplace.modsCollection", () => marketplace.write.setCollectionAllowed([modsAddress, true], { account: wallet.account }));
    }
    if (swapAddress !== ZERO) {
      const swap = await viem.getContractAt("SneakerSwap", swapAddress);
      await wire("SneakerSwap.modsCollection", () => swap.write.setCollectionAllowed([modsAddress, true], { account: wallet.account }));
    }
  }

  // ─── Player progression wiring ────────────────────────────────
  // Level-gated claims and store designs read PlayerProgress.levelOf.
  if (progressAddress !== ZERO) {
    if (modsAddress !== ZERO) {
      const mods = await viem.getContractAt("SneakerMods", modsAddress);
      await wire("SneakerMods.progress", () => mods.write.setProgress([progressAddress], { account: wallet.account }));
    }
    if (modStoreAddress !== ZERO) {
      const modStore = await viem.getContractAt("ModStore", modStoreAddress);
      await wire("ModStore.progress", () => modStore.write.setProgress([progressAddress], { account: wallet.account }));
    }
    if (veStoreAddress !== ZERO) {
      const veStore = await viem.getContractAt("VeSneakerStore", veStoreAddress);
      await wire("VeSneakerStore.progress", () => veStore.write.setProgress([progressAddress], { account: wallet.account }));
    }
  }

  // ─── Vault discount wiring ────────────────────────────────────
  // Stores apply the buyer's best vault discount at purchase time.
  const vaultAddress = resolveAddress(deployments, "SneakerVault", "SNEAKER_VAULT_ADDRESS");
  if (vaultAddress !== ZERO) {
    if (modStoreAddress !== ZERO) {
      const modStore = await viem.getContractAt("ModStore", modStoreAddress);
      await wire("ModStore.vault", () => modStore.write.setVault([vaultAddress], { account: wallet.account }));
    }
    if (veStoreAddress !== ZERO) {
      const veStore = await viem.getContractAt("VeSneakerStore", veStoreAddress);
      await wire("VeSneakerStore.vault", () => veStore.write.setVault([vaultAddress], { account: wallet.account }));
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
