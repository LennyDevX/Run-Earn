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

/// Polygon token addresses used for the POL/USD probe (same pair as
/// `src/lib/uniswap.ts`).
const WPOL_ADDRESS = "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270";
const USDC_ADDRESS = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
const PROBE_AMOUNT_POL = 1_000n;

const AGENT_INFO = JSON.stringify({
  integration_name: "swap-integration",
  decision_origin: "human_mediated",
  version: "1.5.0",
});

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

/// Reads the live POL/USD price from the Uniswap Trading API so on-chain prices
/// are computed against the current market instead of a stale constant.
/// Returns null when the key is missing or the quote fails.
async function livePolUsdPrice(): Promise<number | null> {
  const apiKey = optionalEnv("UNISWAP_API_KEY");
  if (!apiKey) return null;

  const base = optionalEnv("UNISWAP_TRADING_API_URL", "https://trade-api.gateway.uniswap.org/v1");
  const swapper =
    optionalEnv("UNISWAP_QUOTE_SWAPPER") ??
    optionalEnv("DEPLOY_ADMIN_ADDRESS") ??
    "0x0000000000000000000000000000000000000000";
  if (!/^0x[a-fA-F0-9]{40}$/.test(swapper)) return null;

  try {
    const response = await fetch(`${base}/quote`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-api-key": apiKey,
        "x-universal-router-version": "2.0",
        "x-agent-info": AGENT_INFO,
      },
      body: JSON.stringify({
        swapper,
        tokenIn: WPOL_ADDRESS,
        tokenOut: USDC_ADDRESS,
        tokenInChainId: "137",
        tokenOutChainId: "137",
        amount: (PROBE_AMOUNT_POL * 10n ** 18n).toString(),
        type: "EXACT_INPUT",
        slippageTolerance: 0.5,
        protocols: ["V2", "V3"],
      }),
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as {
      quote?: { output?: { amount?: string }; orderInfo?: { outputs?: { startAmount?: string }[] } };
    };
    const raw = payload.quote?.output?.amount ?? payload.quote?.orderInfo?.outputs?.[0]?.startAmount;
    if (!raw) return null;

    const usdcOut = BigInt(raw);
    if (usdcOut <= 0n) return null;
    const usd = Number(usdcOut) / 1e6 / Number(PROBE_AMOUNT_POL);
    return Number.isFinite(usd) && usd > 0 ? usd : null;
  } catch {
    return null;
  }
}

/// Resolves the POL/USD rate used for USD→POL conversion. Prefers the live
/// Uniswap quote; set `VE_USE_LIVE_POL_PRICE=false` to pin `POL_USD_PRICE`.
async function resolvePolUsdPrice(): Promise<void> {
  if (optionalEnv("VE_USE_LIVE_POL_PRICE", "true") === "false") {
    console.log(`POL/USD: $${polUsdPrice()} (pinned via POL_USD_PRICE)`);
    return;
  }
  const live = await livePolUsdPrice();
  if (live === null) {
    console.log(`POL/USD: $${polUsdPrice()} (live quote unavailable, using POL_USD_PRICE)`);
    return;
  }
  process.env.POL_USD_PRICE = String(live);
  console.log(`POL/USD: $${live.toFixed(5)} (live from Uniswap)`);
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
  await resolvePolUsdPrice();
  const designs = veSneakerDesigns();
  const polUsd = polUsdPrice();

  console.log(`VeSneakerStore: ${storeAddress}`);
  console.log(`Mode: ${mode} | Designs: ${designs.length} | POL/USD: $${polUsd}`);
  console.log("");

  if (mode === "configure" || mode === "both") {
    const existing = await store.read.designCount();
    console.log(`Existing designs on-chain: ${existing}`);
    if (existing > 0n) {
      console.log("Designs already registered — skipping registration.");
      if (process.env.VE_UPDATE_DESIGN_URIS === "true") {
        const updateCount = Math.min(Number(existing), designs.length);
        for (let index = 0; index < updateCount; index++) {
          const uri = veSneakerTokenUri(designs[index], index);
          const hash = await store.write.updateDesignUri([BigInt(index), uri], { account: wallet.account });
          const receipt = await publicClient.waitForTransactionReceipt({ hash });
          if (receipt.status !== "success") throw new Error(`updateDesignUri failed for ${designs[index].name} (${hash}).`);
          console.log(`Updated artwork metadata URI for design ${index}: ${designs[index].name}`);
        }
      }
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
      const familyCount = Math.min(Number(count), designs.length);
      console.log(`\nReserving ${quantity} copies per family to ${recipient} (${familyCount} designs)...`);

      for (let index = 0; index < familyCount; index++) {
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
