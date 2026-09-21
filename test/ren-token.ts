import assert from "node:assert";
import { describe, it, before } from "mocha";
import hre from "hardhat";

describe("RENToken (TypeScript integration)", () => {
  let viem: any;
  let admin: any;
  let minter: any;
  let alice: any;

  before(async () => {
    const connection = await hre.network.create();
    viem = connection.viem;
    [admin, minter, alice] = await viem.getWalletClients();
  });

  async function deployRune() {
    return viem.deployContract("RENToken", [admin.account.address, minter.account.address]);
  }

  it("sets name, symbol, and decimals", async () => {
    const rune = await deployRune();
    assert.equal(await rune.read.name(), "Run and Earn Rune");
    assert.equal(await rune.read.symbol(), "REN");
    assert.equal(await rune.read.decimals(), 18n);
  });

  it("grants roles to admin and minter", async () => {
    const rune = await deployRune();
    const DEFAULT_ADMIN_ROLE = await rune.read.DEFAULT_ADMIN_ROLE();
    const MINTER_ROLE = await rune.read.MINTER_ROLE();
    assert.equal(await rune.read.hasRole([DEFAULT_ADMIN_ROLE, admin.account.address]), true);
    assert.equal(await rune.read.hasRole([MINTER_ROLE, minter.account.address]), true);
  });

  it("mints tokens via MINTER_ROLE", async () => {
    const rune = await deployRune();
    const amount = 1000n * 10n ** 18n;
    await rune.write.mint([alice.account.address, amount], { account: minter.account });
    assert.equal(await rune.read.balanceOf([alice.account.address]), amount);
    assert.equal(await rune.read.totalMinted(), amount);
  });

  it("reverts when non-minter calls mint", async () => {
    const rune = await deployRune();
    await assert.rejects(
      rune.write.mint([alice.account.address, 1000n], { account: alice.account }),
    );
  });

  it("reverts when mint exceeds MAX_SUPPLY", async () => {
    const rune = await deployRune();
    const maxSupply = await rune.read.MAX_SUPPLY();
    await assert.rejects(
      rune.write.mint([alice.account.address, maxSupply + 1n], { account: minter.account }),
    );
  });

  it("burns tokens from holder", async () => {
    const rune = await deployRune();
    const amount = 1000n * 10n ** 18n;
    await rune.write.mint([alice.account.address, amount], { account: minter.account });
    await rune.write.burn([400n * 10n ** 18n], { account: alice.account });
    assert.equal(await rune.read.balanceOf([alice.account.address]), 600n * 10n ** 18n);
  });

  it("pauses and blocks transfers", async () => {
    const rune = await deployRune();
    const amount = 1000n * 10n ** 18n;
    await rune.write.mint([alice.account.address, amount], { account: minter.account });
    await rune.write.pause({ account: admin.account });
    await assert.rejects(
      rune.write.transfer([admin.account.address, 100n], { account: alice.account }),
    );
  });

  it("reverts on zero admin in constructor", async () => {
    await assert.rejects(
      viem.deployContract("RENToken", ["0x0000000000000000000000000000000000000000", minter.account.address]),
    );
  });
});
