// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {SneakerMint} from "../contracts/SneakerMint.sol";
import {RENToken} from "../contracts/RENToken.sol";
import {SneakerStaking} from "../contracts/SneakerStaking.sol";
import {SneakerAppraiser} from "../contracts/SneakerAppraiser.sol";
import {SneakerMarketplace} from "../contracts/SneakerMarketplace.sol";
import {SneakerGame} from "../contracts/SneakerGame.sol";
import {SneakerMods} from "../contracts/SneakerMods.sol";
import {SneakerWorkshop} from "../contracts/SneakerWorkshop.sol";
import {PlayerProgress} from "../contracts/PlayerProgress.sol";

contract PlayerProgressTest is Test {
    SneakerMint nft;
    RENToken ren;
    SneakerStaking staking;
    SneakerAppraiser appraiser;
    SneakerMarketplace marketplace;
    SneakerGame game;
    SneakerMods mods;
    SneakerWorkshop workshop;
    PlayerProgress progress;

    address admin = address(0xA11CE);
    address alice = address(0xA1);
    address bob = address(0xB0);

    bytes32 constant PROOF1 = keccak256("pp-proof-1");
    bytes32 constant PROOF2 = keccak256("pp-proof-2");
    bytes32 constant MOD1 = keccak256("pp-mod-1");
    string constant URI = "data:application/json;base64,eyJuYW1lIjoiVGVzdCJ9";

    uint256[4] tierBase = [uint256(100 ether), 200 ether, 400 ether, 800 ether];

    function setUp() public {
        nft = new SneakerMint("Airen Sneakers", "ASNEAK", admin);
        ren = new RENToken(admin, admin);
        staking = new SneakerStaking(admin, address(nft), address(ren), 1000 ether, 280, 0, 800, [uint64(50), 80, 150, 180], 30 days);
        game = new SneakerGame(admin, address(nft), address(ren), tierBase, 100, 10, 1, 50 ether, 100 ether);
        mods = new SneakerMods("Airen Mods", "AMOD", admin, address(nft), address(game), address(staking));
        workshop = new SneakerWorkshop(admin, address(nft), address(mods), address(game), address(staking), 250 ether, 5, 250, 10);
        appraiser = new SneakerAppraiser(admin, address(nft), 0.5 ether, [uint256(0), 1 ether, 3 ether, 8 ether], 0.01 ether, 10_000);
        marketplace = new SneakerMarketplace(admin, address(nft), address(appraiser), address(staking), 250, 12_000, admin);

        uint256[] memory thresholds = new uint256[](10);
        thresholds[0] = 0;
        thresholds[1] = 300;
        thresholds[2] = 800;
        thresholds[3] = 1600;
        thresholds[4] = 2800;
        thresholds[5] = 4500;
        thresholds[6] = 7000;
        thresholds[7] = 10500;
        thresholds[8] = 15000;
        thresholds[9] = 21000;
        progress = new PlayerProgress(
            admin,
            address(nft),
            address(mods),
            address(game),
            address(marketplace),
            address(workshop),
            address(staking),
            thresholds
        );

        vm.startPrank(admin);
        game.setBoosts(address(workshop));
        game.setWorkshop(address(workshop));
        staking.setBoosts(address(workshop));
        appraiser.setBoosts(address(workshop));
        mods.setWorkshop(address(workshop));
        mods.setProgress(address(progress));
        marketplace.setWorkshop(address(workshop));
        marketplace.setCollectionAllowed(address(mods), true);
        vm.stopPrank();

        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    // ─────────── XP sources ───────────

    function testSneakerAndModXp() public {
        vm.startPrank(admin);
        nft.mintAuthorized(alice, URI, PROOF1, 50, 2);
        mods.mintAuthorized(alice, URI, SneakerMods.ModTraits(0, 60, 1, 5_000, 255, false, MOD1));
        vm.stopPrank();

        (uint256 sneakerXp, uint256 modXp, , , , ) = progress.xpBreakdown(alice);
        assertEq(sneakerXp, 100);
        assertEq(modXp, 40);
        assertEq(progress.xpOf(alice), 140);
        assertEq(progress.levelOf(alice), 1);
    }

    function testLifetimeEarnedCountsOnClaim() public {
        vm.prank(admin);
        nft.mintAuthorized(alice, URI, PROOF1, 50, 2);

        vm.startPrank(alice);
        game.activate(1);
        vm.warp(block.timestamp + 1 hours);
        game.claimPoints(1);
        vm.stopPrank();

        uint256 earned = game.lifetimeEarned(alice);
        assertGt(earned, 0);
        (, , uint256 veRuneXp, , , ) = progress.xpBreakdown(alice);
        // veRUNE XP = floor(lifetime / 1000 veRUNE) * 10 — small for a 1h accrual.
        assertEq(veRuneXp, earned / 100 ether);
    }

    function testMarketplaceTradeCounter() public {
        vm.prank(admin);
        nft.mintAuthorized(alice, URI, PROOF1, 50, 2);

        vm.startPrank(alice);
        nft.approve(address(marketplace), 1);
        marketplace.list(address(nft), 1, 1 ether);
        vm.stopPrank();

        vm.prank(bob);
        marketplace.buy{value: 1 ether}(1);

        assertEq(marketplace.tradesCount(alice), 1);
        assertEq(marketplace.tradesCount(bob), 1);
        // Both sides earned 60 XP; bob now owns the sneaker (+100).
        assertEq(progress.xpOf(alice), 60);
        assertEq(progress.xpOf(bob), 60 + 100);
    }

    function testWorkshopActionCounter() public {
        vm.startPrank(admin);
        nft.mintAuthorized(alice, URI, PROOF1, 50, 2);
        mods.mintAuthorized(alice, URI, SneakerMods.ModTraits(1, 60, 1, 2_500, 255, false, MOD1));
        vm.stopPrank();

        vm.startPrank(alice);
        mods.approve(address(workshop), 1);
        workshop.equip(1, 1);
        workshop.unequip(1, 1); // slot 1 = Upper
        vm.stopPrank();

        assertEq(workshop.actionsCount(alice), 2);
        (, , , , uint256 workshopXp, ) = progress.xpBreakdown(alice);
        assertEq(workshopXp, 60);
    }

    function testStakedPolXp() public {
        vm.prank(alice);
        staking.depositPOL{value: 5 ether}();

        (, , , , , uint256 stakingXp) = progress.xpBreakdown(alice);
        assertEq(stakingXp, 100); // 5 POL * 20 XP
    }

    // ─────────── Levels ───────────

    function testLevelBoundaries() public {
        assertEq(progress.levelOf(alice), 1);

        vm.startPrank(admin);
        // 3 sneakers = 300 XP → level 2
        nft.mintAuthorized(alice, URI, PROOF1, 50, 2);
        nft.mintAuthorized(alice, URI, keccak256("p2"), 50, 2);
        nft.mintAuthorized(alice, URI, keccak256("p3"), 50, 2);
        vm.stopPrank();
        assertEq(progress.xpOf(alice), 300);
        assertEq(progress.levelOf(alice), 2);

        // 5 more sneakers (800 XP total) → level 3
        vm.startPrank(admin);
        nft.mintAuthorized(alice, URI, keccak256("p4"), 50, 2);
        nft.mintAuthorized(alice, URI, keccak256("p5"), 50, 2);
        nft.mintAuthorized(alice, URI, keccak256("p6"), 50, 2);
        nft.mintAuthorized(alice, URI, keccak256("p7"), 50, 2);
        nft.mintAuthorized(alice, URI, keccak256("p8"), 50, 2);
        vm.stopPrank();
        assertEq(progress.levelOf(alice), 3);
    }

    function testProgressOfSnapshot() public {
        vm.prank(admin);
        nft.mintAuthorized(alice, URI, PROOF1, 50, 2);

        (uint256 xp, uint8 level, uint256 currentLevelXp, uint256 nextLevelXp) = progress.progressOf(alice);
        assertEq(xp, 100);
        assertEq(level, 1);
        assertEq(currentLevelXp, 0);
        assertEq(nextLevelXp, 300);
    }

    function testLevelDropsWhenNftSold() public {
        // XP derives from live state: selling NFTs lowers the level.
        vm.startPrank(admin);
        nft.mintAuthorized(alice, URI, PROOF1, 50, 2);
        nft.mintAuthorized(alice, URI, keccak256("p2"), 50, 2);
        nft.mintAuthorized(alice, URI, keccak256("p3"), 50, 2);
        vm.stopPrank();
        assertEq(progress.levelOf(alice), 2);

        vm.prank(alice);
        nft.transferFrom(alice, bob, 1);
        assertEq(progress.levelOf(alice), 1);
    }

    // ─────────── Profile ───────────

    function testSetUsername() public {
        vm.prank(alice);
        progress.setUsername("SpeedyAlice");
        assertEq(progress.usernames(alice), "SpeedyAlice");
    }

    function testUsernameLengthBounds() public {
        vm.prank(alice);
        vm.expectRevert("PlayerProgress: bad username length");
        progress.setUsername("ab");
        vm.prank(alice);
        vm.expectRevert("PlayerProgress: bad username length");
        progress.setUsername("this-name-is-way-too-long-x");
    }

    function testSetNftAvatarRequiresOwnership() public {
        vm.prank(admin);
        nft.mintAuthorized(alice, URI, PROOF1, 50, 2);

        vm.prank(bob);
        vm.expectRevert("PlayerProgress: not token owner");
        progress.setNftAvatar(address(nft), 1);

        vm.prank(alice);
        progress.setNftAvatar(address(nft), 1);
        assertEq(progress.avatarCollection(alice), address(nft));
        assertEq(progress.avatarTokenId(alice), 1);

        // Selling the NFT does not auto-clear — callers re-assert on read.
        vm.prank(alice);
        progress.setNftAvatar(address(0), 0);
        assertEq(progress.avatarCollection(alice), address(0));
    }

    // ─────────── Level-gated skill NFTs ───────────

    function testPlayerLevelSkillClaim() public {
        // Skill achievement: level 2 required, mints a SLOT_SKILL mod.
        vm.prank(admin);
        uint256 achId = mods.addAchievement(
            SneakerMods.Achievement(SneakerMods.ReqKind.PlayerLevel, 2, 6, 80, 2, 1_500, 255, false, URI, false)
        );

        // Level 1 → claim reverts.
        vm.prank(alice);
        vm.expectRevert("SneakerMods: requirement not met");
        mods.claim(achId, 0);
        assertFalse(mods.meetsRequirement(achId, alice, 0));

        // 3 sneakers = 300 XP → level 2 → free claim succeeds, once.
        vm.startPrank(admin);
        nft.mintAuthorized(alice, URI, PROOF1, 50, 2);
        nft.mintAuthorized(alice, URI, keccak256("p2"), 50, 2);
        nft.mintAuthorized(alice, URI, keccak256("p3"), 50, 2);
        vm.stopPrank();

        assertTrue(mods.meetsRequirement(achId, alice, 0));
        vm.prank(alice);
        uint256 skillId = mods.claim(achId, 0);
        SneakerMods.ModTraits memory t = mods.traitsOf(skillId);
        assertEq(t.slot, mods.SLOT_SKILL());
        assertEq(t.effectBps, 1_500);

        vm.prank(alice);
        vm.expectRevert("SneakerMods: already claimed");
        mods.claim(achId, 0);
    }

    function testSkillSlotFeedsEarnRate() public {
        // An equipped skill mod adds its effectBps to the earn bonus.
        vm.startPrank(admin);
        nft.mintAuthorized(alice, URI, PROOF1, 50, 2);
        mods.mintAuthorized(alice, URI, SneakerMods.ModTraits(6, 80, 2, 1_500, 255, false, MOD1));
        vm.stopPrank();

        vm.startPrank(alice);
        mods.approve(address(workshop), 1);
        workshop.equip(1, 1);
        vm.stopPrank();

        assertEq(workshop.skillBonusBps(1), 1_500);
        // earnBonusBps = upper (0) + skill (1500) + forge (0)
        assertEq(workshop.earnBonusBps(1), 1_500);
    }

    // ─────────── Admin / thresholds ───────────

    function testThresholdValidation() public {
        uint256[] memory bad = new uint256[](3);
        bad[0] = 100; // must start at 0
        bad[1] = 300;
        bad[2] = 800;
        vm.expectRevert("PlayerProgress: level 1 must be free");
        new PlayerProgress(admin, address(nft), address(mods), address(game), address(marketplace), address(workshop), address(staking), bad);

        uint256[] memory flat = new uint256[](3);
        flat[0] = 0;
        flat[1] = 300;
        flat[2] = 300; // must increase
        vm.expectRevert("PlayerProgress: thresholds must increase");
        new PlayerProgress(admin, address(nft), address(mods), address(game), address(marketplace), address(workshop), address(staking), flat);
    }

    function testAdminCanUpdateThresholds() public {
        uint256[] memory next = new uint256[](2);
        next[0] = 0;
        next[1] = 50;
        vm.prank(alice);
        vm.expectRevert();
        progress.setLevelThresholds(next);

        vm.prank(admin);
        progress.setLevelThresholds(next);
        assertEq(progress.thresholds().length, 2);
    }
}
