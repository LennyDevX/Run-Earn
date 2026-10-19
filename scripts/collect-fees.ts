import hre from "hardhat";
import { formatEther, type Address } from "viem";
import { addressEnv, assertNetwork } from "./deployment-config.js";

/// ───────────────────── Collect marketplace fees to the treasury ────────────
///
/// Marketplace revenue does **not** reach the treasury on its own. Two steps sit
/// between a sale and the money arriving, and only the first one is privileged:
///
///   1. `SneakerMarketplace.withdrawFeesToCollector()` — ADMIN ONLY. Moves the
///      2.5% accrued on each sale out of the marketplace and into the
///      FeeSplitter.
///   2. `FeeSplitter.distribute()` — permissionless. Splits the balance to the
///      recipients.
///
/// Skip step 1 and the fees sit in the marketplace indefinitely: the contract
/// keeps them, nothing reverts, and the treasury balance stays at zero with no
/// error anywhere. That is the failure this script exists to close.
///
///   npx hardhat run scripts/collect-fees.ts --network polygon
///
/// Run it with the admin key. Step 2 needs no privilege, so a keeper holding only
/// that key can be used for it — but as one script it needs both.

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

  const ZERO = "0x0000000000000000000000000000000000000000" as Address;
  const marketplaceAddress = addressEnv("MARKETPLACE_ADDRESS", ZERO);
  const splitterAddress = addressEnv("FEE_SPLITTER_ADDRESS", ZERO);
  if (marketplaceAddress === ZERO || splitterAddress === ZERO) {
    throw new Error("MARKETPLACE_ADDRESS and FEE_SPLITTER_ADDRESS are both required.");
  }

  const marketplace = await viem.getContractAt("SneakerMarketplace", marketplaceAddress);
  const splitter = await viem.getContractAt("FeeSplitter", splitterAddress);

  console.log(`network      ${networkName}`);
  console.log(`marketplace  ${marketplaceAddress}`);
  console.log(`splitter     ${splitterAddress}`);
  console.log(`signer       ${wallet.account.address}\n`);

  // ── Step 1: marketplace -> splitter (admin only) ───────────────────
  const accrued = (await marketplace.read.accumulatedFees()) as bigint;
  console.log(`marketplace.accumulatedFees()  ${formatEther(accrued)} POL`);

  if (accrued === 0n) {
    console.log("  nothing accrued — skipping the withdraw\n");
  } else {
    const adminRole = await marketplace.read.DEFAULT_ADMIN_ROLE();
    const isAdmin = await marketplace.read.hasRole([adminRole, wallet.account.address]);
    if (!isAdmin) {
      throw new Error(
        `${wallet.account.address} does not hold DEFAULT_ADMIN_ROLE on the marketplace, so it cannot withdraw the fees.`,
      );
    }
    const hash = await marketplace.write.withdrawFeesToCollector({ account: wallet.account });
    console.log(`  withdrawFeesToCollector tx ${hash}`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`withdrawFeesToCollector failed (${hash}).`);
    console.log(`  gas ${receipt.gasUsed.toString()}\n`);
  }

  // ── Step 2: splitter -> recipients (permissionless) ────────────────
  const pending = (await splitter.read.pendingFees()) as bigint;
  console.log(`splitter.pendingFees()         ${formatEther(pending)} POL`);

  if (pending === 0n) {
    console.log("  nothing to distribute — skipping\n");
  } else {
    const hash = await splitter.write.distribute({ account: wallet.account });
    console.log(`  distribute tx ${hash}`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`distribute failed (${hash}).`);
    console.log(`  gas ${receipt.gasUsed.toString()}\n`);
  }

  // ── Final state ────────────────────────────────────────────────────
  const treasury = addressEnv("TREASURY_ADDRESS", wallet.account.address);
  console.log("=== after ===");
  console.log(`  marketplace  ${formatEther((await marketplace.read.accumulatedFees()) as bigint)} POL`);
  console.log(`  splitter     ${formatEther((await splitter.read.pendingFees()) as bigint)} POL`);
  console.log(`  treasury     ${formatEther(await publicClient.getBalance({ address: treasury }))} POL`);

  if (accrued === 0n && pending === 0n) {
    console.log("\nNothing moved. That is the expected result with no sales yet — this");
    console.log("script is a keeper, not a one-off: run it after trading starts.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
