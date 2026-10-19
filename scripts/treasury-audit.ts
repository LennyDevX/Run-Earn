import hre from "hardhat";
import { formatEther, parseAbi, type Address } from "viem";

/// ───────────────────────── Treasury wiring audit ───────────────────────────
///
/// Prints every address protocol money can land in, read from the contracts
/// rather than from `.env`. The two disagree more often than you would expect —
/// the deploy script fills unset treasury variables with the admin address, so a
/// deployment that "never configured a treasury" usually did, silently.
///
///   npx hardhat run scripts/treasury-audit.ts --network polygon
///
/// Run it before any admin transaction that changes a payout address, and after
/// every redeploy. It is the cheap way to answer "where does the money go?"
/// without reading Solidity.

const ABI = parseAbi([
  "function treasury() view returns (address)",
  "function feeCollector() view returns (address)",
  "function recipientCount() view returns (uint256)",
  "function recipientAt(uint256 index) view returns (address account, uint256 weightBps)",
  "function pendingFees() view returns (uint256)",
]);

const ERC20 = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function symbol() view returns (string)",
]);

/// Polygon mainnet stablecoins. Worth watching because x402 settles in USDC and
/// the marketplace may accept it later.
const STABLES: Array<[string, Address]> = [
  ["USDC", "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"],
  ["USDC.e", "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"],
];

const short = (value: string) => `${value.slice(0, 10)}…${value.slice(-6)}`;

async function main() {
  const connection = await hre.network.create();
  const { viem } = connection;
  const publicClient = await viem.getPublicClient();

  const env = process.env;
  const treasury = env.TREASURY_ADDRESS?.trim() ?? "";
  console.log(`Network: ${connection.networkName}`);
  if (treasury) console.log(`TREASURY_ADDRESS: ${treasury}`);
  console.log("");

  const rows: Array<[string, Address | undefined, string]> = [
    ["VeSneakerStore", env.NEXT_PUBLIC_VE_SNEAKER_STORE_ADDRESS as Address, "treasury"],
    ["ModStore", env.NEXT_PUBLIC_MOD_STORE_ADDRESS as Address, "treasury"],
    ["SneakerMarketplace", env.NEXT_PUBLIC_SNEAKER_MARKETPLACE_ADDRESS as Address, "feeCollector"],
    ["FeeSplitter", env.NEXT_PUBLIC_FEE_SPLITTER_ADDRESS as Address, "splitter"],
  ];

  const seen = new Map<string, string[]>();

  for (const [name, address, kind] of rows) {
    if (!address) {
      console.log(`${name}: no address configured`);
      continue;
    }
    console.log(`=== ${name}  ${short(address)} ===`);
    console.log(`  balance  ${formatEther(await publicClient.getBalance({ address }))} POL`);

    try {
      if (kind === "splitter") {
        const pending = (await publicClient.readContract({
          address,
          abi: ABI,
          functionName: "pendingFees",
        })) as bigint;
        const count = Number(
          (await publicClient.readContract({ address, abi: ABI, functionName: "recipientCount" })) as bigint,
        );
        console.log(`  pending  ${formatEther(pending)} POL`);
        for (let i = 0; i < count; i++) {
          const [account, weightBps] = (await publicClient.readContract({
            address,
            abi: ABI,
            functionName: "recipientAt",
            args: [BigInt(i)],
          })) as readonly [Address, bigint];
          console.log(`  [${i}]      ${short(account)}  ${(Number(weightBps) / 100).toFixed(2)}%`);
          seen.set(account.toLowerCase(), [...(seen.get(account.toLowerCase()) ?? []), `splitter[${i}]`]);
        }
      } else {
        const target = (await publicClient.readContract({
          address,
          abi: ABI,
          functionName: kind as "treasury" | "feeCollector",
        })) as Address;
        console.log(`  ${kind.padEnd(8)} ${short(target)}`);
        seen.set(target.toLowerCase(), [...(seen.get(target.toLowerCase()) ?? []), `${name}.${kind}`]);
      }
    } catch (error) {
      console.log(`  read failed — ${error instanceof Error ? error.message : error}`);
    }
    console.log("");
  }

  // ── Does the money actually separate? ──────────────────────────────
  console.log("=== distinct payout addresses ===");
  if (seen.size === 0) {
    console.log("  none found");
  }
  for (const [address, roles] of seen) {
    console.log(`  ${short(address)}  ${roles.join(", ")}`);
  }
  if (seen.size === 1) {
    console.log("");
    console.log("  Every payout lands in ONE address. A 40/30/20/10 split pointed at a");
    console.log("  single wallet is not a split — it is four transfers per distribute()");
    console.log("  that pay the same place. Either give the slots distinct addresses or");
    console.log("  collapse the splitter to a single 100% recipient and stop paying gas");
    console.log("  for three pointless transfers.");
  }

  // ── Balances ───────────────────────────────────────────────────────
  if (treasury) {
    console.log("");
    console.log("=== treasury balances ===");
    console.log(`  POL  ${formatEther(await publicClient.getBalance({ address: treasury as Address }))}`);
    for (const [label, token] of STABLES) {
      const [balance, symbol] = await Promise.all([
        publicClient.readContract({
          address: token,
          abi: ERC20,
          functionName: "balanceOf",
          args: [treasury as Address],
        }),
        publicClient.readContract({ address: token, abi: ERC20, functionName: "symbol" }),
      ]);
      console.log(`  ${label.padEnd(6)} ${(Number(balance) / 1e6).toFixed(6)} ${symbol}`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
