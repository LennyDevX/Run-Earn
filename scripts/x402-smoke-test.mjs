import fs from "node:fs";
import { privateKeyToAccount } from "viem/accounts";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { registerExactEvmScheme } from "@x402/evm/exact/client";

/// A real x402 buyer. It probes the endpoint unpaid to collect the payment
/// requirements, signs an EIP-3009 authorization with the deployer key, and
/// retries the same request with the payment attached. Nothing here is mocked —
/// the facilitator verifies and settles on Polygon mainnet.
///
///   node scripts/x402-smoke-test.mjs [url] [photo]
///
/// Defaults to http://localhost:3140/api/generate-sneaker and the Astra artwork.
/// The server must be running with `X402_PAY_TO` set, and the payer wallet needs
/// **native USDC** — the bridged USDC.e cannot sign an EIP-3009 authorization
/// whose domain this code can reproduce, and the facilitator answers
/// `unexpected_error`.
const parsed = Object.fromEntries(
  fs
    .readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((line) => /^[A-Za-z_][A-Za-z0-9_]*\s*=/.test(line))
    .map((line) => {
      const at = line.indexOf("=");
      return [line.slice(0, at).trim(), line.slice(at + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const account = privateKeyToAccount(parsed.PRIVATE_KEY);
const url = process.argv[2] ?? "http://localhost:3140/api/generate-sneaker";
const imagePath = process.argv[3] ?? "public/veSneakerAstra.png";

/// `spendControls` defaults to "only known-good assets", and USDC.e is not on
/// that list. This test deliberately pays with USDC.e because that is what the
/// wallet holds, so the guard is switched off for the run.
const client = new x402Client();
client.setSpendControls(false);
registerExactEvmScheme(client, { signer: account });
const http = new x402HTTPClient(client);

console.log(`payer   ${account.address}`);
console.log(`target  ${url}`);
console.log(`photo   ${imagePath} (${fs.statSync(imagePath).size} bytes)`);
console.log("");

// ── 1. Unpaid probe: the 402 challenge ────────────────────────────
const probe = await fetch(url, { method: "POST" });
console.log(`1. unpaid probe -> HTTP ${probe.status}`);
if (probe.status !== 402) {
  console.log("   expected 402. body:", (await probe.text()).slice(0, 300));
  process.exit(1);
}

const required = http.getPaymentRequiredResponse((name) => probe.headers.get(name));
console.log("   requirements:", JSON.stringify(required, null, 2).replace(/\n/g, "\n   "));
console.log("");

// ── 2. Sign the payment ───────────────────────────────────────────
console.log("2. signing payment payload...");
const payload = await http.createPaymentPayload(required);
const headers = http.encodePaymentSignatureHeader(payload);
console.log(`   signed as ${account.address}`);
console.log("");

// ── 3. Retry with payment + a real generation request ─────────────
const bytes = fs.readFileSync(imagePath);
const form = new FormData();
form.append("photo", new Blob([new Uint8Array(bytes)], { type: "image/png" }), "sneaker.png");
form.append("seed", "x402-mainnet-verification");

console.log("3. sending the paid generation request...");
const started = Date.now();
const paid = await fetch(url, { method: "POST", headers, body: form });
const elapsed = Date.now() - started;
console.log(`   -> HTTP ${paid.status} in ${(elapsed / 1000).toFixed(1)}s`);

try {
  const settlement = http.getPaymentSettleResponse((name) => paid.headers.get(name));
  console.log("   settlement:", JSON.stringify(settlement, null, 2).replace(/\n/g, "\n   "));
} catch (error) {
  console.log(`   settlement header: ${error instanceof Error ? error.message : error}`);
}

// A rejected payment comes back as another 402 whose `payment-required` header
// carries the facilitator's reason. Dump it rather than guessing.
if (paid.status === 402) {
  console.log("   response headers:");
  for (const [name, value] of paid.headers.entries()) {
    console.log(`     ${name}: ${value.length > 160 ? `${value.slice(0, 160)}…` : value}`);
  }
  const challenge = paid.headers.get("payment-required");
  if (challenge) {
    try {
      const decoded = JSON.parse(Buffer.from(challenge, "base64").toString());
      console.log("   decoded payment-required:");
      console.log(`     ${JSON.stringify(decoded, null, 2).replace(/\n/g, "\n     ")}`);
    } catch {
      console.log("   payment-required could not be base64-decoded");
    }
  }
}

const body = await paid.text();
console.log("");
console.log("4. response body (first 500 chars):");
console.log(`   ${body.slice(0, 500)}`);
