import assert from "node:assert";
import { describe, it, before } from "mocha";
import hre from "hardhat";

const URI = "data:application/json;base64,eyJuYW1lIjoiVGVzdCJ9";
const DAY = 86_400;

describe("SneakerGame (TypeScript integration)", () => {
  let viem: any;
  let admin: any;
  let alice: any;
  let publicClient: any;
  let testClient: any;

  const tierBase = [100n * 10n ** 18n, 200n * 10n ** 18n, 400n * 10n ** 18n, 800n * 10n ** 18n];
  const PROOF1 = "0x" + "fa".repeat(32);
  const PROOF2 = "0x" + "fb".repeat(32);

  before(async () => {
    const connection = await hre.network.create();
    viem = connection.viem;
    [admin, alice] = await viem.getWalletClients();
    publicClient = await viem.getPublicClient();
    testClient = await viem.getTestClient();
  });

  // increaseTime offsets accumulate across tests, so always compute the
  // delta from a fresh block timestamp read when warping.

  async function currentTimestamp(): Promise<bigint> {
    const block = await publicClient.getBlock();
    return block.timestamp;
  }

  async function deployStack() {
    const nft = await viem.deployContract("SneakerMint", ["RUN&EARN Sneakers", "RSNEAK", admin.account.address]);
    const ren = await viem.deployContract("RUNEToken", [admin.account.address, admin.account.address]);
    const game = await viem.deployContract("SneakerGame", [
      admin.account.address,
      nft.address,
      ren.address,
      tierBase,
      100n, // +1% per streak day
      10n, // max durability
      1n, // wear per activation
      50n * 10n ** 18n, // repair cost
      100n * 10n ** 18n, // 100 veRUNE = 1 REN
    ]);
    await nft.write.mintAuthorized([alice.account.address, URI, PROOF1, 50n, 2n], { account: admin.account });
    await nft.write.mintAuthorized([alice.account.address, URI, PROOF2, 90n, 3n], { account: admin.account });
    return { nft, ren, game };
  }

  it("sets constructor params", async () => {
    const { nft, game } = await deployStack();
    assert.equal((await game.read.nft()).toLowerCase(), nft.address.toLowerCase());
    assert.equal(await game.read.maxDurability(), 10n);
    assert.equal(await game.read.redemptionEnabled(), false);
  });

  it("activates a sneaker: streak starts, durability wears", async () => {
    const { game } = await deployStack();
    await game.write.activate([1n], { account: alice.account });
    const state = await game.read.sneakers([1n]);
    assert.equal(state[2], 1n); // streak
    assert.equal(state[3], 9n); // durability 10 - 1
  });

  it("rejects activation during cooldown", async () => {
    const { game } = await deployStack();
    await game.write.activate([1n], { account: alice.account });
    const activatedAt = await currentTimestamp();
    const block = await publicClient.getBlock();
    const elapsed = Number(block.timestamp) - Number(activatedAt);
    const remaining = DAY - elapsed;
    if (remaining > 0) {
      await testClient.increaseTime({ seconds: Math.max(1, remaining - 3600) }); // still inside cooldown
      await testClient.mine({ blocks: 1 });
    }
    await assert.rejects(game.write.activate([1n], { account: alice.account }));
  });

  it("builds streak when activated daily", async () => {
    const { game } = await deployStack();
    await game.write.activate([1n], { account: alice.account });
    const activatedAt = await currentTimestamp();
    // Warp to exactly activatedAt + 25h (inside the 48h streak window)
    const block = await publicClient.getBlock();
    const target = Number(activatedAt) + DAY * 1 + 3600;
    const delta = target - Number(block.timestamp);
    if (delta > 0) {
      await testClient.increaseTime({ seconds: delta });
      await testClient.mine({ blocks: 1 });
    }
    await game.write.activate([1n], { account: alice.account });
    const state = await game.read.sneakers([1n]);
    assert.equal(state[2], 2n);
  });

  it("resets streak after the 48h break window", async () => {
    const { game } = await deployStack();
    await game.write.activate([1n], { account: alice.account });
    const activatedAt = await currentTimestamp();
    const block = await publicClient.getBlock();
    const target = Number(activatedAt) + DAY * 3; // 3 days later: streak broken
    const delta = target - Number(block.timestamp);
    if (delta > 0) {
      await testClient.increaseTime({ seconds: delta });
      await testClient.mine({ blocks: 1 });
    }
    await game.write.activate([1n], { account: alice.account });
    const state = await game.read.sneakers([1n]);
    assert.equal(state[2], 1n);
  });

  it("accrues passive points while active", async () => {
    const { game } = await deployStack();
    await game.write.activate([1n], { account: alice.account });
    const activatedAt = await currentTimestamp();
    const block = await publicClient.getBlock();
    const target = Number(activatedAt) + DAY / 2; // 12h: half a day of Epic points
    const delta = target - Number(block.timestamp);
    if (delta > 0) {
      await testClient.increaseTime({ seconds: delta });
      await testClient.mine({ blocks: 1 });
    }
    const pending = await game.read.pendingPoints([1n]);
    // Epic: 400/day * 0.5 day = ~200 veRUNE (1% tolerance)
    const expected = 200n * 10n ** 18n;
    const tolerance = expected / 100n;
    assert.ok(
      pending >= expected - tolerance && pending <= expected + tolerance,
      `pending ${pending} should be ~${expected}`,
    );
  });

  it("stops accrual after the 24h active window", async () => {
    const { game } = await deployStack();
    await game.write.activate([1n], { account: alice.account });
    const activatedAt = await currentTimestamp();
    const block = await publicClient.getBlock();
    const target = Number(activatedAt) + DAY * 2;
    const delta = target - Number(block.timestamp);
    if (delta > 0) {
      await testClient.increaseTime({ seconds: delta });
      await testClient.mine({ blocks: 1 });
    }
    const pending = await game.read.pendingPoints([1n]);
    const expected = 400n * 10n ** 18n;
    const tolerance = expected / 100n;
    assert.ok(pending >= expected - tolerance && pending <= expected + tolerance);
  });

  it("claims points to the veRUNE balance", async () => {
    const { game } = await deployStack();
    await game.write.activate([1n], { account: alice.account });
    const activatedAt = await currentTimestamp();
    const block = await publicClient.getBlock();
    const target = Number(activatedAt) + DAY;
    const delta = target - Number(block.timestamp);
    if (delta > 0) {
      await testClient.increaseTime({ seconds: delta });
      await testClient.mine({ blocks: 1 });
    }
    await game.write.claimPoints([1n], { account: alice.account });
    const balance = await game.read.veRuneBalance([alice.account.address]);
    assert.ok(balance > 390n * 10n ** 18n && balance <= 400n * 10n ** 18n);
  });

  it("repairs a sneaker with veRUNE", async () => {
    const { game } = await deployStack();
    // Earn points with the Mythic sneaker first
    await game.write.activate([2n], { account: alice.account });
    let activatedAt = await currentTimestamp();
    let block = await publicClient.getBlock();
    let delta = Number(activatedAt) + DAY - Number(block.timestamp);
    if (delta > 0) {
      await testClient.increaseTime({ seconds: delta });
      await testClient.mine({ blocks: 1 });
    }
    await game.write.claimPoints([2n], { account: alice.account });

    // Wear sneaker 1
    await game.write.activate([1n], { account: alice.account });
    activatedAt = await currentTimestamp();
    block = await publicClient.getBlock();
    delta = Number(activatedAt) + DAY + 3600 - Number(block.timestamp);
    if (delta > 0) {
      await testClient.increaseTime({ seconds: delta });
      await testClient.mine({ blocks: 1 });
    }
    await game.write.activate([1n], { account: alice.account });

    await game.write.repair([1n], { account: alice.account });
    const state = await game.read.sneakers([1n]);
    assert.equal(state[3], 10n); // full durability
  });

  it("rejects redemption while disabled", async () => {
    const { game } = await deployStack();
    await game.write.activate([1n], { account: alice.account });
    const activatedAt = await currentTimestamp();
    const block = await publicClient.getBlock();
    const delta = Number(activatedAt) + DAY - Number(block.timestamp);
    if (delta > 0) {
      await testClient.increaseTime({ seconds: delta });
      await testClient.mine({ blocks: 1 });
    }
    await game.write.claimPoints([1n], { account: alice.account });
    await assert.rejects(
      game.write.redeem([100n * 10n ** 18n], { account: alice.account }),
    );
  });

  it("redeems veRUNE for REN when enabled", async () => {
    const { ren, game } = await deployStack();
    await ren.write.mint([admin.account.address, 1000n * 10n ** 18n], { account: admin.account });
    await ren.write.approve([game.address, 2n ** 256n - 1n], { account: admin.account });
    await game.write.fundREN([1000n * 10n ** 18n], { account: admin.account });
    await game.write.setRedemptionEnabled([true], { account: admin.account });

    await game.write.activate([1n], { account: alice.account });
    const activatedAt = await currentTimestamp();
    const block = await publicClient.getBlock();
    const delta = Number(activatedAt) + DAY - Number(block.timestamp);
    if (delta > 0) {
      await testClient.increaseTime({ seconds: delta });
      await testClient.mine({ blocks: 1 });
    }
    await game.write.claimPoints([1n], { account: alice.account });

    const balance = await game.read.veRuneBalance([alice.account.address]);
    assert.ok(balance > 0n);

    await game.write.redeem([balance], { account: alice.account });
    const renBalance = await ren.read.balanceOf([alice.account.address]);
    const expectedRen = balance / (100n * 10n ** 18n);
    assert.equal(renBalance, expectedRen);
    assert.equal(await game.read.veRuneBalance([alice.account.address]), 0n);
  });

  it("caps the streak multiplier", async () => {
    const { game } = await deployStack();
    assert.equal(await game.read.streakMultiplierBps([1n]), 10_000n);
    assert.equal(await game.read.streakMultiplierBps([2n]), 10_100n);
    assert.equal(await game.read.streakMultiplierBps([200n]), 15_000n);
  });
});
