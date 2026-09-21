import hre from "hardhat";
import { createWalletClient, formatEther, formatUnits, getAddress, http, parseEther, parseUnits, type Address, type Hex, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygon, polygonAmoy } from "viem/chains";
import {
  addressEnv,
  assertNetwork,
  assertSignerBalance,
  loadDeployment,
  optionalEnv,
} from "./deployment-config.js";

const stakingFundingAbi = [
  { type: "function", name: "DEFAULT_ADMIN_ROLE", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "bytes32" }] },
  { type: "function", name: "fundPOLRewards", stateMutability: "payable", inputs: [], outputs: [] },
  { type: "function", name: "availablePOLRewards", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
] as const;

const runeAbi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint8" }] },
  { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
] as const;

function deploymentAddress(networkName: string, name: "RENToken" | "SneakerStaking") {
  try {
    return loadDeployment(networkName).contracts[name]?.address;
  } catch {
    return undefined;
  }
}

async function main() {
  const connection = await hre.network.create();
  const { viem } = connection;
  const publicClient = await viem.getPublicClient();
  const [deployerWallet] = await viem.getWalletClients();
  if (!deployerWallet.account) throw new Error("No deployment wallet is configured.");

  const networkName = connection.networkName;
  if (networkName !== "polygon" && networkName !== "amoy") {
    throw new Error("Use --network polygon or --network amoy for funding.");
  }
  await assertNetwork(publicClient, networkName);

  const fundingPrivateKey = optionalEnv("FUNDING_PRIVATE_KEY");
  const rpcUrl = networkName === "amoy" ? optionalEnv("POLYGON_AMOY_RPC_URL") : optionalEnv("POLYGON_RPC_URL");
  let wallet: WalletClient;
  if (fundingPrivateKey) {
    if (!rpcUrl) throw new Error("FUNDING_PRIVATE_KEY requires POLYGON_RPC_URL or POLYGON_AMOY_RPC_URL.");
    const account = privateKeyToAccount(fundingPrivateKey as Hex);
    wallet = createWalletClient({
      account,
      chain: publicClient.chain ?? (networkName === "amoy" ? polygonAmoy : polygon),
      transport: http(rpcUrl),
    });
  } else {
    wallet = deployerWallet;
  }
  if (!wallet.account) throw new Error("No funding wallet is configured.");

  const fundingWallet = getAddress(wallet.account.address);
  const expectedFundingWallet = optionalEnv("FUNDING_WALLET_ADDRESS");
  if (expectedFundingWallet && getAddress(expectedFundingWallet) !== fundingWallet) {
    throw new Error(`Configured funding wallet ${expectedFundingWallet} does not match the signer ${fundingWallet}.`);
  }

  const stakingAddress = addressEnv(
    "STAKING_VAULT_ADDRESS",
    deploymentAddress(networkName, "SneakerStaking") ?? "0x0000000000000000000000000000000000000000" as Address,
  );
  const asset = (optionalEnv("FUND_ASSET", "POL") ?? "POL").toUpperCase();
  const amountText = optionalEnv("FUND_AMOUNT");
  if (!amountText) throw new Error("Set FUND_AMOUNT, for example FUND_AMOUNT=10.");
  if (Number(amountText) <= 0) throw new Error("FUND_AMOUNT must be greater than zero.");

  if (asset === "POL") {
    const amount = parseEther(amountText);
    await assertSignerBalance(publicClient, wallet, amount);
    const adminRole = await publicClient.readContract({ address: stakingAddress, abi: stakingFundingAbi, functionName: "DEFAULT_ADMIN_ROLE" });
    const isAdmin = await publicClient.readContract({ address: stakingAddress, abi: [{ type: "function", name: "hasRole", stateMutability: "view", inputs: [{ name: "role", type: "bytes32" }, { name: "account", type: "address" }], outputs: [{ name: "", type: "bool" }] }] as const, functionName: "hasRole", args: [adminRole, fundingWallet] });
    if (!isAdmin) throw new Error("The funding wallet does not have DEFAULT_ADMIN_ROLE on SneakerStaking.");

    const before = await publicClient.readContract({ address: stakingAddress, abi: stakingFundingAbi, functionName: "availablePOLRewards" });
    console.log(`Funding ${formatEther(amount)} POL from ${fundingWallet} into ${stakingAddress}...`);
    const hash = await wallet.writeContract({ address: stakingAddress, abi: stakingFundingAbi, functionName: "fundPOLRewards", account: wallet.account, chain: null, value: amount });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`Funding transaction failed: ${hash}`);
    const after = await publicClient.readContract({ address: stakingAddress, abi: stakingFundingAbi, functionName: "availablePOLRewards" });
    console.log(`POL funding confirmed: ${hash}`);
    console.log(`Reward reserve: ${formatEther(before)} → ${formatEther(after)} POL`);
    return;
  }

  if (asset === "RUNE") {
    const runeAddress = addressEnv(
      "RUNE_TOKEN_ADDRESS",
      deploymentAddress(networkName, "RENToken") ?? "0x0000000000000000000000000000000000000000" as Address,
    );
    const decimals = await publicClient.readContract({ address: runeAddress, abi: runeAbi, functionName: "decimals" });
    const amount = parseUnits(amountText, decimals);
    const balanceBefore = await publicClient.readContract({ address: runeAddress, abi: runeAbi, functionName: "balanceOf", args: [stakingAddress] });
    const walletBalance = await publicClient.readContract({ address: runeAddress, abi: runeAbi, functionName: "balanceOf", args: [fundingWallet] });
    if (walletBalance < amount) throw new Error(`Funding wallet has insufficient RUNE. Required ${formatUnits(amount, decimals)}, found ${formatUnits(walletBalance, decimals)}.`);

    console.log(`Funding ${formatUnits(amount, decimals)} RUNE from ${fundingWallet} into ${stakingAddress}...`);
    const hash = await wallet.writeContract({ address: runeAddress, abi: runeAbi, functionName: "transfer", args: [stakingAddress, amount], account: wallet.account, chain: null });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`Funding transaction failed: ${hash}`);
    const balanceAfter = await publicClient.readContract({ address: runeAddress, abi: runeAbi, functionName: "balanceOf", args: [stakingAddress] });
    console.log(`RUNE funding confirmed: ${hash}`);
    console.log(`RUNE vault balance: ${formatUnits(balanceBefore, decimals)} → ${formatUnits(balanceAfter, decimals)} RUNE`);
    return;
  }

  throw new Error("FUND_ASSET must be POL or RUNE.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
