import hre from "hardhat";
import { getAddress, type Address } from "viem";
import {
  addressEnv,
  assertNetwork,
  assertSignerBalance,
  bigintEnv,
  optionalEnv,
  polUsdPrice,
  veSneakerDesigns,
  veSneakerTokenUri,
  VE_TIER_LABEL,
} from "./deployment-config.js";

/// Configures the 9 veSneaker designs on VeSneakerStore and optionally
/// pre-mints copies to a recipient.
///
///   VE_MINT_MODE=configure   register the designs only (default)
///   VE_MINT_MODE=premint     reserve copies to VE_MINT_RECIPIENT
///   VE_MINT_MODE=both        register, then reserve
///
///   VE_MINT_QUANTITY=0       copies per design to reserve (0 = skip, max 20/tx)
///   VE_MINT_RECIPIENT=       default: the treasury
///
/// Example:
///   $env:VE_MINT_MODE="both"; $env:VE_MINT_QUANTITY="25"; npx hardhat run scripts/mint-veSneakers.ts --network amoy
const MODES = new Set(["configure", "premint", "both"]);
const MAX_BATCH = 20; // matches VeSneakerStore.MAX_BATCH

function modeFromEnvironment() {
  const mode = optionalEnv("VE_MINT_MODE", "configure") as string;
  if (!MODES.has(mode)) {
    throw new Error(`VE_MINT_MODE must be one of: ${[...MODES].join(", ")}.`);
  }
  return mode;
}

function formatPol(value: bigint) {
  return (Number(value) / 1e18).toFixed(4);
}

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
  await assertSignerBalance(publicClient, wallet, bigintEnv("MIN_DEPLOYER_BALANCE_WEI", 0n));

  const storeAddress = addressEnv("VE_SNEAKER_STORE_ADDRESS", "0x0000000000000000000000000000000000000000" as Address);
  if (storeAddress === "0x0000000000000000000000000000000000000000") {
    throw new Error("VE_SNEAKER_STORE_ADDRESS is required (deploy VeSneakerStore first or set the address).");
  }
  const store = await viem.getContractAt("VeSneakerStore", storeAddress);

  const mode = modeFromEnvironment();
  const designs = veSneakerDesigns();
  const polUsd = polUsdPrice();

  console.log(`VeSneakerStore: ${storeAddress}`);
  console.log(`Mode: ${mode} | Designs: ${designs.length} | POL/USD: $${polUsd}`);
  console.log("");

  if (mode === "configure" || mode === "both") {
    const existing = await store.read.designCount();
    console.log(`Existing designs on-chain: ${existing}`);
    if (existing > 0n) {
      console.log("Designs already registered — skipping configuration (use updateDesign to change prices).");
    } else {
      for (const [index, design] of designs.entries()) {
        const uri = veSneakerTokenUri(design, index);
        const usd = (Number(design.pricePol) / 1e18) * polUsd;
        console.log(
          `Adding design ${index}: ${design.name} | ${VE_TIER_LABEL[design.tier]} (rarity ${design.rarity}) | ` +
          `${formatPol(design.pricePol)} POL (~$${usd.toFixed(3)}) | supply ${design.maxSupply}`,
        );
        const hash = await store.write.addDesign(
          [design.name, uri, design.rarity, design.tier, design.pricePol, design.maxSupply],
          { account: wallet.account },
        );
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error(`addDesign failed for ${design.name} (${hash}).`);
      }
      const total = await store.read.designCount();
      console.log(`\nRegistered ${total} designs.`);
    }
  }

  if (mode === "premint" || mode === "both") {
    const quantity = Number(bigintEnv("VE_MINT_QUANTITY", 0n));
    if (quantity <= 0) {
      console.log("VE_MINT_QUANTITY is 0 — nothing to reserve.");
    } else {
      const treasury = await store.read.treasury();
      const recipient = getAddress(optionalEnv("VE_MINT_RECIPIENT", treasury) ?? treasury);
      const count = await store.read.designCount();
      console.log(`\nReserving ${quantity} copies per design to ${recipient} (${count} designs)...`);

      for (let index = 0; index < Number(count); index++) {
        const design = await store.read.designs([BigInt(index)]);
        let remaining = quantity;
        while (remaining > 0) {
          const batch = Math.min(remaining, MAX_BATCH);
          const hash = await store.write.reserveMint([BigInt(index), recipient, batch], { account: wallet.account });
          const receipt = await publicClient.waitForTransactionReceipt({ hash });
          if (receipt.status !== "success") throw new Error(`reserveMint failed for design ${index} (${hash}).`);
          remaining -= batch;
        }
        const after = await store.read.designs([BigInt(index)]);
        console.log(
          `  ${design.name}: reserved ${quantity} | minted ${after.minted}/${after.maxSupply} | remaining ${after.maxSupply - after.minted}`,
        );
      }
      console.log("\nPre-mint complete.");
    }
  }

  console.log("\nNext: configure NEXT_PUBLIC_VE_SNEAKER_STORE_ADDRESS and open /collection to sell on demand.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
