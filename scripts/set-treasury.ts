import hre from "hardhat";
import { formatEther, type Address } from "viem";
import { addressEnv, assertNetwork } from "./deployment-config.js";

/// ─────────────────────── Repoint the treasury everywhere ───────────────────
///
/// Every contract that pays out, in one run. It supersedes the splitter-only
/// script: the treasury is one address, and repointing half of it is how a
/// deployment ends up paying two different places.
///
/// **Idempotent.** Each step is skipped when the contract already points at the
/// destination, so a second run sends no transactions and says so.
///
///   npx hardhat run scripts/set-treasury.ts --network polygon
///
/// Reads the destination from `TREASURY_ADDRESS`. Every call is
/// `DEFAULT_ADMIN_ROLE`, so the signer must be the admin.

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

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

  const treasury = addressEnv("TREASURY_ADDRESS", ZERO);
  if (treasury === ZERO) throw new Error("TREASURY_ADDRESS is required.");

  const storeAddress = addressEnv("VE_SNEAKER_STORE_ADDRESS", ZERO);
  const modStoreAddress = addressEnv("MOD_STORE_ADDRESS", ZERO);
  const splitterAddress = addressEnv("FEE_SPLITTER_ADDRESS", ZERO);

  console.log(`network    ${networkName}`);
  console.log(`treasury   ${treasury}`);
  console.log(`signer     ${wallet.account.address}\n`);

  let changed = 0;

  async function apply(label: string, current: string, write: () => Promise<`0x${string}`>) {
    if (current.toLowerCase() === treasury.toLowerCase()) {
      console.log(`  ${label.padEnd(28)} already correct — skipped`);
      return;
    }
    console.log(`  ${label.padEnd(28)} ${current} -> ${treasury}`);
    const hash = await write();
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`${label} failed (${hash}).`);
    console.log(`  ${" ".repeat(28)} tx ${hash}  gas ${receipt.gasUsed.toString()}`);
    changed++;
  }

  // ── Primary sales ──────────────────────────────────────────────────
  console.log("=== primary sale treasuries ===");
  if (storeAddress === ZERO) {
    console.log("  VeSneakerStore: no address configured — skipped");
  } else {
    const store = await viem.getContractAt("VeSneakerStore", storeAddress);
    await apply("VeSneakerStore.treasury", await store.read.treasury(), () =>
      store.write.setTreasury([treasury], { account: wallet.account }),
    );
  }
  if (modStoreAddress === ZERO) {
    console.log("  ModStore: no address configured — skipped");
  } else {
    const modStore = await viem.getContractAt("ModStore", modStoreAddress);
    await apply("ModStore.treasury", await modStore.read.treasury(), () =>
      modStore.write.setTreasury([treasury], { account: wallet.account }),
    );
  }

  // ── Marketplace fee recipients ─────────────────────────────────────
  console.log("\n=== FeeSplitter recipients ===");
  if (splitterAddress === ZERO) {
    console.log("  FeeSplitter: no address configured — skipped");
  } else {
    const splitter = await viem.getContractAt("FeeSplitter", splitterAddress);
    const count = Number(await splitter.read.recipientCount());
    const current: string[] = [];
    for (let i = 0; i < count; i++) {
      const [account, weightBps] = await splitter.read.recipientAt([BigInt(i)]);
      current.push(`${account} @ ${(Number(weightBps) / 100).toFixed(2)}%`);
    }
    const alreadySingle = count === 1 && (await splitter.read.recipientAt([0n]))[0].toLowerCase() === treasury.toLowerCase();
    if (alreadySingle) {
      console.log("  FeeSplitter.recipients        already correct — skipped");
    } else {
      console.log(`  FeeSplitter.recipients        ${current.join(", ")}`);
      console.log(`  ${" ".repeat(28)} -> [${treasury}] @ 100.00%`);
      const hash = await splitter.write.setRecipients([[treasury], [10_000n]], { account: wallet.account });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(`setRecipients failed (${hash}).`);
      console.log(`  ${" ".repeat(28)} tx ${hash}  gas ${receipt.gasUsed.toString()}`);
      changed++;
    }
  }

  // ── Verify ─────────────────────────────────────────────────────────
  console.log("\n=== after ===");
  if (storeAddress !== ZERO) {
    const store = await viem.getContractAt("VeSneakerStore", storeAddress);
    console.log(`  VeSneakerStore.treasury       ${await store.read.treasury()}`);
  }
  if (modStoreAddress !== ZERO) {
    const modStore = await viem.getContractAt("ModStore", modStoreAddress);
    console.log(`  ModStore.treasury             ${await modStore.read.treasury()}`);
  }
  if (splitterAddress !== ZERO) {
    const splitter = await viem.getContractAt("FeeSplitter", splitterAddress);
    const [account, weightBps] = await splitter.read.recipientAt([0n]);
    console.log(`  FeeSplitter.recipient[0]      ${account} @ ${(Number(weightBps) / 100).toFixed(2)}%`);
  }
  console.log(`  treasury balance              ${formatEther(await publicClient.getBalance({ address: treasury }))} POL`);

  console.log(
    changed === 0
      ? "\nNothing to change — the treasury was already wired to this address."
      : `\n${changed} transaction(s) sent. Verify with scripts/treasury-audit.ts`,
  );

  // ── The step this script cannot do ─────────────────────────────────
  console.log("\n=== not covered here ===");
  console.log("  X402_PAY_TO is an environment variable, not an on-chain address.");
  console.log("  It routes the AI-generation payments, so it must be updated in .env");
  console.log("  and the deployment re-issued for the change to take effect.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
