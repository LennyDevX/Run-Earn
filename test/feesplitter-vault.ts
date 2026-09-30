import assert from "node:assert";
import { describe, it, before } from "mocha";
import { parseEther } from "viem";
import hre from "hardhat";

describe("FeeSplitter and SneakerVault (TypeScript integration)", () => {
  let viem: any;
  let admin: any;
  let treasury: any;
  let stakingReserve: any;
  let redemption: any;
  let team: any;
  let buyer: any;
  let publicClient: any;

  let splitter: any;
  let vault: any;
  let nft: any;
  let veStore: any;

  const DISCOUNT_PERK = 0n;
  const ACCESS_PERK = 1n;

  before(async function () {
    this.timeout(120_000);
    const connection = await hre.network.create();
    viem = connection.viem;
    [admin, treasury, stakingReserve, redemption, team, buyer] = await viem.getWalletClients();
    publicClient = await viem.getPublicClient();

    const ren = await viem.deployContract("RENToken", [admin.account.address, admin.account.address]);
    nft = await viem.deployContract("SneakerMint", ["Airen Sneakers", "ASNEAK", admin.account.address]);
    const staking = await viem.deployContract("SneakerStaking", [
      admin.account.address,
      nft.address,
      ren.address,
      parseEther("1000"),
      280n,
      0n,
      800n,
      [50n, 80n, 150n, 180n],
      2_592_000n,
    ]);
    const game = await viem.deployContract("SneakerGame", [
      admin.account.address,
      nft.address,
      ren.address,
      [parseEther("100"), parseEther("200"), parseEther("400"), parseEther("800")],
      100n,
      100n,
      1n,
      parseEther("50"),
      parseEther("100"),
    ]);
    const mods = await viem.deployContract("SneakerMods", [
      "Airen Mods",
      "AMOD",
      admin.account.address,
      nft.address,
      game.address,
      staking.address,
    ]);
    const workshop = await viem.deployContract("SneakerWorkshop", [
      admin.account.address,
      nft.address,
      mods.address,
      game.address,
      staking.address,
      5_000, // conditionFloorBps
      31_536_000n, // seasonSeconds
    ]);
    const thresholds = [0n, 300n, 800n, 1600n, 2800n, 4500n, 7000n, 10500n, 15000n, 21000n];
    const progress = await viem.deployContract("PlayerProgress", [
      admin.account.address,
      nft.address,
      mods.address,
      game.address,
      admin.account.address, // marketplace stub (zero trades)
      workshop.address,
      staking.address,
      thresholds,
    ]);
    vault = await viem.deployContract("SneakerVault", [
      admin.account.address,
      nft.address,
      mods.address,
      nft.address,
      workshop.address,
      staking.address,
      progress.address,
    ]);
    veStore = await viem.deployContract("VeSneakerStore", [
      admin.account.address,
      nft.address,
      admin.account.address,
    ]);

    // Grant MINTER_ROLE so the store can mint on demand.
    const minterRole = await nft.read.MINTER_ROLE();
    await nft.write.grantRole([minterRole, veStore.address], { account: admin.account });

    // Register one Mythic design.
    await veStore.write.addDesign(
      ["Astra", "ipfs://astra", 85n, 3n, parseEther("100"), 1000n],
      { account: admin.account },
    );

    // Mint a Mythic sneaker to the buyer via the store.
    await veStore.write.buy([0n], { account: buyer.account, value: parseEther("100") });

    // Configure the vault perks.
    await vault.write.setPerk([DISCOUNT_PERK, 0n, 1000n, 3n, 0n, 0n, 0n, 0n, true], { account: admin.account });
    await vault.write.setPerk([ACCESS_PERK, 1n, 0n, 3n, 0n, 0n, 0n, 0n, true], { account: admin.account });

    // Link the vault to the store for discounts.
    await veStore.write.setVault([vault.address], { account: admin.account });

    // Configure the fee splitter 40/30/20/10.
    splitter = await viem.deployContract("FeeSplitter", [admin.account.address]);
    await splitter.write.setRecipients(
      [
        [treasury.account.address, stakingReserve.account.address, redemption.account.address, team.account.address],
        [4000n, 3000n, 2000n, 1000n],
      ],
      { account: admin.account },
    );
  });

  it("grants a Mythic-holder discount on the veSneaker store", async () => {
    const discounted = await veStore.read.quote([0n, 1n], { account: buyer.account });
    assert.equal(discounted, parseEther("90")); // 100 - 10%
  });

  it("charges full price for a wallet without an eligible sneaker", async () => {
    const full = await veStore.read.quote([0n, 1n], { account: admin.account });
    assert.equal(full, parseEther("100"));
  });

  it("buys at the discounted price with exact payment", async () => {
    const before = await nft.read.balanceOf([buyer.account.address]);
    await veStore.write.buy([0n], { account: buyer.account, value: parseEther("90") });
    const after = await nft.read.balanceOf([buyer.account.address]);
    assert.equal(after - before, 1n);
  });

  it("rejects a discounted purchase with the full price", async () => {
    await assert.rejects(
      veStore.write.buy([0n], { account: buyer.account, value: parseEther("100") }),
    );
  });

  it("claims an access perk once per wallet", async () => {
    await vault.write.claimPerk([ACCESS_PERK], { account: buyer.account });
    const claimed = await vault.read.accessClaimed([ACCESS_PERK, buyer.account.address]);
    assert.equal(claimed, true);

    await assert.rejects(vault.write.claimPerk([ACCESS_PERK], { account: buyer.account }));
  });

  it("rejects an access claim for an ineligible wallet", async () => {
    await assert.rejects(vault.write.claimPerk([ACCESS_PERK], { account: admin.account }));
  });

  it("distributes fees pro-rata to all recipients", async () => {
    await admin.sendTransaction({ to: splitter.address, value: parseEther("1") });
    const pending = await splitter.read.pendingFees();
    assert.equal(pending, parseEther("1"));

    const balances = await Promise.all(
      [treasury, stakingReserve, redemption, team].map((c) =>
        publicClient.getBalance({ address: c.account.address }),
      ),
    );

    await splitter.write.distribute({ account: admin.account });

    const after = await Promise.all(
      [treasury, stakingReserve, redemption, team].map((c) =>
        publicClient.getBalance({ address: c.account.address }),
      ),
    );

    assert.equal(after[0] - balances[0], parseEther("0.4"));
    assert.equal(after[1] - balances[1], parseEther("0.3"));
    assert.equal(after[2] - balances[2], parseEther("0.2"));
    assert.equal(after[3] - balances[3], parseEther("0.1"));
    assert.equal(await splitter.read.pendingFees(), 0n);
  });

  it("rejects recipient weights that do not sum to 100%", async () => {
    await assert.rejects(
      splitter.write.setRecipients([[treasury.account.address], [9_999n]], { account: admin.account }),
    );
  });
});
