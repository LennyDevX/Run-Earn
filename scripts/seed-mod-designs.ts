import hre from "hardhat";
import { parseEther, type Address } from "viem";
import { addressEnv, assertNetwork } from "./deployment-config.js";
import { MOD_ITEMS } from "../src/lib/mod-items.js";

/// ─────────────────────── Seed the mod catalogue on-chain ───────────────────
///
/// `ModStore` had **zero designs registered** while `mod-items.ts` advertised 28
/// items with prices. Nothing was purchasable: the catalogue existed only in the
/// browser.
///
/// This registers every catalogued item, and it **derives every field from the
/// catalogue** rather than repeating the numbers here. That is the whole point —
/// a hand-written seed script is how the UI ends up advertising one price while
/// the contract charges another, silently.
///
///   npx hardhat run scripts/seed-mod-designs.ts --network polygon
///
/// Idempotent: a design whose name already exists on-chain is skipped, so running
/// it twice does not duplicate the line.
const MAX_SUPPLY = 1000;

/// The metadata URI points at the artwork the catalogue already ships. On-chain
/// this is what a marketplace reads; the file lives in `public/items/`.
function uriFor(imageSrc: string) {
  const base = process.env.MOD_ASSET_BASE_URL?.trim().replace(/\/$/, "") ?? "";
  return `${base}${imageSrc}`;
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

  const storeAddress = addressEnv("MOD_STORE_ADDRESS", "0x0000000000000000000000000000000000000000" as Address);
  if (storeAddress === "0x0000000000000000000000000000000000000000") {
    throw new Error("MOD_STORE_ADDRESS is required.");
  }

  const store = await viem.getContractAt("ModStore", storeAddress);
  const existing = Number(await store.read.designCount());
  const taken = new Set<string>();
  for (let i = 0; i < existing; i += 1) {
    const design = await store.read.designs([BigInt(i)]);
    taken.add(design.name.toLowerCase());
  }

  console.log(`network  ${networkName}`);
  console.log(`store    ${storeAddress}`);
  console.log(`on-chain ${existing} design(s) already registered`);
  console.log(`catalogue ${MOD_ITEMS.length} item(s)\n`);

  let added = 0;
  let skipped = 0;

  for (const item of MOD_ITEMS) {
    if (taken.has(item.name.toLowerCase())) {
      skipped += 1;
      continue;
    }

    const hash = await store.write.addDesign(
      [
        {
          name: item.name,
          uri: uriFor(item.imageSrc),
          slot: item.slot,
          rarity: item.rarity,
          tier: item.tier,
          effectBps: item.effectBps,
          aux: item.aux ?? 0,
          // Every catalogued item is equippable. Consumables are a separate line
          // and are not part of `mod-items.ts`.
          consumable: false,
          price: parseEther(item.pricePol),
          maxSupply: MAX_SUPPLY,
          minted: 0,
          requiredLevel: 0,
          active: true,
        },
      ],
      { account: wallet.account },
    );
    await publicClient.waitForTransactionReceipt({ hash });
    added += 1;
    console.log(`  added  ${item.name.padEnd(22)} slot ${item.slot} · tier ${item.tier} · ${item.pricePol} POL`);
  }

  const after = Number(await store.read.designCount());
  console.log(`\n${added} added, ${skipped} already present. ModStore now holds ${after} design(s).`);
  if (after !== MOD_ITEMS.length) {
    console.log("\nCounts differ — check for duplicate names in the catalogue.");
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
