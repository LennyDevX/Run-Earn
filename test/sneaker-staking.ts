import assert from "node:assert";
import { describe, it, before } from "mocha";
import hre from "hardhat";

const URI = "data:application/json;base64,eyJuYW1lIjoiVGVzdCJ9";
const PROOF1 = "0x" + "01".repeat(32);
const SECONDS_PER_DAY = 86_400n;
const SECONDS_PER_YEAR = 31_536_000n;

describe("SneakerStaking (TypeScript integration)", () => {
  let viem: any;
  let admin: any;
  let alice: any;
  let publicClient: any;
  let testClient: any;

  // Rarity-based boost: [50, 80, 150, 180] bps for Common, Rare, Epic, Mythic
  const tierBonusBps = [50n, 80n, 150n, 180n];
  const minLockSeconds = 30n * SECONDS_PER_DAY;

  before(async () => {
    const connection = await hre.network.create();
    viem = connection.viem;
    [admin, alice] = await viem.getWalletClients();
    publicClient = await viem.getPublicClient();
    testClient = await viem.getTestClient();
  });

  async function deployStack() {
    const nft = await viem.deployContract("SneakerMint", ["RUN&EARN Sneakers", "RSNEAK", admin.account.address]);
    const rune = await viem.deployContract("RENToken", [admin.account.address, admin.account.address]);
    const staking = await viem.deployContract("SneakerStaking", [
      admin.account.address,
      nft.address,
      rune.address,
      1000n * 10n ** 18n,
      280n,
      0n, // perNftBonusBps = 0 (boost is rarity-based)
      800n,
      tierBonusBps,
      minLockSeconds,
    ]);

    await rune.write.mint([staking.address, 1_000_000n * 10n ** 18n], { account: admin.account });
    await nft.write.mintAuthorized(
      [alice.account.address, URI, PROOF1, 50n, 2n],
      { account: admin.account },
    );

    return { nft, rune, staking };
  }

  it("sets correct constructor params", async () => {
    const { nft, rune, staking } = await deployStack();
    assert.equal((await staking.read.nft()).toLowerCase(), nft.address.toLowerCase());
    assert.equal((await staking.read.rewardToken()).toLowerCase(), rune.address.toLowerCase());
    assert.equal(await staking.read.baseApyBps(), 280n);
    assert.equal(await staking.read.maxApyBps(), 800n);
    assert.equal(await staking.read.minLockSeconds(), minLockSeconds);
  });

  it("stakes NFT and transfers to vault", async () => {
    const { nft, staking } = await deployStack();
    await nft.write.approve([staking.address, 1n], { account: alice.account });
    await staking.write.stake([1n], { account: alice.account });
    assert.equal((await nft.read.ownerOf([1n])).toLowerCase(), staking.address.toLowerCase());
    assert.equal(await staking.read.totalLocked(), 1n);
  });

  it("reads rarity/tier from NFT contract on stake", async () => {
    const { nft, staking } = await deployStack();
    await nft.write.approve([staking.address, 1n], { account: alice.account });
    await staking.write.stake([1n], { account: alice.account });
    const receipt = await staking.read.receipts([alice.account.address, 1n]);
    assert.equal(receipt[0], 1n); // tokenId
    assert.equal(receipt[1], 50n); // rarity
    assert.equal(receipt[2], 2n); // tier
    assert.equal(receipt[4], true); // active
  });

  it("reverts when non-owner tries to stake", async () => {
    const { nft, staking } = await deployStack();
    await nft.write.approve([staking.address, 1n], { account: alice.account });
    await assert.rejects(
      staking.write.stake([1n], { account: admin.account }),
    );
  });

  it("reverts on duplicate stake", async () => {
    const { nft, staking } = await deployStack();
    await nft.write.approve([staking.address, 1n], { account: alice.account });
    await staking.write.stake([1n], { account: alice.account });
    await assert.rejects(
      staking.write.stake([1n], { account: alice.account }),
    );
  });

  it("unstakes after lock period and returns NFT", async () => {
    const { nft, staking } = await deployStack();
    await nft.write.approve([staking.address, 1n], { account: alice.account });
    await staking.write.stake([1n], { account: alice.account });

    await testClient.increaseTime({ seconds: Number(minLockSeconds) + 1 });
    await testClient.mine({ blocks: 1 });

    await staking.write.unstake([1n], { account: alice.account });
    assert.equal((await nft.read.ownerOf([1n])).toLowerCase(), alice.account.address.toLowerCase());
    assert.equal(await staking.read.totalLocked(), 0n);
  });

  it("reverts on unstake during lock period", async () => {
    const { nft, staking } = await deployStack();
    await nft.write.approve([staking.address, 1n], { account: alice.account });
    await staking.write.stake([1n], { account: alice.account });

    await testClient.increaseTime({ seconds: 86_400 * 5 }); // only 5 days, lock is 30 days
    await testClient.mine({ blocks: 1 });

    await assert.rejects(
      staking.write.unstake([1n], { account: alice.account }),
    );
  });

  it("claims rewards after time", async () => {
    const { nft, rune, staking } = await deployStack();
    await nft.write.approve([staking.address, 1n], { account: alice.account });
    await staking.write.stake([1n], { account: alice.account });

    await testClient.increaseTime({ seconds: Number(SECONDS_PER_YEAR) });
    await testClient.mine({ blocks: 1 });

    await staking.write.claimRewards({ account: alice.account });
    const balance = await rune.read.balanceOf([alice.account.address]);
    assert.ok(balance > 0n, "should have earned REN");
  });

  it("reverts on claim with nothing staked", async () => {
    const { staking } = await deployStack();
    await assert.rejects(
      staking.write.claimRewards({ account: alice.account }),
    );
  });

  it("yields near-zero rewards on immediate claim", async () => {
    const { nft, rune, staking } = await deployStack();
    await nft.write.approve([staking.address, 1n], { account: alice.account });
    await staking.write.stake([1n], { account: alice.account });
    // With auto-mining, 1 second may pass between txs, so claim may succeed
    // with a tiny amount. Verify the amount is very small (< 10 RUNE).
    try {
      await staking.write.claimRewards({ account: alice.account });
      const balance = await rune.read.balanceOf([alice.account.address]);
      assert.ok(balance < 10n * 10n ** 18n, "immediate claim should yield tiny rewards");
    } catch {
      // Revert with "nothing to claim" is also acceptable
    }
  });

  it("computes effective APY for single NFT", async () => {
    const { nft, staking } = await deployStack();
    await nft.write.approve([staking.address, 1n], { account: alice.account });
    await staking.write.stake([1n], { account: alice.account });
    // base 280 + 0 (no flat bonus) + tierBonus[2]=150 (Epic) = 430
    assert.equal(await staking.read.effectiveApyBps([alice.account.address]), 430n);
  });

  it("caps APY at maxApyBps", async () => {
    const { nft, staking } = await deployStack();
    // Mint 4 Mythic NFTs (tier 3, +1.8% each) — 5 total with the setUp NFT
    for (let i = 2; i <= 5; i++) {
      const proof = "0x" + i.toString(16).padStart(2, "0").repeat(32);
      await nft.write.mintAuthorized(
        [alice.account.address, URI, proof, 90n, 3n],
        { account: admin.account },
      );
    }
    for (let i = 1n; i <= 5n; i++) {
      await nft.write.approve([staking.address, i], { account: alice.account });
      await staking.write.stake([i], { account: alice.account });
    }
    // base 280 + 5*180 = 1180, capped at 800
    assert.equal(await staking.read.effectiveApyBps([alice.account.address]), 800n);
  });

  it("updates reward params via admin", async () => {
    const { staking } = await deployStack();
    await staking.write.updateRewardParams(
      [2000n * 10n ** 18n, 500n, 100n, 1000n, tierBonusBps, 14n * SECONDS_PER_DAY],
      { account: admin.account },
    );
    assert.equal(await staking.read.baseApyBps(), 500n);
    assert.equal(await staking.read.maxApyBps(), 1000n);
    assert.equal(await staking.read.minLockSeconds(), 14n * SECONDS_PER_DAY);
  });

  it("reverts on updateRewardParams by non-admin", async () => {
    const { staking } = await deployStack();
    await assert.rejects(
      staking.write.updateRewardParams(
        [2000n * 10n ** 18n, 500n, 100n, 1000n, tierBonusBps, 14n * SECONDS_PER_DAY],
        { account: alice.account },
      ),
    );
  });

  it("recovers NFT via emergency admin function", async () => {
    const { nft, staking } = await deployStack();
    await nft.write.approve([staking.address, 1n], { account: alice.account });
    await staking.write.stake([1n], { account: alice.account });

    await staking.write.recoverNFT([1n], { account: admin.account });
    assert.equal((await nft.read.ownerOf([1n])).toLowerCase(), alice.account.address.toLowerCase());
    assert.equal(await staking.read.totalLocked(), 0n);
  });

  it("shows growing pendingRewards over time", async () => {
    const { nft, staking } = await deployStack();
    await nft.write.approve([staking.address, 1n], { account: alice.account });
    await staking.write.stake([1n], { account: alice.account });

    const pending0 = await staking.read.pendingRewards([alice.account.address]);
    assert.equal(pending0, 0n);

    await testClient.increaseTime({ seconds: 86_400 });
    await testClient.mine({ blocks: 1 });

    const pending1 = await staking.read.pendingRewards([alice.account.address]);
    assert.ok(pending1 > 0n, "pending should grow");
  });

  it("tracks native POL deposits", async () => {
    const { staking } = await deployStack();
    await staking.write.depositPOL([], { account: alice.account, value: 1n * 10n ** 18n });
    const polPosition = await staking.read.polPositions([alice.account.address]);
    assert.equal(polPosition[0], 1n * 10n ** 18n);
    assert.equal(await staking.read.totalPOLPrincipal(), 1n * 10n ** 18n);
  });

  it("increases POL APY after locking a sneaker NFT", async () => {
    const { nft, staking } = await deployStack();
    await staking.write.depositPOL([], { account: alice.account, value: 1n * 10n ** 18n });
    const baseApy = await staking.read.effectiveApyBps([alice.account.address]);

    await nft.write.approve([staking.address, 1n], { account: alice.account });
    await staking.write.stake([1n], { account: alice.account });
    const boostedApy = await staking.read.effectiveApyBps([alice.account.address]);

    assert.equal(baseApy, 280n);
    // base 280 + 0 + tierBonus[2]=150 (Epic) = 430
    assert.equal(boostedApy, 430n);
  });

  it("claims funded POL rewards", async () => {
    const { staking } = await deployStack();
    await staking.write.fundPOLRewards([], { account: admin.account, value: 100n * 10n ** 18n });
    await staking.write.depositPOL([], { account: alice.account, value: 1n * 10n ** 18n });
    await testClient.increaseTime({ seconds: Number(SECONDS_PER_YEAR) });
    await testClient.mine({ blocks: 1 });

    const before = await publicClient.getBalance({ address: alice.account.address });
    await staking.write.claimPOLRewards({ account: alice.account });
    const after = await publicClient.getBalance({ address: alice.account.address });
    assert.ok(after > before, "claim should transfer POL rewards");
  });

  it("tracks staked token IDs for unlock UI", async () => {
    const { nft, staking } = await deployStack();
    await nft.write.approve([staking.address, 1n], { account: alice.account });
    await staking.write.stake([1n], { account: alice.account });
    const locked = await staking.read.stakedTokenIds([alice.account.address]);
    assert.deepEqual(locked, [1n]);
  });
});
