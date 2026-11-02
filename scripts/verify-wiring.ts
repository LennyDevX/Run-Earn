import hre from "hardhat";
import { getAddress, type Address } from "viem";
import { addressEnv, assertNetwork } from "./deployment-config.js";

/// ───────────────────────── Deploy wiring smoke test ────────────────────────
///
/// `scripts/deploy.ts` makes ~19 connections between contracts after deploying
/// them. A single typo there produces a system that deploys cleanly, verifies
/// cleanly, passes every unit test — and quietly does nothing: a boost written
/// where nothing reads it, a store that cannot mint because the role was granted
/// to the wrong address.
///
/// This reads the wiring back **from the deployed contracts** and asserts it. It
/// is the check that would have caught the two real deploy bugs this project
/// already hit (a missing arena signer aborting at the 15th contract, and the
/// manifest never being written because of a BigInt).
///
///   npx hardhat run scripts/verify-wiring.ts --network polygon
///
/// Exits non-zero on the first mismatch, so it can gate a deploy in CI.

type Check = { label: string; expected: string | boolean; actual: string | boolean };

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

async function main() {
  const connection = await hre.network.create();
  const { viem } = connection;
  const publicClient = await viem.getPublicClient();

  const networkName = connection.networkName;
  if (networkName !== "polygon" && networkName !== "amoy") {
    throw new Error("Use --network polygon or --network amoy.");
  }
  await assertNetwork(publicClient, networkName);

  const addr = (name: string) => addressEnv(name, ZERO);
  const addresses = {
    nft: addr("SNEAKER_MINT_ADDRESS"),
    ren: addr("RUNE_TOKEN_ADDRESS"),
    staking: addr("STAKING_VAULT_ADDRESS"),
    appraiser: addr("SNEAKER_APPRAISER_ADDRESS"),
    market: addr("MARKETPLACE_ADDRESS"),
    game: addr("SNEAKER_GAME_ADDRESS"),
    mods: addr("SNEAKER_MODS_ADDRESS"),
    workshop: addr("SNEAKER_WORKSHOP_ADDRESS"),
    store: addr("VE_SNEAKER_STORE_ADDRESS"),
    progress: addr("PLAYER_PROGRESS_ADDRESS"),
    splitter: addr("FEE_SPLITTER_ADDRESS"),
    modStore: addr("MOD_STORE_ADDRESS"),
    arena: addr("SNEAKER_TAB_ARENA_ADDRESS"),
    vault: addr("SNEAKER_VAULT_ADDRESS"),
    treasury: addr("TREASURY_ADDRESS"),
    arenaSigner: addr("ARENA_SIGNER_ADDRESS"),
  };

  const missing = Object.entries(addresses).filter(([, value]) => value === ZERO).map(([name]) => name);
  if (missing.length > 0) {
    console.log(`  Skipping checks for unset addresses: ${missing.join(", ")}\n`);
  }

  const checks: Check[] = [];

  async function expectEqual(label: string, expected: Address, actual: () => Promise<Address>) {
    if (expected === ZERO) return;
    const value = await actual();
    checks.push({ label, expected: getAddress(expected), actual: getAddress(value) });
  }

  async function expectTrue(label: string, actual: () => Promise<boolean>) {
    checks.push({ label, expected: true, actual: await actual() });
  }

  // ── The workshop is the hub: everything that reads mod effects must point
  //    at it, or equipped mods silently do nothing.
  if (addresses.game !== ZERO) {
    const game = await viem.getContractAt("SneakerGame", addresses.game);
    await expectEqual("SneakerGame.workshop", addresses.workshop, () => game.read.workshop());
    await expectEqual("SneakerGame.boosts", addresses.workshop, () => game.read.boosts());
  }
  if (addresses.staking !== ZERO) {
    const staking = await viem.getContractAt("SneakerStaking", addresses.staking);
    await expectEqual("SneakerStaking.boosts", addresses.workshop, () => staking.read.boosts());
  }
  if (addresses.appraiser !== ZERO) {
    const appraiser = await viem.getContractAt("SneakerAppraiser", addresses.appraiser);
    await expectEqual("SneakerAppraiser.boosts", addresses.workshop, () => appraiser.read.boosts());
  }
  if (addresses.market !== ZERO) {
    const market = await viem.getContractAt("SneakerMarketplace", addresses.market);
    await expectEqual("SneakerMarketplace.workshop", addresses.workshop, () => market.read.workshop());
    await expectEqual("SneakerMarketplace.feeCollector", addresses.splitter, () => market.read.feeCollector());
  }
  if (addresses.mods !== ZERO) {
    const mods = await viem.getContractAt("SneakerMods", addresses.mods);
    await expectEqual("SneakerMods.workshop", addresses.workshop, () => mods.read.workshop());
    await expectEqual("SneakerMods.progress", addresses.progress, () => mods.read.progress());
  }

  // ── Roles. A role granted to the wrong address is a store that cannot mint.
  if (addresses.nft !== ZERO && addresses.store !== ZERO) {
    const nft = await viem.getContractAt("SneakerMint", addresses.nft);
    const minterRole = await nft.read.MINTER_ROLE();
    await expectTrue("SneakerMint: VeSneakerStore holds MINTER_ROLE", () =>
      nft.read.hasRole([minterRole, addresses.store]),
    );
  }
  if (addresses.mods !== ZERO && addresses.modStore !== ZERO) {
    const mods = await viem.getContractAt("SneakerMods", addresses.mods);
    const minterRole = await mods.read.MINTER_ROLE();
    await expectTrue("SneakerMods: ModStore holds MINTER_ROLE", () =>
      mods.read.hasRole([minterRole, addresses.modStore]),
    );
  }
  if (addresses.staking !== ZERO && addresses.arena !== ZERO) {
    const staking = await viem.getContractAt("SneakerStaking", addresses.staking);
    const arenaRole = await staking.read.TAB_ARENA_ROLE();
    // Without this the arena completes a session and reverts on the boost write —
    // the failure appears at the player's wallet, far from the cause.
    await expectTrue("SneakerStaking: SneakerTabArena holds TAB_ARENA_ROLE", () =>
      staking.read.hasRole([arenaRole, addresses.arena]),
    );
  }

  // ── Collections the marketplace and swap accept. A missing allowlist entry
  //    means mods cannot be traded at all.
  if (addresses.market !== ZERO && addresses.mods !== ZERO) {
    const market = await viem.getContractAt("SneakerMarketplace", addresses.market);
    await expectTrue("SneakerMarketplace: mods collection allowed", () =>
      market.read.allowedCollections([addresses.mods]),
    );
  }

  // ── Money destinations.
  if (addresses.store !== ZERO) {
    const store = await viem.getContractAt("VeSneakerStore", addresses.store);
    await expectEqual("VeSneakerStore.treasury", addresses.treasury, () => store.read.treasury());
    await expectEqual("VeSneakerStore.vault", addresses.vault, () => store.read.vault());
    await expectEqual("VeSneakerStore.progress", addresses.progress, () => store.read.progress());
  }
  if (addresses.modStore !== ZERO) {
    const modStore = await viem.getContractAt("ModStore", addresses.modStore);
    await expectEqual("ModStore.treasury", addresses.treasury, () => modStore.read.treasury());
    await expectEqual("ModStore.vault", addresses.vault, () => modStore.read.vault());
    await expectEqual("ModStore.progress", addresses.progress, () => modStore.read.progress());
  }
  if (addresses.arena !== ZERO) {
    const arena = await viem.getContractAt("SneakerTabArena", addresses.arena);
    await expectEqual("SneakerTabArena.signer", addresses.arenaSigner, () => arena.read.signer());
  }

  // ── The splitter must be able to pay someone. A single recipient at 100% is
  //    the shape the mainnet deployment has; more than zero is the check.
  if (addresses.splitter !== ZERO) {
    const splitter = await viem.getContractAt("FeeSplitter", addresses.splitter);
    const count = Number(await splitter.read.recipientCount());
    checks.push({ label: "FeeSplitter has at least one recipient", expected: true, actual: count > 0 });
  }

  // ── Report ───────────────────────────────────────────────────────────
  let failures = 0;
  for (const check of checks) {
    const ok =
      typeof check.expected === "boolean"
        ? check.expected === check.actual
        : same(String(check.expected), String(check.actual));
    if (!ok) failures += 1;
    const mark = ok ? "ok  " : "FAIL";
    console.log(`  ${mark}  ${check.label}`);
    if (!ok) console.log(`        expected ${check.expected}  got ${check.actual}`);
  }

  console.log(`\n${checks.length - failures}/${checks.length} wiring checks passed on ${networkName}.`);
  if (failures > 0) {
    console.log("\nA mismatch here means the deploy wired two contracts that should not be");
    console.log("connected. Run scripts/deploy.ts again, or fix the setter by hand.");
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
