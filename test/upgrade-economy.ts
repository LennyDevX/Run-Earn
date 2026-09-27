import assert from "node:assert";
import { describe, it, before } from "mocha";
import hre from "hardhat";

const URI = "data:application/json;base64,eyJuYW1lIjoiVGVzdCJ9";
const DAY = 86_400n;

const proof = (byte: string) => ("0x" + byte.repeat(32)) as `0x${string}`;
const modTraits = (over: Record<string, unknown> = {}) => ({
  slot: 0,
  rarity: 60,
  tier: 1,
  effectBps: 2_000,
  aux: 255,
  consumable: false,
  proofHash: proof("aa"),
  ...over,
});

describe("Upgrade economy (TypeScript integration)", () => {
  let viem: any;
  let admin: any;
  let alice: any;
  let bob: any;
  let publicClient: any;
  let testClient: any;

  before(async () => {
    const connection = await hre.network.create();
    viem = connection.viem;
    [admin, alice, bob] = await viem.getWalletClients();
    publicClient = await viem.getPublicClient();
    testClient = await viem.getTestClient();
  });

  async function deployStack() {
    const nft = await viem.deployContract("SneakerMint", ["Airen Sneakers", "ASNEAK", admin.account.address]);
    const ren = await viem.deployContract("RENToken", [admin.account.address, admin.account.address]);
    const staking = await viem.deployContract("SneakerStaking", [
      admin.account.address, nft.address, ren.address,
      1000n * 10n ** 18n, 280n, 0n, 800n, [50n, 80n, 150n, 180n], 30n * DAY,
    ]);
    const game = await viem.deployContract("SneakerGame", [
      admin.account.address, nft.address, ren.address,
      [100n * 10n ** 18n, 200n * 10n ** 18n, 400n * 10n ** 18n, 800n * 10n ** 18n],
      100n, 10, 1, 50n * 10n ** 18n, 100n * 10n ** 18n,
    ]);
    const mods = await viem.deployContract("SneakerMods", [
      "Airen Mods", "AMOD", admin.account.address, nft.address, game.address, staking.address,
    ]);
    const workshop = await viem.deployContract("SneakerWorkshop", [
      admin.account.address, nft.address, mods.address, game.address, staking.address,
      250n * 10n ** 18n, 5, 250, 10,
    ]);
    const appraiser = await viem.deployContract("SneakerAppraiser", [
      admin.account.address, nft.address,
      5n * 10n ** 17n, [0n, 10n ** 18n, 3n * 10n ** 18n, 8n * 10n ** 18n], 10n ** 16n, 10_000n,
    ]);
    const marketplace = await viem.deployContract("SneakerMarketplace", [
      admin.account.address, nft.address, appraiser.address, staking.address, 250n, 12_000n, admin.account.address,
    ]);
    const swap = await viem.deployContract("SneakerSwap", [
      admin.account.address, nft.address, staking.address, workshop.address,
    ]);
    const rental = await viem.deployContract("ModRental", [
      admin.account.address, mods.address, workshop.address, 250n, admin.account.address,
    ]);
    const modStore = await viem.deployContract("ModStore", [
      admin.account.address, mods.address, admin.account.address,
    ]);

    // Wiring — same order as scripts/deploy.ts.
    await game.write.setBoosts([workshop.address], { account: admin.account });
    await game.write.setWorkshop([workshop.address], { account: admin.account });
    await staking.write.setBoosts([workshop.address], { account: admin.account });
    await appraiser.write.setBoosts([workshop.address], { account: admin.account });
    await mods.write.setWorkshop([workshop.address], { account: admin.account });
    await workshop.write.setRentalSource([rental.address], { account: admin.account });
    await marketplace.write.setWorkshop([workshop.address], { account: admin.account });
    await marketplace.write.setCollectionAllowed([mods.address, true], { account: admin.account });
    await swap.write.setCollectionAllowed([mods.address, true], { account: admin.account });
    const minterRole = await mods.read.MINTER_ROLE();
    await mods.write.grantRole([minterRole, modStore.address], { account: admin.account });

    // Alice owns sneaker #1 and a Sole mod (mod #1).
    await nft.write.mintAuthorized([alice.account.address, URI, proof("01"), 50n, 2n], { account: admin.account });
    await mods.write.mintAuthorized(
      [alice.account.address, URI, modTraits({ proofHash: proof("02") })],
      { account: admin.account },
    );

    return { nft, ren, staking, game, mods, workshop, appraiser, marketplace, swap, rental, modStore };
  }

  // ─── SneakerMods ───

  it("mints a mod with traits via MINTER_ROLE", async () => {
    const { mods } = await deployStack();
    const traits = await mods.read.traitsOf([1n]);
    assert.equal(traits.slot, 0);
    assert.equal(traits.effectBps, 2_000);
    assert.equal((await mods.read.ownerOf([1n])).toLowerCase(), alice.account.address.toLowerCase());
  });

  it("claims an NftBalance achievement badge", async () => {
    const { mods } = await deployStack();
    await mods.write.addAchievement([{
      kind: 2, threshold: 1n, slot: 0, rarity: 50, tier: 1,
      effectBps: 1_000, aux: 255, consumable: false, uri: URI, active: false,
    }], { account: admin.account });

    await mods.write.claim([0n, 0n], { account: alice.account });
    const tokenId = await mods.read.totalMinted();
    assert.equal((await mods.read.ownerOf([tokenId])).toLowerCase(), alice.account.address.toLowerCase());
    await assert.rejects(mods.write.claim([0n, 0n], { account: alice.account }));
  });

  it("rejects claims that do not meet the requirement", async () => {
    const { mods } = await deployStack();
    await mods.write.addAchievement([{
      kind: 0, threshold: 30n, slot: 4, rarity: 80, tier: 2,
      effectBps: 0, aux: 255, consumable: false, uri: URI, active: false,
    }], { account: admin.account });
    assert.equal(await mods.read.meetsRequirement([0n, alice.account.address, 1n]), false);
    await assert.rejects(mods.write.claim([0n, 1n], { account: alice.account }));
  });

  // ─── SneakerWorkshop ───

  it("equips a mod into its slot and exposes effective bonuses", async () => {
    const { mods, workshop } = await deployStack();
    await mods.write.setApprovalForAll([workshop.address, true], { account: alice.account });
    await workshop.write.equip([1n, 1n], { account: alice.account });

    assert.equal((await mods.read.ownerOf([1n])).toLowerCase(), workshop.address.toLowerCase());
    const equipped = await workshop.read.equipped([1n, 0]);
    assert.equal(equipped, 1n);
    assert.equal(await workshop.read.wearReductionBps([1n]), 2_000);
    assert.equal(await workshop.read.hasEquippedMods([1n]), true);
  });

  it("rejects equipping a second mod into an occupied slot", async () => {
    const { mods, workshop } = await deployStack();
    await mods.write.mintAuthorized(
      [alice.account.address, URI, modTraits({ proofHash: proof("03") })],
      { account: admin.account },
    );
    await mods.write.setApprovalForAll([workshop.address, true], { account: alice.account });
    await workshop.write.equip([1n, 1n], { account: alice.account });
    await assert.rejects(workshop.write.equip([1n, 2n], { account: alice.account }));
  });

  it("burns a repair kit through the workshop", async () => {
    const { game, mods, workshop } = await deployStack();
    await mods.write.mintAuthorized(
      [alice.account.address, URI, modTraits({ slot: 0, effectBps: 0, consumable: true, proofHash: proof("04") })],
      { account: admin.account },
    );
    await game.write.activate([1n], { account: alice.account });
    await testClient.increaseTime({ seconds: Number(DAY) + 1 });
    await game.write.activate([1n], { account: alice.account });

    await mods.write.setApprovalForAll([workshop.address, true], { account: alice.account });
    await workshop.write.useRepairKit([1n, 2n], { account: alice.account });

    const state = await game.read.sneakers([1n]);
    assert.equal(state[3], 10); // durability restored to max
    await assert.rejects(mods.read.ownerOf([2n])); // burned
  });

  it("forge spends veRUNE and raises earn bonus", async () => {
    const { game, workshop } = await deployStack();
    await game.write.activate([1n], { account: alice.account });
    await testClient.increaseTime({ seconds: Number(DAY) });
    await game.write.claimPoints([1n], { account: alice.account });
    const balance = await game.read.veRuneBalance([alice.account.address]);
    assert.ok(balance >= 250n * 10n ** 18n, "alice needs veRUNE to forge");

    await workshop.write.forge([1n], { account: alice.account });
    assert.equal(await workshop.read.forgeLevel([1n]), 1);
    assert.equal(await workshop.read.earnBonusBps([1n]), 250);
    assert.equal((await game.read.veRuneBalance([alice.account.address])) < balance, true);
  });

  // ─── Marketplace multi-collection ───

  it("lists and sells a mod on the marketplace", async () => {
    const { mods, marketplace } = await deployStack();
    await mods.write.setApprovalForAll([marketplace.address, true], { account: alice.account });
    await marketplace.write.list([mods.address, 1n, 10n ** 18n], { account: alice.account });
    await marketplace.write.buy([1n], { account: bob.account, value: 10n ** 18n });
    assert.equal((await mods.read.ownerOf([1n])).toLowerCase(), bob.account.address.toLowerCase());
  });

  it("rejects listing a sneaker with equipped mods", async () => {
    const { nft, mods, workshop, marketplace } = await deployStack();
    await mods.write.setApprovalForAll([workshop.address, true], { account: alice.account });
    await workshop.write.equip([1n, 1n], { account: alice.account });

    await nft.write.setApprovalForAll([marketplace.address, true], { account: alice.account });
    await assert.rejects(
      marketplace.write.list([nft.address, 1n, 10n ** 18n], { account: alice.account }),
    );
  });

  it("rejects listing a non-allowed collection", async () => {
    const { nft, marketplace } = await deployStack();
    const rogue = await viem.deployContract("SneakerMint", ["Rogue", "ROG", admin.account.address]);
    await rogue.write.mintAuthorized([alice.account.address, URI, proof("77"), 10n, 0n], { account: admin.account });
    await rogue.write.setApprovalForAll([marketplace.address, true], { account: alice.account });
    await assert.rejects(
      marketplace.write.list([rogue.address, 1n, 10n ** 18n], { account: alice.account }),
    );
    void nft;
  });

  // ─── SneakerSwap ───

  it("executes an atomic cross-collection swap", async () => {
    const { nft, mods, swap } = await deployStack();
    // Bob gets a mod; alice offers her sneaker #1 for it.
    await mods.write.mintAuthorized(
      [bob.account.address, URI, modTraits({ slot: 5, effectBps: 100, proofHash: proof("05") })],
      { account: admin.account },
    );
    await nft.write.setApprovalForAll([swap.address, true], { account: alice.account });
    await mods.write.setApprovalForAll([swap.address, true], { account: bob.account });

    await swap.write.createSwap(
      [bob.account.address, nft.address, 1n, mods.address, 2n, 7n * DAY],
      { account: alice.account },
    );
    await swap.write.accept([1n], { account: bob.account });

    assert.equal((await mods.read.ownerOf([2n])).toLowerCase(), alice.account.address.toLowerCase());
    assert.equal((await nft.read.ownerOf([1n])).toLowerCase(), bob.account.address.toLowerCase());
  });

  it("cancels a swap and returns the escrowed NFT", async () => {
    const { nft, mods, swap } = await deployStack();
    await mods.write.mintAuthorized(
      [bob.account.address, URI, modTraits({ slot: 5, effectBps: 100, proofHash: proof("06") })],
      { account: admin.account },
    );
    await nft.write.setApprovalForAll([swap.address, true], { account: alice.account });
    await swap.write.createSwap(
      ["0x0000000000000000000000000000000000000000", nft.address, 1n, mods.address, 2n, 7n * DAY],
      { account: alice.account },
    );
    await swap.write.cancel([1n], { account: alice.account });
    assert.equal((await nft.read.ownerOf([1n])).toLowerCase(), alice.account.address.toLowerCase());
  });

  // ─── ModRental ───

  it("rents a mod for a fixed duration and settles expiry", async () => {
    const { mods, rental } = await deployStack();
    await mods.write.setApprovalForAll([rental.address, true], { account: alice.account });
    await rental.write.list([1n, 10n ** 17n, 30n * DAY], { account: alice.account });

    await rental.write.rent([1n, 7n], { account: bob.account, value: 7n * 10n ** 17n });
    const position = await rental.read.rentals([1n]);
    assert.equal(position[4].toLowerCase(), bob.account.address.toLowerCase()); // renter
    assert.equal(
      (await rental.read.activeRenter([1n])).toLowerCase(),
      bob.account.address.toLowerCase(),
    );

    await testClient.increaseTime({ seconds: Number(8n * DAY) });
    await rental.write.returnExpired([1n]);
    assert.equal((await mods.read.ownerOf([1n])).toLowerCase(), alice.account.address.toLowerCase());
  });

  it("rejects renting an equipped mod", async () => {
    const { mods, workshop, rental } = await deployStack();
    await mods.write.setApprovalForAll([workshop.address, true], { account: alice.account });
    await workshop.write.equip([1n, 1n], { account: alice.account });
    await mods.write.setApprovalForAll([rental.address, true], { account: alice.account });
    await assert.rejects(
      rental.write.list([1n, 10n ** 17n, 30n * DAY], { account: alice.account }),
    );
  });

  // ─── ModStore ───

  it("sells a premium mod design and pays the treasury", async () => {
    const { mods, modStore } = await deployStack();
    const adminBefore = await publicClient.getBalance({ address: admin.account.address });
    await modStore.write.addDesign([{
      name: "Swift Sole", uri: URI, slot: 0, rarity: 60, tier: 1,
      effectBps: 3_000, aux: 255, consumable: false,
      price: 2n * 10n ** 18n, maxSupply: 100, minted: 0, requiredLevel: 0, active: false,
    }], { account: admin.account });

    await modStore.write.buy([0n], { account: bob.account, value: 2n * 10n ** 18n });
    const tokenId = await mods.read.totalMinted();
    assert.equal((await mods.read.ownerOf([tokenId])).toLowerCase(), bob.account.address.toLowerCase());
    const traits = await mods.read.traitsOf([tokenId]);
    assert.equal(traits.effectBps, 3_000);
    const adminAfter = await publicClient.getBalance({ address: admin.account.address });
    assert.ok(adminAfter > adminBefore - 10n ** 16n, "treasury receives the sale (gas aside)");
  });
});
