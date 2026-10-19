import hre from "hardhat";
import { formatEther, type Address } from "viem";
import { addressEnv, assertNetwork } from "./deployment-config.js";

/// ─────────────────────── Treasury yield planner (read-only) ────────────────
///
/// Reports the POL sitting idle in Airen's treasury contracts and what it would
/// earn if it were in liquid staking.
///
/// **This script moves nothing.** Phase 3.1 is written as "a sweep script", but
/// the destination is a treasury policy decision, not an implementation detail —
/// see the trade-off printed at the end. Reporting the numbers is the part that
/// is unambiguously useful and safe; moving funds is not something a script
/// should decide.
///
///   npx hardhat run scripts/treasury-yield.ts --network polygon
///
/// Two idle pools, and they are not equivalent:
///
/// 1. `FeeSplitter.pendingFees()` — marketplace fees that belong to the fee
///    recipients, not to the protocol. Sweeping this into a yield position would
///    be taking custody of money owed to someone else. It is listed because the
///    balance is real and the recipients may prefer to be paid in sPOL rather
///    than POL, but that is a change to what `distribute()` pays out.
///
/// 2. `SneakerStaking.availablePOLRewards()` — funded reserve above the user
///    principal. This is the protocol's own money and the one that can be put to
///    work without touching anyone's balance.
///
/// **Why this is not simply "call the liquid staking contract":** sPOL lives on
/// Ethereum mainnet (`0x3B790d651e950497c7723D47B24E6f61534f7969`) and Polygon
/// PoS staking itself is managed from Ethereum. The treasury is on Polygon. Using
/// sPOL means bridging — cost, delay, and bridge risk. Polygon-native LSTs
/// (stMATIC, MaticX) stay on-chain but are a different counterparty. That is the
/// decision this script exists to inform.

/// Illustrative, not a quote. Used only to size the opportunity.
const ASSUMED_LST_APY_BPS = 300n;

function formatPol(value: bigint, digits = 4) {
  const num = Number(formatEther(value));
  return num.toLocaleString("en-US", { maximumFractionDigits: digits });
}

function bpsToPercent(bps: bigint) {
  return `${(Number(bps) / 100).toFixed(2)}%`;
}

async function main() {
  const connection = await hre.network.create();
  const { viem } = connection;
  const publicClient = await viem.getPublicClient();

  const networkName = connection.networkName;
  if (networkName !== "polygon" && networkName !== "amoy") {
    throw new Error("Use --network polygon or --network amoy.");
  }
  await assertNetwork(publicClient, networkName);

  const splitterAddress = addressEnv("FEE_SPLITTER_ADDRESS", "0x0000000000000000000000000000000000000000" as Address);
  const stakingAddress = addressEnv("STAKING_VAULT_ADDRESS", "0x0000000000000000000000000000000000000000" as Address);

  console.log(`Network: ${networkName}\n`);

  let totalIdle = 0n;

  // ── 1. Marketplace fees awaiting distribution ──────────────────────
  console.log("=== FeeSplitter (marketplace fees) ===");
  if (splitterAddress === "0x0000000000000000000000000000000000000000") {
    console.log("  FEE_SPLITTER_ADDRESS is not set — skipping.\n");
  } else {
    const splitter = await viem.getContractAt("FeeSplitter", splitterAddress);
    const pending = (await splitter.read.pendingFees()) as bigint;
    const contractBalance = await publicClient.getBalance({ address: splitterAddress });
    const count = Number((await splitter.read.recipientCount()) as bigint);

    console.log(`  address            ${splitterAddress}`);
    console.log(`  pendingFees()      ${formatPol(pending)} POL`);
    console.log(`  contract balance   ${formatPol(contractBalance)} POL`);
    console.log(`  recipients         ${count}`);

    if (pending > 0n) {
      console.log("\n  Not protocol money — it belongs to the recipients.");
      console.log("  Sweeping it would be taking custody of funds owed to someone else.");
      console.log("  A legitimate version of this is paying them in a yield-bearing asset");
      console.log("  instead of POL, which changes what distribute() pays out.");
    }
    console.log("");
  }

  // ── 2. Staking reward reserve above user principal ─────────────────
  console.log("=== SneakerStaking (reward reserve surplus) ===");
  if (stakingAddress === "0x0000000000000000000000000000000000000000") {
    console.log("  STAKING_VAULT_ADDRESS is not set — skipping.\n");
  } else {
    const staking = await viem.getContractAt("SneakerStaking", stakingAddress);
    const surplus = (await staking.read.availablePOLRewards()) as bigint;
    const contractBalance = await publicClient.getBalance({ address: stakingAddress });

    console.log(`  address                  ${stakingAddress}`);
    console.log(`  availablePOLRewards()    ${formatPol(surplus)} POL   <- protocol money`);
    console.log(`  contract balance         ${formatPol(contractBalance)} POL`);

    totalIdle += surplus;
    console.log("");
  }

  // ── Sizing ─────────────────────────────────────────────────────────
  const yearly = (totalIdle * ASSUMED_LST_APY_BPS) / 10_000n;
  console.log("=== What the protocol's own idle POL would earn ===");
  console.log(`  idle (protocol money)    ${formatPol(totalIdle)} POL`);
  console.log(`  assumed LST APY          ${bpsToPercent(ASSUMED_LST_APY_BPS)}  (illustrative, not a quote)`);
  console.log(`  per year                 ${formatPol(yearly)} POL`);
  console.log(`  per month                ${formatPol(yearly / 12n)} POL`);
  console.log("");
  console.log("  Compare that against the staking reserve's own budget: the APY it");
  console.log("  pays is a liability funded by whoever tops it up. Yield turns part of");
  console.log("  that liability into a self-funding one.");
  console.log("");

  // ── The decision this script cannot make ───────────────────────────
  console.log("=== The decision, before anything is swept ===");
  console.log("  sPOL          Ethereum mainnet, 0x3B790d65…  -> needs a bridge from Polygon");
  console.log("  stMATIC       Polygon-native (Lido)          -> no bridge, different counterparty");
  console.log("  MaticX        Polygon-native (Stader)        -> no bridge, different counterparty");
  console.log("");
  console.log("  Bridging adds cost, delay, and bridge risk to money that is currently");
  console.log("  sitting safely on Polygon. A Polygon-native LST avoids all three but");
  console.log("  means trusting a different protocol.");
  console.log("");
  console.log("  Neither is obviously right, which is why this script reports and stops.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
