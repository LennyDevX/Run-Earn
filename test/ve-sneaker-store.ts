import assert from "node:assert";
import { describe, it, before } from "mocha";
import hre from "hardhat";

const URI = "data:application/json;base64,eyJuYW1lIjoiVmVTbmVha2VyIn0";

describe("VeSneakerStore (TypeScript integration)", () => {
  let viem: any;
  let admin: any;
  let alice: any;
  let treasury: any;
  let publicClient: any;

  // USD targets $40/$62/$97/$150 converted at POL = $0.09764
  const COMMON_PRICE = 410_000_000_000_000_000_000n; // 410 POL
  const RARE_PRICE = 635_000_000_000_000_000_000n; // 635 POL
  const EPIC_PRICE = 993_000_000_000_000_000_000n; // 993 POL
  const MYTHIC_PRICE = 1_536_000_000_000_000_000_000n; // 1536 POL

  before(async () => {
    const connection = await hre.network.create();
    viem = connection.viem;
    [admin, alice, treasury] = await viem.getWalletClients();
    publicClient = await viem.getPublicClient();
  });

  async function deployStack() {
    const nft = await viem.deployContract("SneakerMint", ["RUN&EARN Sneakers", "RSNEAK", admin.account.address]);
    const store = await viem.deployContract("VeSneakerStore", [
      admin.account.address,
      nft.address,
      treasury.account.address,
    ]);

    const minterRole = await nft.read.MINTER_ROLE();
    await nft.write.grantRole([minterRole, store.address], { account: admin.account });

    await store.write.addDesign(["Ember Trail", URI, 20n, 0n, COMMON_PRICE, 1000n], { account: admin.account });
    await store.write.addDesign(["Sky Drift", URI, 45n, 1n, RARE_PRICE, 1000n], { account: admin.account });
    await store.write.addDesign(["Magma Rush", URI, 65n, 2n, EPIC_PRICE, 1000n], { account: admin.account });
    await store.write.addDesign(["Neon Runner", URI, 85n, 3n, MYTHIC_PRICE, 1000n], { account: admin.account });

    return { nft, store };
  }

  it("registers the four rarity designs", async () => {
    const { store } = await deployStack();
    assert.equal(await store.read.designCount(), 4n);
    assert.equal(await store.read.priceOf([3n]), MYTHIC_PRICE);
    const design = await store.read.designs([3n]);
    assert.equal(design.name, "Neon Runner");
    assert.equal(design.rarity, 85n);
    assert.equal(design.tier, 3n);
    assert.equal(design.maxSupply, 1000n);
  });

  it("sells a veSneaker on demand and pays the treasury", async () => {
    const { nft, store } = await deployStack();
    const treasuryBefore = await publicClient.getBalance({ address: treasury.account.address });

    await store.write.buy([0n], { account: alice.account, value: COMMON_PRICE });

    assert.equal((await nft.read.ownerOf([1n])).toLowerCase(), alice.account.address.toLowerCase());
    const treasuryAfter = await publicClient.getBalance({ address: treasury.account.address });
    assert.equal(treasuryAfter - treasuryBefore, COMMON_PRICE);
    assert.equal(await store.read.remaining([0n]), 999n);
  });

  it("writes the design rarity and tier into the NFT traits", async () => {
    const { nft, store } = await deployStack();
    await store.write.buy([3n], { account: alice.account, value: MYTHIC_PRICE });
    const traits = await nft.read.traitsOf([1n]);
    assert.equal(traits.rarity, 85n);
    assert.equal(traits.tier, 3n);
  });

  it("mints batch copies with unique proofs", async () => {
    const { nft, store } = await deployStack();
    await store.write.buyBatch([0n, 5n], { account: alice.account, value: COMMON_PRICE * 5n });

    assert.equal(await nft.read.balanceOf([alice.account.address]), 5n);
    assert.equal(await store.read.designs([0n]).then((d: any) => d.minted), 5n);

    const first = await nft.read.traitsOf([1n]);
    const second = await nft.read.traitsOf([2n]);
    assert.notEqual(first.proofHash, second.proofHash);
  });

  it("rejects the wrong payment amount", async () => {
    const { store } = await deployStack();
    await assert.rejects(
      store.write.buy([0n], { account: alice.account, value: COMMON_PRICE - 1n }),
    );
  });

  it("rejects buying an inactive design", async () => {
    const { store } = await deployStack();
    await store.write.updateDesign([0n, COMMON_PRICE, 1000n, false], { account: admin.account });
    await assert.rejects(
      store.write.buy([0n], { account: alice.account, value: COMMON_PRICE }),
    );
  });

  it("enforces the supply cap", async () => {
    const { store } = await deployStack();
    await store.write.updateDesign([0n, COMMON_PRICE, 2n, true], { account: admin.account });
    await store.write.buy([0n], { account: alice.account, value: COMMON_PRICE });
    await store.write.buy([0n], { account: alice.account, value: COMMON_PRICE });
    await assert.rejects(
      store.write.buy([0n], { account: alice.account, value: COMMON_PRICE }),
    );
  });

  it("reserves copies to the treasury without payment", async () => {
    const { nft, store } = await deployStack();
    await store.write.reserveMint([0n, treasury.account.address, 10n], { account: admin.account });
    assert.equal(await nft.read.balanceOf([treasury.account.address]), 10n);
    assert.equal(await store.read.remaining([0n]), 990n);
  });

  it("quotes the total price for a batch", async () => {
    const { store } = await deployStack();
    assert.equal(await store.read.quote([3n, 3n]), MYTHIC_PRICE * 3n);
  });

  it("reports availability", async () => {
    const { store } = await deployStack();
    assert.equal(await store.read.isAvailable([0n]), true);
    assert.equal(await store.read.isAvailable([99n]), false);
    await store.write.updateDesign([0n, COMMON_PRICE, 1000n, false], { account: admin.account });
    assert.equal(await store.read.isAvailable([0n]), false);
  });

  it("updates price, supply, and URI via admin", async () => {
    const { store } = await deployStack();
    await store.write.updateDesign([1n, 5n * 10n ** 18n, 500n, true], { account: admin.account });
    assert.equal(await store.read.priceOf([1n]), 5n * 10n ** 18n);

    await store.write.updateDesignUri([0n, "ipfs://new-uri"], { account: admin.account });
    assert.equal(await store.read.designs([0n]).then((d: any) => d.uri), "ipfs://new-uri");
  });

  it("rejects non-admin configuration", async () => {
    const { store } = await deployStack();
    await assert.rejects(
      store.write.addDesign(["X", URI, 20n, 0n, 10n ** 18n, 10n], { account: alice.account }),
    );
  });

  it("withdraws stranded proceeds", async () => {
    const { store } = await deployStack();
    // The store rejects plain transfers (receive reverts), so simulate forced
    // funds the way a selfdestruct or a failed treasury transfer would.
    const testClient = await viem.getTestClient();
    await testClient.setBalance({ address: store.address, value: 5n * 10n ** 18n });
    await store.write.withdrawProceeds([treasury.account.address], { account: admin.account });
    assert.equal(await publicClient.getBalance({ address: store.address }), 0n);
  });

  it("rejects plain POL transfers to the store", async () => {
    const { store } = await deployStack();
    await assert.rejects(
      admin.sendTransaction({ to: store.address, value: 10n ** 18n }),
    );
  });
});
