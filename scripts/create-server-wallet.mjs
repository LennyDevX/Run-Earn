import fs from "node:fs";

/// Creates a thirdweb Server Wallet for Airen's arena signer.
///
/// The arena signer is currently a raw private key in `.env`. A Server Wallet
/// replaces that with a wallet thirdweb holds and reaches through the project
/// secret key — the same signing ability without a key sitting in a file.
///
/// This is a real action: it creates a wallet in the thirdweb account. Run it
/// once. The address it prints is what `ARENA_SIGNER_ADDRESS` should become.
///
///   node scripts/create-server-wallet.mjs
const env = Object.fromEntries(
  fs
    .readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((line) => /^[A-Za-z_][A-Za-z0-9_]*\s*=/.test(line))
    .map((line) => {
      const at = line.indexOf("=");
      return [line.slice(0, at).trim(), line.slice(at + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const clientId = env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID;
const secretKey = env.NEXT_SECRET_KEY_THIRDWEB ?? env.THIRDWEB_SECRET_KEY;
if (!clientId) throw new Error("NEXT_PUBLIC_THIRDWEB_CLIENT_ID is missing.");
if (!secretKey) throw new Error("NEXT_SECRET_KEY_THIRDWEB is missing.");

// Never print the key. Length is enough to spot a wrong value.
console.log(`client id   ${clientId.slice(0, 6)}… (${clientId.length} chars)`);
console.log(`secret key  ${secretKey.slice(0, 4)}… (${secretKey.length} chars, never printed)`);

const thirdweb = await import("thirdweb");
console.log(`\nEngine exported: ${typeof thirdweb.Engine === "object" ? "yes" : "no"}`);
console.log(`createThirdwebClient exported: ${typeof thirdweb.createThirdwebClient === "function" ? "yes" : "no"}`);

const client = thirdweb.createThirdwebClient({ clientId, secretKey });

console.log("\ncreating server wallet…");
try {
  const wallet = await thirdweb.Engine.createServerWallet({
    client,
    label: "Airen arena signer",
  });
  console.log("\n=== created ===");
  console.log(`  address               ${wallet.address}`);
  console.log(`  smartAccountAddress   ${wallet.smartAccountAddress ?? "(none)"}`);
  console.log(`  createdAt             ${wallet.createdAt}`);
  console.log(`  label                 ${wallet.label ?? "(none)"}`);
  console.log("\nNext: set ARENA_SIGNER_ADDRESS to the signer address, then call");
  console.log("      SneakerTabArena.setArenaSigner on-chain.");
} catch (error) {
  console.error("\ncreateServerWallet failed:");
  console.error(`  ${error instanceof Error ? error.message : String(error)}`);
  console.error("\nA 401/403 here means the secret key is wrong or the project does not");
  console.error("have Server Wallets enabled.");
}
