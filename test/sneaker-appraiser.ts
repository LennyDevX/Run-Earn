import assert from "node:assert";
import { describe, it, before } from "mocha";
import hre from "hardhat";

const URI = "data:application/json;base64,eyJuYW1lIjoiVGVzdCJ9";
const PROOF1 = "0x" + "aa".repeat(32);
const PROOF2 = "0x" + "bb".repeat(32);
const PROOF3 = "0x" + "cc".repeat(32);
const PROOF4 = "0x" + "dd".repeat(32);

describe("SneakerAppraiser (TypeScript integration)", () => {
  let viem: any;
  let admin: any;
  let alice: any;

  const baseValue = 5n * 10n ** 17n; // 0.5 POL
  const tierValues = [0n, 1n * 10n ** 18n, 3n * 10n ** 18n, 8n * 10n ** 18n];
  const rarityWeight = 1n * 10n ** 16n; // 0.01 POL
  const globalMultiplierBps = 10_000n;

  before(async () => {
    const connection = await hre.network.create();
    viem = connection.viem;
    [admin, alice] = await viem.getWalletClients();
  });

  async function deployStack() {
    const nft = await viem.deployContract("SneakerMint", ["Airen Sneakers", "ASNEAK", admin.account.address]);
    const appraiser = await viem.deployContract("SneakerAppraiser", [
      admin.account.address,
      nft.address,
      baseValue,
      tierValues,
      rarityWeight,
      globalMultiplierBps,
    ]);

    // Mint NFTs at different tiers
    await nft.write.mintAuthorized([alice.account.address, URI, PROOF1, 50n, 2n], { account: admin.account }); // Epic
    await nft.write.mintAuthorized([alice.account.address, URI, PROOF2, 90n, 3n], { account: admin.account }); // Mythic
    await nft.write.mintAuthorized([alice.account.address, URI, PROOF3, 20n, 0n], { account: admin.account }); // Common
    await nft.write.mintAuthorized([alice.account.address, URI, PROOF4, 60n, 1n], { account: admin.account }); // Rare

    return { nft, appraiser };
  }

  it("sets correct constructor params", async () => {
    const { nft, appraiser } = await deployStack();
    assert.equal((await appraiser.read.nft()).toLowerCase(), nft.address.toLowerCase());
    assert.equal(await appraiser.read.baseValue(), baseValue);
    assert.equal(await appraiser.read.rarityWeight(), rarityWeight);
    assert.equal(await appraiser.read.globalMultiplierBps(), globalMultiplierBps);
  });

  it("appraises an Epic NFT correctly", async () => {
    const { appraiser } = await deployStack();
    const [value, rarity, tier] = await appraiser.read.appraise([1n]);
    // 0.5 + 3 + 50*0.01 = 4.0 POL
    assert.equal(value, 4n * 10n ** 18n);
    assert.equal(rarity, 50n);
    assert.equal(tier, 2n);
  });

  it("appraises a Mythic NFT correctly", async () => {
    const { appraiser } = await deployStack();
    const [value, rarity, tier] = await appraiser.read.appraise([2n]);
    // 0.5 + 8 + 90*0.01 = 9.4 POL
    assert.equal(value, 94n * 10n ** 17n); // 9.4 POL
    assert.equal(rarity, 90n);
    assert.equal(tier, 3n);
  });

  it("appraises a Common NFT correctly", async () => {
    const { appraiser } = await deployStack();
    const [value, ,] = await appraiser.read.appraise([3n]);
    // 0.5 + 0 + 20*0.01 = 0.7 POL
    assert.equal(value, 7n * 10n ** 17n); // 0.7 POL
  });

  it("appraises a Rare NFT correctly", async () => {
    const { appraiser } = await deployStack();
    const [value, ,] = await appraiser.read.appraise([4n]);
    // 0.5 + 1 + 60*0.01 = 2.1 POL
    assert.equal(value, 21n * 10n ** 17n); // 2.1 POL
  });

  it("appraiseRaw returns value without needing an NFT", async () => {
    const { appraiser } = await deployStack();
    // 0.5 + 8 + 100*0.01 = 9.5 POL
    const value = await appraiser.read.appraiseRaw([100n, 3n]);
    assert.equal(value, 95n * 10n ** 17n); // 9.5 POL
  });

  it("reverts on appraiseRaw with invalid tier", async () => {
    const { appraiser } = await deployStack();
    await assert.rejects(appraiser.read.appraiseRaw([50n, 5n]));
  });

  it("applies global multiplier to estimates", async () => {
    const { appraiser } = await deployStack();
    await appraiser.write.updateParams(
      [baseValue, tierValues, rarityWeight, 15_000n],
      { account: admin.account },
    );
    const [value, ,] = await appraiser.read.appraise([1n]);
    // raw = 4 POL, with 1.5x = 6 POL
    assert.equal(value, 6n * 10n ** 18n);
  });

  it("updates params via admin", async () => {
    const { appraiser } = await deployStack();
    const newTierValues = [1n * 10n ** 18n, 2n * 10n ** 18n, 5n * 10n ** 18n, 12n * 10n ** 18n];
    await appraiser.write.updateParams(
      [1n * 10n ** 18n, newTierValues, 2n * 10n ** 16n, 12_000n],
      { account: admin.account },
    );
    assert.equal(await appraiser.read.baseValue(), 1n * 10n ** 18n);
    assert.equal(await appraiser.read.rarityWeight(), 2n * 10n ** 16n); // 0.02 POL
    assert.equal(await appraiser.read.globalMultiplierBps(), 12_000n);
  });

  it("reverts on updateParams by non-admin", async () => {
    const { appraiser } = await deployStack();
    await assert.rejects(
      appraiser.write.updateParams(
        [baseValue, tierValues, rarityWeight, 12_000n],
        { account: alice.account },
      ),
    );
  });

  it("returns correct tier labels", async () => {
    const { appraiser } = await deployStack();
    assert.equal(await appraiser.read.tierLabel([0n]), "Common");
    assert.equal(await appraiser.read.tierLabel([1n]), "Rare");
    assert.equal(await appraiser.read.tierLabel([2n]), "Epic");
    assert.equal(await appraiser.read.tierLabel([3n]), "Mythic");
  });

  it("returns correct tier boost bps", async () => {
    const { appraiser } = await deployStack();
    assert.equal(await appraiser.read.tierBoostBps([0n]), 50n);
    assert.equal(await appraiser.read.tierBoostBps([1n]), 80n);
    assert.equal(await appraiser.read.tierBoostBps([2n]), 150n);
    assert.equal(await appraiser.read.tierBoostBps([3n]), 180n);
  });

  it("returns tier value list for UI", async () => {
    const { appraiser } = await deployStack();
    const values = await appraiser.read.tierValueList();
    assert.deepEqual(values, tierValues);
  });
});
