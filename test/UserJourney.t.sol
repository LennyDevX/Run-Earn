    // SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";

import {SneakerMint} from "../contracts/SneakerMint.sol";
import {RENToken} from "../contracts/RENToken.sol";
import {SneakerGame} from "../contracts/SneakerGame.sol";
import {SneakerStaking} from "../contracts/SneakerStaking.sol";
import {SneakerAppraiser} from "../contracts/SneakerAppraiser.sol";
import {SneakerMarketplace} from "../contracts/SneakerMarketplace.sol";
import {SneakerMods} from "../contracts/SneakerMods.sol";
import {SneakerWorkshop} from "../contracts/SneakerWorkshop.sol";
import {VeSneakerStore} from "../contracts/VeSneakerStore.sol";
import {PlayerProgress} from "../contracts/PlayerProgress.sol";
import {FeeSplitter} from "../contracts/FeeSplitter.sol";
import {ModStore} from "../contracts/ModStore.sol";
import {SneakerTabArena} from "../contracts/SneakerTabArena.sol";
import {SneakerVault} from "../contracts/SneakerVault.sol";

/// ─────────────────────────── End-to-end user journey ───────────────────────
/// Every other suite in this repository tests **one contract's surface** with its
/// own fixture. Nothing proved that the contracts work *together in the order a
/// real visitor touches them* — which is a different class of bug: a gate that
/// passes in isolation but blocks the next step, a boost written where nothing
/// reads it, a fee that accrues but never arrives.
///
/// This file deploys the **whole system, wired exactly like `scripts/deploy.ts`**,
/// and walks one ordinary user through it:
///
///   1. buys a veSneaker from the store
///   2. activates it in the game and earns veRUNE
///   3. equips a mod that raises the earn rate
///   4. stakes the sneaker and deposits POL for yield
///   5. plays the tab arena for an APY boost
///   6. unstakes, lists on the marketplace and sells
///   7. the protocol collects and distributes its fee
///   8. redeems veRUNE for REN
///
/// **What this is not.** It does not replace the per-contract suites — it cannot
/// cover every revert path, and it should not try. It answers one question the
/// unit tests cannot: *does the product work end to end?*
contract UserJourneyTest is Test {
    // ── Deployed system ───────────────────────────────────────────────
    SneakerMint nft;
    RENToken ren;
    SneakerGame game;
    SneakerStaking staking;
    SneakerAppraiser appraiser;
    SneakerMarketplace market;
    SneakerMods mods;
    SneakerWorkshop workshop;
    VeSneakerStore store;
    PlayerProgress progress;
    FeeSplitter splitter;
    ModStore modStore;
    SneakerTabArena arena;
    SneakerVault vault;

    // ── Actors ────────────────────────────────────────────────────────
    address admin = address(0xA11CE);
    /// The ordinary visitor: no special role, no allowance beyond what the UI does.
    address alice = address(0xA1);
    /// The counterparty who buys her listing.
    address bob = address(0xB0B);
    address treasury = address(0x7AEA);
    /// The splitter's single recipient — the shape the mainnet deployment has.
    address feeRecipient = address(0xFEE);

    /// The arena's server-side signer.
    uint256 constant SIGNER_PK = 0x5EED;
    address signer;

    string constant URI = "data:application/json;base64,eyJuYW1lIjoiQWlyZW4ifQ==";

    // ── Parameters, taken from the mainnet deployment ─────────────────
    uint256[4] tierValues = [uint256(0), 1 ether, 3 ether, 8 ether];
    uint256[4] tierBasePoints = [uint256(100 ether), 200 ether, 400 ether, 800 ether];
    uint64[4] tierApyBonus = [uint64(50), 80, 150, 180];
    uint256[] levelThresholds = [uint256(0), 300, 800, 1600, 2800, 4500, 7000, 10500, 15000, 21000];

    /// Read once in setUp: calling the getter inside a struct literal would
    /// consume the surrounding `vm.prank`, silently changing who pays.
    uint8 upperSlot;

    uint256 constant POL_DEPOSIT = 100 ether;
    uint256 constant REPAIR_COST = 50 ether;

    function setUp() public {
        signer = vm.addr(SIGNER_PK);

        // ── Deploy, in `deploy.ts` order ──────────────────────────────
        ren = new RENToken(admin, admin);
        nft = new SneakerMint("Airen Sneakers", "ASNEAK", admin);
        staking = new SneakerStaking(
            admin,
            address(nft),
            address(ren),
            1_000 ether, // rewardTokensPerNftYear
            280, // baseApyBps 2.80%
            0, // perNftBonusBps
            800, // maxApyBps 8%
            tierApyBonus,
            30 days
        );
        appraiser = new SneakerAppraiser(admin, address(nft), 0.5 ether, tierValues, 0.01 ether, 10_000);
        splitter = new FeeSplitter(admin);
        market = new SneakerMarketplace(admin, address(nft), address(appraiser), address(staking), 250, 12_000, address(splitter));
        game = new SneakerGame(
            admin,
            address(nft),
            address(ren),
            tierBasePoints,
            100, // streakStep: +1% per day
            10, // maxDurability
            1, // wearPerActivation
            REPAIR_COST,
            100 ether // redemptionRate: 100 veRUNE = 1 REN
        );
        mods = new SneakerMods("Airen Mods", "AMOD", admin, address(nft), address(game), address(staking));
        upperSlot = mods.SLOT_UPPER();
        workshop = new SneakerWorkshop(admin, address(nft), address(mods), address(game), address(staking), 5000, 365 days);
        store = new VeSneakerStore(admin, address(nft), payable(treasury));
        progress = new PlayerProgress(
            admin,
            address(nft),
            address(mods),
            address(game),
            address(market),
            address(workshop),
            address(staking),
            levelThresholds
        );
        modStore = new ModStore(admin, address(mods), payable(treasury));
        arena = new SneakerTabArena(admin, address(nft), address(workshop), address(staking), signer);
        vault = new SneakerVault(
            admin,
            address(nft),
            address(mods),
            address(nft),
            address(workshop),
            address(staking),
            address(progress)
        );

        // ── Wiring, mirroring the post-deploy script ─────────────────
        vm.startPrank(admin);
        nft.grantRole(nft.MINTER_ROLE(), address(store));
        mods.grantRole(mods.MINTER_ROLE(), address(modStore));
        // The arena writes its boost into the staking contract, which only
        // accepts it from a holder of TAB_ARENA_ROLE — granted by the deploy
        // script and therefore easy to forget in a fixture.
        staking.grantRole(staking.TAB_ARENA_ROLE(), address(arena));

        game.setWorkshop(address(workshop));
        game.setBoosts(address(workshop));
        staking.setBoosts(address(workshop));
        appraiser.setBoosts(address(workshop));
        market.setWorkshop(address(workshop));
        market.setCollectionAllowed(address(mods), true);
        mods.setWorkshop(address(workshop));
        mods.setProgress(address(progress));
        store.setProgress(address(progress));
        modStore.setProgress(address(progress));
        store.setVault(address(vault));
        modStore.setVault(address(vault));

        // The protocol's fee recipient — one wallet, which is what mainnet has.
        address[] memory recipients = new address[](1);
        recipients[0] = feeRecipient;
        uint256[] memory weights = new uint256[](1);
        weights[0] = 10_000;
        splitter.setRecipients(recipients, weights);

        // ── Seed the catalogue ───────────────────────────────────────
        // Astra is Mythic and index 0 — the catalogue is deliberately not in tier
        // order, which is the trap the deploy script hit once.
        store.addDesign("Astra", URI, 85, 3, 150 ether, 1000);
        store.addDesign("Sol", URI, 45, 1, 62 ether, 1000);
        store.addDesign("Luna", URI, 65, 2, 97 ether, 1000);

        // Fund the staking reward reserve separately from principal. The admin
        // needs POL for this — the reserve is the protocol's money, not the
        // users'. Still inside the admin prank started above.
        vm.deal(admin, 10_000 ether);
        staking.fundPOLRewards{value: 500 ether}();

        // Fund the veRUNE redemption pool and switch redemption on.
        ren.mint(address(game), 1_000_000 ether);
        game.setRedemptionEnabled(true);
        vm.stopPrank();

        vm.deal(alice, 10_000 ether);
        vm.deal(bob, 10_000 ether);
    }

    // ─────────────────────────────────────────────────────────────────
    //  The journey
    // ─────────────────────────────────────────────────────────────────

    function test_CommonUserJourney() public {
        uint256 tokenId;

        // ── 1. Buy a veSneaker ───────────────────────────────────────
        {
            uint256 price = store.priceOf(0);
            uint256 treasuryBefore = treasury.balance;

            vm.prank(alice);
            tokenId = store.buy{value: price}(0);

            assertEq(nft.ownerOf(tokenId), alice, "the sneaker belongs to the buyer");
            assertEq(treasury.balance - treasuryBefore, price, "the full price reaches the treasury");
            assertEq(uint8(nft.kindOf(tokenId)), 0, "a veSneaker is playable, not a collectible");

            SneakerMint.SneakerTraits memory traits = nft.traitsOf(tokenId);
            assertEq(traits.rarity, 85, "rarity comes from the design");
            assertEq(traits.tier, 3, "Astra is Mythic even though it is design index 0");
        }

        // ── 2. Activate it and let it earn ───────────────────────────
        {
            vm.prank(alice);
            game.activate(tokenId);

            (, , uint256 streak, uint256 durability, , , , ) = game.sneakers(tokenId);
            assertEq(streak, 1, "first activation starts the streak");
            assertEq(durability, 9, "activation wears the sneaker by one");

            vm.warp(block.timestamp + 12 hours);
            assertGt(game.pendingPoints(tokenId), 0, "the sneaker earns while inside its window");

            vm.prank(alice);
            game.claimPoints(tokenId);
            assertGt(game.veRuneBalance(alice), 0, "claiming moves points into the wallet balance");
        }

        // ── 3. Equip a mod that raises the earn rate ─────────────────
        {
            uint256 rateBefore = game.earnRatePerSecond(tokenId);

            vm.prank(admin);
            uint256 upperMod = mods.mintAuthorized(
                alice,
                URI,
                SneakerMods.ModTraits({
                    slot: upperSlot,
                    rarity: 60,
                    tier: 2,
                    effectBps: 2500, // +25% earn rate
                    aux: 0,
                    consumable: false,
                    proofHash: keccak256("upper-1")
                })
            );

            vm.startPrank(alice);
            mods.approve(address(workshop), upperMod);
            workshop.equip(tokenId, upperMod);
            vm.stopPrank();

            assertEq(workshop.equipped(tokenId, upperSlot), upperMod, "the mod occupies its slot");
            assertGt(game.earnRatePerSecond(tokenId), rateBefore, "an Upper mod raises the earn rate");
        }

        // ── 4. Stake the sneaker and deposit POL ─────────────────────
        {
            uint256 apyBase = staking.effectiveApyBps(alice);

            vm.startPrank(alice);
            staking.depositPOL{value: POL_DEPOSIT}();
            nft.approve(address(staking), tokenId);
            staking.stake(tokenId);
            vm.stopPrank();

            assertEq(staking.stakedOwner(tokenId), alice, "the vault custodies the sneaker");
            assertEq(nft.ownerOf(tokenId), address(staking), "the NFT actually moved");
            assertGt(staking.effectiveApyBps(alice), apyBase, "a staked veSneaker boosts the POL APY");

            // A staked sneaker cannot be sold — and the protection is one layer
            // earlier than the marketplace's own staked check: the vault owns the
            // NFT, so the seller cannot even approve it for sale. Asserting the
            // approve revert is asserting the real first line of defence.
            vm.prank(alice);
            vm.expectRevert();
            nft.approve(address(market), tokenId);
        }

        // ── 5. Play the tab arena for an APY boost ───────────────────
        {
            uint256 apyBeforeArena = staking.effectiveApyBps(alice);

            vm.prank(alice);
            arena.startSession(tokenId);

            uint32 points = 200;
            uint64 deadline = uint64(block.timestamp + 10 minutes);
            bytes32 digest = keccak256(
                abi.encodePacked(address(arena), alice, arena.sessionNonce(alice), points, deadline)
            );
            // The arena recovers with EIP-191, so the signed hash is the prefixed one.
            bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(SIGNER_PK, ethHash);

            vm.prank(alice);
            arena.completeSession(points, deadline, abi.encodePacked(r, s, v));

            assertGt(staking.effectiveApyBps(alice), apyBeforeArena, "the arena boost lands in the staking contract");
        }

        // ── 6. Unstake, list, and sell ───────────────────────────────
        {
            vm.warp(block.timestamp + 31 days);
            vm.prank(alice);
            staking.unstake(tokenId);
            assertEq(nft.ownerOf(tokenId), alice, "unstaking returns the NFT");

            // A sneaker with an equipped mod cannot be listed — mods must come off.
            vm.prank(alice);
            nft.approve(address(market), tokenId);
            vm.prank(alice);
            vm.expectRevert();
            market.list(address(nft), tokenId, 100 ether);

            vm.prank(alice);
            workshop.unequip(tokenId, upperSlot);

            uint256 listingPrice = 120 ether;
            vm.prank(alice);
            market.list(address(nft), tokenId, listingPrice);

            uint256 sellerBefore = alice.balance;
            vm.prank(bob);
            market.buy{value: listingPrice}(1); // _nextListingId starts at 1

            uint256 fee = (listingPrice * 250) / 10_000;
            assertEq(nft.ownerOf(tokenId), bob, "the buyer receives the sneaker");
            assertEq(alice.balance - sellerBefore, listingPrice - fee, "the seller receives the price minus the fee");
            assertEq(market.accumulatedFees(), fee, "the fee accrues in the marketplace");
        }

        // ── 7. The protocol collects and distributes its fee ─────────
        // Two hops, and the first is privileged. Skipping it leaves the money in
        // the marketplace forever with no error anywhere — the failure this
        // sequence exists to catch.
        {
            uint256 fee = market.accumulatedFees();
            uint256 recipientBefore = feeRecipient.balance;

            vm.prank(admin);
            market.withdrawFeesToCollector();
            assertEq(market.accumulatedFees(), 0, "the marketplace no longer holds the fee");
            assertEq(address(splitter).balance, fee, "the splitter received it");

            splitter.distribute(); // permissionless
            assertEq(feeRecipient.balance - recipientBefore, fee, "the recipient is paid");
        }

        // ── 8. Redeem veRUNE for REN ─────────────────────────────────
        // The sneaker was sold in stage 6, so there is nothing left to claim on
        // it — the balance comes from the claim in stage 2. That is the point of
        // "live standing": the earnings already banked survive the sale.
        //
        // This stage is also the regression test for a 10^18 bug: the contract
        // used to divide points by `redemptionRate` directly, so 100 veRUNE paid
        // 1 wei of REN instead of 1 REN and the whole play-to-earn loop was
        // worthless. 100 veRUNE must now buy exactly 1 REN.
        {
            uint256 veRuneBalance = game.veRuneBalance(alice);
            assertGt(veRuneBalance, 0, "the veRUNE earned earlier survives the sale");

            if (veRuneBalance >= 100 ether) {
                uint256 renBefore = ren.balanceOf(alice);
                vm.prank(alice);
                game.redeem(100 ether);
                assertEq(
                    ren.balanceOf(alice) - renBefore,
                    (100 ether * 1e18) / game.redemptionRate(),
                    "100 veRUNE is worth 1 REN at the default rate"
                );
            }
        }

        // ── 9. The profile stays readable after the sale ─────────────
        // Levels are live standing: the sneaker was sold, so the level that came
        // from holding it is gone. That is the intended behaviour, not a bug.
        progress.levelOf(alice);
    }

    /// The fee path in isolation, because it is the one with a silent failure mode.
    function test_FeePath_EndToEnd() public {
        uint256 price = store.priceOf(0);
        vm.prank(alice);
        uint256 tokenId = store.buy{value: price}(0);

        vm.prank(alice);
        nft.approve(address(market), tokenId);
        vm.prank(alice);
        market.list(address(nft), tokenId, 200 ether);
        uint256 listingId = 1;

        vm.prank(bob);
        market.buy{value: 200 ether}(listingId);

        uint256 fee = (200 ether * 250) / 10_000;
        assertEq(market.accumulatedFees(), fee, "fee accrued");

        // Step 1 is privileged: without it the money never leaves the marketplace.
        vm.prank(alice);
        vm.expectRevert();
        market.withdrawFeesToCollector();

        vm.prank(admin);
        market.withdrawFeesToCollector();

        // Step 2 is permissionless: the split is deterministic, so there is no
        // griefing vector and no keeper key required.
        uint256 before = feeRecipient.balance;
        vm.prank(bob);
        splitter.distribute();

        assertEq(feeRecipient.balance - before, fee, "the recipient receives exactly the fee");
        assertEq(address(splitter).balance, 0, "nothing is stranded in the splitter");
    }

    /// A collectible must never reach the gameplay loops. This is the single most
    /// load-bearing gate in the product: an AI collectible offered as a runner
    /// would earn veRUNE against a design it was never priced for.
    function test_CollectibleCannotEnterGameplay() public {
        vm.prank(admin);
        nft.setPublicMintEnabled(true);

        vm.prank(alice);
        uint256 collectibleId = nft.mintCollectibleWithProof(
            URI,
            keccak256("collectible-1"),
            keccak256("silhouette"),
            keccak256("colorway"),
            70,
            2
        );

        assertEq(uint8(nft.kindOf(collectibleId)), 1, "it is a collectible");

        vm.prank(alice);
        vm.expectRevert();
        game.activate(collectibleId);

        vm.prank(alice);
        vm.expectRevert();
        staking.stake(collectibleId);
    }
}
