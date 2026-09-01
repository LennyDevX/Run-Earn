import assert from "node:assert";
import { describe, it, before } from "mocha";
import hre from "hardhat";

const URI = "data:application/json;base64,eyJuYW1lIjoiVGVzdCJ9";
const PROOF1 = "0x" + "01".repeat(32);
const PROOF2 = "0x" + "02".repeat(32);

describe("SneakerMint (TypeScript integration)", () => {
  let viem: any;
  let admin: any;
  let alice: any;
  let publicClient: any;

  before(async () => {
    const connection = await hre.network.create();
    viem = connection.viem;
    [admin, alice] = await viem.getWalletClients();
    publicClient = await viem.getPublicClient();
  });

  async function deployNft() {
    return viem.deployContract("SneakerMint", ["RUN&EARN Sneakers", "RSNEAK", admin.account.address]);
  }

  it("sets name and symbol", async () => {
    const nft = await deployNft();
    assert.equal(await nft.read.name(), "RUN&EARN Sneakers");
    assert.equal(await nft.read.symbol(), "RSNEAK");
  });

  it("mints via mintAuthorized with MINTER_ROLE", async () => {
    const nft = await deployNft();
    const hash = await nft.write.mintAuthorized(
      [alice.account.address, URI, PROOF1, 50n, 2n],
      { account: admin.account },
    );
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    assert.equal(receipt.status, "success");
    assert.equal((await nft.read.ownerOf([1n])).toLowerCase(), alice.account.address.toLowerCase());
    assert.equal(await nft.read.totalMinted(), 1n);
  });

  it("returns correct traits after mint", async () => {
    const nft = await deployNft();
    await nft.write.mintAuthorized(
      [alice.account.address, URI, PROOF1, 75n, 3n],
      { account: admin.account },
    );
    const traits = await nft.read.traitsOf([1n]);
    assert.equal(traits.rarity, 75n);
    assert.equal(traits.tier, 3n);
    assert.equal(traits.proofHash.toLowerCase(), PROOF1.toLowerCase());
  });

  it("reverts on duplicate proof hash", async () => {
    const nft = await deployNft();
    await nft.write.mintAuthorized(
      [alice.account.address, URI, PROOF1, 50n, 2n],
      { account: admin.account },
    );
    await assert.rejects(
      nft.write.mintAuthorized(
        [alice.account.address, URI, PROOF1, 50n, 2n],
        { account: admin.account },
      ),
    );
  });

  it("reverts on invalid rarity > 100", async () => {
    const nft = await deployNft();
    await assert.rejects(
      nft.write.mintAuthorized(
        [alice.account.address, URI, PROOF1, 101n, 2n],
        { account: admin.account },
      ),
    );
  });

  it("reverts on invalid tier >= 8", async () => {
    const nft = await deployNft();
    await assert.rejects(
      nft.write.mintAuthorized(
        [alice.account.address, URI, PROOF1, 50n, 8n],
        { account: admin.account },
      ),
    );
  });

  it("reverts on mintWithProof when public mint disabled", async () => {
    const nft = await deployNft();
    await assert.rejects(
      nft.write.mintWithProof(
        [URI, PROOF1, 30n, 1n],
        { account: alice.account },
      ),
    );
  });

  it("allows mintWithProof when public mint enabled", async () => {
    const nft = await deployNft();
    await nft.write.setPublicMintEnabled([true], { account: admin.account });
    await nft.write.mintWithProof(
      [URI, PROOF1, 30n, 1n],
      { account: alice.account },
    );
    assert.equal((await nft.read.ownerOf([1n])).toLowerCase(), alice.account.address.toLowerCase());
  });

  it("pauses and blocks minting", async () => {
    const nft = await deployNft();
    await nft.write.pause({ account: admin.account });
    await assert.rejects(
      nft.write.mintAuthorized(
        [alice.account.address, URI, PROOF1, 50n, 2n],
        { account: admin.account },
      ),
    );
  });

  it("assigns sequential token IDs", async () => {
    const nft = await deployNft();
    await nft.write.mintAuthorized(
      [alice.account.address, URI, PROOF1, 50n, 2n],
      { account: admin.account },
    );
    await nft.write.mintAuthorized(
      [alice.account.address, URI, PROOF2, 50n, 2n],
      { account: admin.account },
    );
    assert.equal(await nft.read.totalMinted(), 2n);
  });
});
