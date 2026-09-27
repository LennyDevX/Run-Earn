import assert from "node:assert";
import { describe, it, before } from "mocha";
import hre from "hardhat";

const URI = "data:application/json;base64,eyJuYW1lIjoiVGVzdCJ9";
const PROOF1 = "0x" + "ea".repeat(32);
const PROOF2 = "0x" + "eb".repeat(32);
const DAY = 86_400n;

describe("SneakerMarketplace (TypeScript integration)", () => {
  let viem: any;
  let admin: any;
  let alice: any;
  let bob: any;
  let carol: any;
  let publicClient: any;
  let testClient: any;

  const FEE_BPS = 250n; // 2.5%
  const PREMIUM_BPS = 12_000n; // 1.2x

  before(async () => {
    const connection = await hre.network.create();
    viem = connection.viem;
    [admin, alice, bob, carol] = await viem.getWalletClients();
    publicClient = await viem.getPublicClient();
    testClient = await viem.getTestClient();
  });

  async function deployStack() {
    const nft = await viem.deployContract("SneakerMint", ["Airen Sneakers", "ASNEAK", admin.account.address]);
    const ren = await viem.deployContract("RENToken", [admin.account.address, admin.account.address]);
    const staking = await viem.deployContract("SneakerStaking", [
      admin.account.address,
      nft.address,
      ren.address,
      1000n * 10n ** 18n,
      280n,
      0n,
      800n,
      [50n, 80n, 150n, 180n],
      30n * DAY,
    ]);
    const appraiser = await viem.deployContract("SneakerAppraiser", [
      admin.account.address,
      nft.address,
      5n * 10n ** 17n,
      [0n, 10n ** 18n, 3n * 10n ** 18n, 8n * 10n ** 18n],
      10n ** 16n,
      10_000n,
    ]);
    const marketplace = await viem.deployContract("SneakerMarketplace", [
      admin.account.address,
      nft.address,
      appraiser.address,
      staking.address,
      FEE_BPS,
      PREMIUM_BPS,
      admin.account.address,
    ]);

    await nft.write.mintAuthorized([alice.account.address, URI, PROOF1, 50n, 2n], { account: admin.account });
    await nft.write.mintAuthorized([bob.account.address, URI, PROOF2, 90n, 3n], { account: admin.account });
    await nft.write.setApprovalForAll([marketplace.address, true], { account: alice.account });
    await nft.write.setApprovalForAll([marketplace.address, true], { account: bob.account });

    return { nft, ren, staking, appraiser, marketplace };
  }

  it("sets constructor params", async () => {
    const { nft, appraiser, marketplace } = await deployStack();
    assert.equal((await marketplace.read.nft()).toLowerCase(), nft.address.toLowerCase());
    assert.equal((await marketplace.read.appraiser()).toLowerCase(), appraiser.address.toLowerCase());
    assert.equal(await marketplace.read.feeBps(), FEE_BPS);
  });

  it("lists, buys, and splits payment with fee", async () => {
    const { nft, marketplace } = await deployStack();
    await marketplace.write.list([nft.address, 1n, 5n * 10n ** 18n], { account: alice.account });
    assert.equal((await nft.read.ownerOf([1n])).toLowerCase(), marketplace.address.toLowerCase());

    const sellerBefore = await publicClient.getBalance({ address: alice.account.address });
    await marketplace.write.buy([1n], { account: bob.account, value: 5n * 10n ** 18n });

    assert.equal((await nft.read.ownerOf([1n])).toLowerCase(), bob.account.address.toLowerCase());
    const sellerAfter = await publicClient.getBalance({ address: alice.account.address });
    // Seller receives 5 POL minus 2.5% fee = 4.875 POL
    assert.equal(sellerAfter - sellerBefore, 4875n * 10n ** 15n);
    assert.equal(await marketplace.read.accumulatedFees(), 125n * 10n ** 15n);
  });

  it("rejects listing a staked NFT", async () => {
    const { nft, staking, marketplace } = await deployStack();
    await nft.write.setApprovalForAll([staking.address, true], { account: alice.account });
    await staking.write.stake([1n], { account: alice.account });

    await assert.rejects(
      marketplace.write.list([nft.address, 1n, 5n * 10n ** 18n], { account: alice.account }),
    );
  });

  it("rejects buying with wrong payment", async () => {
    const { nft, marketplace } = await deployStack();
    await marketplace.write.list([nft.address, 1n, 5n * 10n ** 18n], { account: alice.account });
    await assert.rejects(
      marketplace.write.buy([1n], { account: bob.account, value: 4n * 10n ** 18n }),
    );
  });

  it("cancels a listing and returns the NFT", async () => {
    const { nft, marketplace } = await deployStack();
    await marketplace.write.list([nft.address, 1n, 5n * 10n ** 18n], { account: alice.account });
    await marketplace.write.cancelListing([1n], { account: alice.account });
    assert.equal((await nft.read.ownerOf([1n])).toLowerCase(), alice.account.address.toLowerCase());
  });

  it("runs an auction: bid, outbid, settle", async () => {
    const { nft, marketplace } = await deployStack();
    await marketplace.write.createAuction([nft.address, 2n, 10n ** 18n, 1n * DAY], { account: bob.account });

    await marketplace.write.bid([1n], { account: alice.account, value: 10n ** 18n });
    await marketplace.write.bid([1n], { account: carol.account, value: 2n * 10n ** 18n });

    // Alice was outbid and got her POL back
    const aliceBalance = await publicClient.getBalance({ address: alice.account.address });
    assert.ok(aliceBalance > 0n, "alice should have her bid back (gas costs aside)");

    await testClient.increaseTime({ seconds: Number(DAY) + 1 });
    await testClient.mine({ blocks: 1 });

    await marketplace.write.settleAuction([1n]);
    assert.equal((await nft.read.ownerOf([2n])).toLowerCase(), carol.account.address.toLowerCase());
  });

  it("returns NFT when auction ends with no bids", async () => {
    const { nft, marketplace } = await deployStack();
    await marketplace.write.createAuction([nft.address, 2n, 10n ** 18n, 1n * DAY], { account: bob.account });
    await testClient.increaseTime({ seconds: Number(DAY) + 1 });
    await testClient.mine({ blocks: 1 });
    await marketplace.write.settleAuction([1n]);
    assert.equal((await nft.read.ownerOf([2n])).toLowerCase(), bob.account.address.toLowerCase());
  });

  it("handles offers: make, accept, cancel", async () => {
    const { nft, marketplace } = await deployStack();
    await marketplace.write.makeOffer([nft.address, 2n, 1n * DAY], { account: alice.account, value: 2n * 10n ** 18n });
    // NFT stays with bob
    assert.equal((await nft.read.ownerOf([2n])).toLowerCase(), bob.account.address.toLowerCase());

    await marketplace.write.acceptOffer([1n], { account: bob.account });
    assert.equal((await nft.read.ownerOf([2n])).toLowerCase(), alice.account.address.toLowerCase());
    // Marketplace fee: 2.5% of 2 POL = 0.05 POL
    assert.equal(await marketplace.read.accumulatedFees(), 5n * 10n ** 16n);
  });

  it("cancels an offer and refunds the bidder", async () => {
    const { nft, marketplace } = await deployStack();
    await marketplace.write.makeOffer([nft.address, 2n, 1n * DAY], { account: alice.account, value: 2n * 10n ** 18n });
    await marketplace.write.cancelOffer([1n], { account: alice.account });
    const offer = await marketplace.read.offers([1n]);
    assert.equal(offer[5], false);
  });

  it("suggests a price from the appraiser with premium", async () => {
    const { marketplace } = await deployStack();
    // Mythic rarity 90: 0.5 + 8 + 0.9 = 9.4 POL; with 1.2x = 11.28 POL
    const suggested = await marketplace.read.suggestedPrice([2n]);
    assert.equal(suggested, 1128n * 10n ** 16n);
  });

  it("returns value recommendations", async () => {
    const { marketplace } = await deployStack();
    const tips = await marketplace.read.valueRecommendations([1n]);
    assert.equal(tips.length, 4);
  });

  it("withdraws accumulated fees", async () => {
    const { nft, marketplace } = await deployStack();
    await marketplace.write.list([nft.address, 1n, 5n * 10n ** 18n], { account: alice.account });
    await marketplace.write.buy([1n], { account: bob.account, value: 5n * 10n ** 18n });
    await marketplace.write.withdrawFees([admin.account.address], { account: admin.account });
    assert.equal(await marketplace.read.accumulatedFees(), 0n);
  });
});
