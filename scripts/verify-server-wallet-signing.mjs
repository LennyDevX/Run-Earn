import fs from "node:fs";
import { recoverMessageAddress, keccak256, encodePacked, getAddress } from "viem";
import { polygon } from "viem/chains";

/// Verifies that a thirdweb Server Wallet can produce the exact signature
/// `SneakerTabArena.completeSession` expects.
///
/// This is the whole question for plan item 3.2. The contract recovers with
/// `ecrecover(keccak256("\x19Ethereum Signed Message:\n32" || digest), v, r, s)`,
/// which is `personal_sign` over the digest. A Server Wallet is only a viable
/// replacement for the raw `ARENA_SIGNER_PRIVATE_KEY` if it signs the same way —
/// and "it should, probably" is not a good enough answer for the route that mints
/// arena boost.
///
/// So this signs a real digest with the server wallet and recovers the signer,
/// then checks the address matches. If it does not, 3.2 is not implementable as
/// planned and the raw key stays.
///
///   node scripts/verify-server-wallet-signing.mjs
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
const signerAddress = env.SERVER_WALLET_ADDRESS ?? "0x304870DCF5742b6120203Ad8D8b6A5Df1f4Cc466";
const arena = env.NEXT_PUBLIC_SNEAKER_TAB_ARENA_ADDRESS;
if (!clientId || !secretKey) throw new Error("client id and secret key are required.");

const thirdweb = await import("thirdweb");
const client = thirdweb.createThirdwebClient({ clientId, secretKey });

console.log(`server wallet  ${signerAddress}`);

// The exact digest shape from src/app/api/tab-session/route.ts.
const player = "0x581A41c663223bAE563134C67151CdC2C274f06A";
const nonce = 1n;
const points = 123;
const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
const digest = keccak256(
  encodePacked(
    ["address", "address", "uint256", "uint32", "uint64"],
    [getAddress(arena), getAddress(player), nonce, points, deadline],
  ),
);
console.log(`digest         ${digest}`);

const serverWallet = thirdweb.Engine.serverWallet({
  address: signerAddress,
  chain: polygon,
  client,
});

console.log(`\ncan sign?      ${typeof serverWallet.signMessage === "function" ? "signMessage present" : "NO signMessage"}`);

if (typeof serverWallet.signMessage !== "function") {
  console.log("\nThe server wallet cannot sign messages. 3.2 is not implementable as planned.");
  process.exit(0);
}

try {
  const signature = await serverWallet.signMessage({ message: { raw: digest } });
  console.log(`signature      ${signature.slice(0, 20)}…`);

  const recovered = await recoverMessageAddress({ message: { raw: digest }, signature });
  console.log(`recovered      ${recovered}`);
  console.log(`expected       ${getAddress(signerAddress)}`);
  console.log(
    `\n${recovered.toLowerCase() === signerAddress.toLowerCase() ? "MATCH — the contract would accept this signature." : "MISMATCH — the arena would reject it."}`,
  );
} catch (error) {
  console.error(`\nsigning failed: ${error instanceof Error ? error.message : String(error)}`);
  console.error("A 401/403 means the server wallet is not enabled for this project.");
}
