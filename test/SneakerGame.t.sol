// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {SneakerMint} from "../contracts/SneakerMint.sol";
import {RENToken} from "../contracts/RENToken.sol";
import {SneakerGame} from "../contracts/SneakerGame.sol";

contract SneakerGameTest is Test {
    SneakerMint nft;
    RENToken ren;
    SneakerGame game;

    address admin = address(0xA11CE);
    address alice = address(0xA1);

    bytes32 constant PROOF1 = keccak256("game-proof-1");
    bytes32 constant PROOF2 = keccak256("game-proof-2");
    string constant URI = "data:application/json;base64,eyJuYW1lIjoiVGVzdCJ9";

    // Tier base points per day (18-decimal veRUNE): Common 100, Rare 200, Epic 400, Mythic 800
    uint256[4] tierBase = [uint256(100 ether), 200 ether, 400 ether, 800 ether];
    uint256 streakStep = 100; // +1% per streak day
    uint16 maxDurability = 10;
    uint16 wearPerActivation = 1;
    uint256 repairCost = 50 ether; // 50 veRUNE
    uint256 redemptionRate = 100 ether; // 100 veRUNE = 1 REN

    function setUp() public {
        nft = new SneakerMint("Airen Sneakers", "ASNEAK", admin);
        ren = new RENToken(admin, admin);
        game = new SneakerGame(
            admin,
            address(nft),
            address(ren),
            tierBase,
            streakStep,
            maxDurability,
            wearPerActivation,
            repairCost,
            redemptionRate
        );

        vm.startPrank(admin);
        nft.mintAuthorized(alice, URI, PROOF1, 50, 2); // Epic
        nft.mintAuthorized(alice, URI, PROOF2, 90, 3); // Mythic
        vm.stopPrank();
    }

    // ─────────── Constructor ───────────

    function test_Constructor_SetsParams() public view {
        assertEq(address(game.nft()), address(nft));
        assertEq(address(game.renToken()), address(ren));
        assertEq(game.maxDurability(), maxDurability);
        assertEq(game.wearPerActivation(), wearPerActivation);
        assertEq(game.redemptionRate(), redemptionRate);
        assertFalse(game.redemptionEnabled());
    }

    function test_Constructor_RevertZeroAdmin() public {
        vm.expectRevert("SneakerGame: zero admin");
        new SneakerGame(address(0), address(nft), address(ren), tierBase, streakStep, maxDurability, wearPerActivation, repairCost, redemptionRate);
    }

    function test_Constructor_RevertZeroDurability() public {
        vm.expectRevert("SneakerGame: zero durability");
        new SneakerGame(admin, address(nft), address(ren), tierBase, streakStep, 0, wearPerActivation, repairCost, redemptionRate);
    }

    // ─────────── Activation ───────────

    function test_Activate_StartsStreakAndWearsDurability() public {
        vm.prank(alice);
        game.activate(1);
        (, , uint32 streak, uint16 durability, , , , ) = game.sneakers(1);
        assertEq(streak, 1);
        assertEq(durability, maxDurability - wearPerActivation);
    }

    function test_Activate_RevertNotOwner() public {
        vm.prank(admin);
        vm.expectRevert("SneakerGame: not owner");
        game.activate(1);
    }

    function test_Activate_RevertCooldown() public {
        vm.prank(alice);
        game.activate(1);
        vm.warp(block.timestamp + 23 hours);
        vm.prank(alice);
        vm.expectRevert("SneakerGame: activation cooldown");
        game.activate(1);
    }

    function test_Activate_AfterCooldownBuildsStreak() public {
        vm.prank(alice);
        game.activate(1);
        vm.warp(block.timestamp + 25 hours);
        vm.prank(alice);
        game.activate(1);
        (, , uint32 streak, , , , , ) = game.sneakers(1);
        assertEq(streak, 2);
    }

    function test_Activate_AfterBreakResetsStreak() public {
        vm.prank(alice);
        game.activate(1);
        vm.warp(block.timestamp + 3 days); // beyond 48h window
        vm.prank(alice);
        game.activate(1);
        (, , uint32 streak, , , , , ) = game.sneakers(1);
        assertEq(streak, 1);
    }

    function test_Activate_RevertWornOut() public {
        // With 1 wear + ~1 day of health decay per 25h cycle the sneaker dies
        // after ~5 daily activations.
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(alice);
            game.activate(1);
            vm.warp(block.timestamp + 25 hours);
        }
        assertEq(game.healthOf(1), 0);
        vm.prank(alice);
        vm.expectRevert("SneakerGame: sneaker worn out");
        game.activate(1);
    }

    // ─────────── Points accrual ───────────

    function test_PendingPoints_AccrueWhileActive() public {
        vm.prank(alice);
        game.activate(1);
        // Epic base 400/day at 1x streak; after 12h: ~200 points
        vm.warp(block.timestamp + 12 hours);
        uint256 pending = game.pendingPoints(1);
        assertApproxEqRel(pending, 200 ether, 0.01e18); // within 1%
    }

    function test_PendingPoints_StopAfter24hWindow() public {
        vm.prank(alice);
        game.activate(1);
        vm.warp(block.timestamp + 48 hours);
        // Points stop accruing after the 24h active window
        uint256 pending = game.pendingPoints(1);
        assertApproxEqRel(pending, 400 ether, 0.01e18); // exactly 1 day of Epic points
    }

    function test_PendingPoints_StreakIncreasesRate() public {
        vm.prank(alice);
        game.activate(1);
        vm.warp(block.timestamp + 25 hours);
        vm.prank(alice);
        game.activate(1); // streak = 2, +1% rate; accrues the previous 24h window (~400)

        vm.warp(block.timestamp + 12 hours);
        uint256 pending = game.pendingPoints(1);
        // previous window 400 + new window 400/day * 1.01 * 0.5 day = 400 + 202 = 602
        assertApproxEqRel(pending, 602 ether, 0.01e18);
    }

    function test_PendingPoints_ZeroWhenWornOut() public {
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(alice);
            game.activate(1);
            vm.warp(block.timestamp + 25 hours);
        }
        // Already-earned points remain claimable, but no further accrual happens.
        uint256 before = game.pendingPoints(1);
        vm.warp(block.timestamp + 48 hours);
        assertEq(game.pendingPoints(1), before);
    }

    function test_EarnRatePerSecond_ZeroBeforeActivation() public view {
        assertEq(game.earnRatePerSecond(1), 0);
    }

    // ─────────── Claim ───────────

    function test_ClaimPoints_AddsToBalance() public {
        vm.prank(alice);
        game.activate(1);
        vm.warp(block.timestamp + 24 hours);

        vm.prank(alice);
        game.claimPoints(1);
        assertApproxEqRel(game.veRuneBalance(alice), 400 ether, 0.01e18);

        (, , , , uint256 pending, , , ) = game.sneakers(1);
        assertEq(pending, 0);
    }

    function test_ClaimPoints_RevertNotOwner() public {
        vm.prank(alice);
        game.activate(1);
        vm.warp(block.timestamp + 24 hours);
        vm.prank(admin);
        vm.expectRevert("SneakerGame: not owner");
        game.claimPoints(1);
    }

    // ─────────── Repair ───────────

    function test_Repair_RestoresDurability() public {
        // Give alice enough veRUNE by claiming from another sneaker
        vm.startPrank(alice);
        game.activate(2);
        vm.warp(block.timestamp + 24 hours);
        game.claimPoints(2); // Mythic: 800 points/day -> 800 veRUNE
        vm.stopPrank();

        // Wear sneaker 1 down
        vm.startPrank(alice);
        game.activate(1);
        vm.warp(block.timestamp + 25 hours);
        game.activate(1);
        vm.stopPrank();

        uint256 balanceBefore = game.veRuneBalance(alice);
        vm.prank(alice);
        game.repair(1);

        (, , , uint16 durability, , , , ) = game.sneakers(1);
        assertEq(durability, maxDurability);
        assertEq(game.veRuneBalance(alice), balanceBefore - repairCost);
    }

    function test_Repair_RevertInsufficientVeRune() public {
        vm.prank(alice);
        game.activate(1);
        vm.prank(alice);
        vm.expectRevert("SneakerGame: insufficient veRUNE");
        game.repair(1);
    }

    // ─────────── Redemption ───────────

    function test_Redeem_RevertWhenDisabled() public {
        vm.prank(alice);
        game.activate(1);
        vm.warp(block.timestamp + 24 hours);
        vm.prank(alice);
        game.claimPoints(1);

        vm.prank(alice);
        vm.expectRevert("SneakerGame: redemption disabled");
        game.redeem(100 ether);
    }

    function test_Redeem_ConvertsPointsToREN() public {
        // Fund and enable redemption
        vm.startPrank(admin);
        ren.mint(admin, 1000 ether);
        ren.approve(address(game), type(uint256).max);
        game.fundREN(1000 ether);
        game.setRedemptionEnabled(true);
        vm.stopPrank();

        vm.prank(alice);
        game.activate(1);
        vm.warp(block.timestamp + 24 hours);
        vm.prank(alice);
        game.claimPoints(1); // ~400 veRUNE

        uint256 balance = game.veRuneBalance(alice);
        assertGt(balance, 0);

        uint256 before = ren.balanceOf(alice);
        vm.prank(alice);
        game.redeem(balance);

        // REN received = floor(points / redemptionRate) — integer division.
        uint256 expectedRen = balance / redemptionRate;
        assertGt(expectedRen, 0);
        assertEq(ren.balanceOf(alice), before + expectedRen);
        assertEq(game.veRuneBalance(alice), 0);
        assertGt(ren.balanceOf(alice), before);
    }

    function test_Redeem_RevertInsufficientBalance() public {
        vm.prank(admin);
        game.setRedemptionEnabled(true);
        vm.prank(alice);
        vm.expectRevert("SneakerGame: insufficient veRUNE");
        game.redeem(1 ether);
    }

    // ─────────── Views ───────────

    function test_StreakMultiplierBps() public view {
        assertEq(game.streakMultiplierBps(1), 10_000);
        assertEq(game.streakMultiplierBps(2), 10_100);
        assertEq(game.streakMultiplierBps(51), 15_000); // capped at +50%
        assertEq(game.streakMultiplierBps(100), 15_000);
    }

    function test_CanActivate() public {
        assertTrue(game.canActivate(1));
        vm.prank(alice);
        game.activate(1);
        assertFalse(game.canActivate(1));
        vm.warp(block.timestamp + 25 hours);
        assertTrue(game.canActivate(1));
    }

    // ─────────── Power (rarity-scaled mining) ───────────

    function test_Power_ScalesWithRarity() public view {
        // Sneaker 1: Epic r50 → 400 * (5000 + 50*100)/10000 = 400/day (1.0x)
        assertEq(game.powerOf(1), 400 ether);
        // Sneaker 2: Mythic r90 → 800 * (5000 + 90*100)/10000 = 1120/day (1.4x)
        assertEq(game.powerOf(2), 1120 ether);
    }

    function test_Power_RarityScalesEarnRate() public {
        vm.prank(alice);
        game.activate(2); // Mythic r90 → 1120/day
        vm.warp(block.timestamp + 1 days);
        assertApproxEqRel(game.pendingPoints(2), 1120 ether, 0.01e18);
    }

    // ─────────── Health (time decay) ───────────

    function test_Health_DecaysOverTime() public {
        vm.prank(alice);
        game.activate(1); // health 10 - 1 wear = 9
        vm.warp(block.timestamp + 3 days);
        assertEq(game.healthOf(1), 6); // 9 - 3 days decay
    }

    function test_Health_DecayBlocksActivation() public {
        vm.prank(alice);
        game.activate(1);
        vm.warp(block.timestamp + 10 days); // 9 health - 10 days → dead
        assertEq(game.healthOf(1), 0);
        assertFalse(game.canActivate(1));
        assertEq(game.earnRatePerSecond(1), 0);
    }

    function test_Health_RepairResetsDecayClock() public {
        // Fund alice with veRUNE from sneaker 2.
        vm.startPrank(alice);
        game.activate(2);
        vm.warp(block.timestamp + 24 hours);
        game.claimPoints(2);
        game.activate(1);
        vm.warp(block.timestamp + 5 days);
        game.repair(1);
        vm.stopPrank();
        assertEq(game.healthOf(1), maxDurability);
        vm.warp(block.timestamp + 2 days);
        assertEq(game.healthOf(1), maxDurability - 2); // decay restarts from repair
    }

    // ─────────── Energy ───────────

    function test_Energy_CapacityAndRefill() public {
        // r50 → maxEnergy = 2 + 50/20 = 4; r90 → 2 + 90/20 = 6
        assertEq(game.maxEnergyOf(1), 4);
        assertEq(game.maxEnergyOf(2), 6);
        // Fresh sneaker reports full energy before first activation.
        assertEq(game.energyOf(1), 4);
        vm.prank(alice);
        game.activate(1);
        assertEq(game.energyOf(1), 4);
    }

    function test_Energy_SpendEnergy_RevertNotWorkshop() public {
        vm.prank(alice);
        game.activate(1);
        vm.prank(alice);
        vm.expectRevert("SneakerGame: not workshop");
        game.spendEnergy(1, 1);
    }

    function test_ActivateFromWorkshop_RevertNotWorkshop() public {
        vm.prank(alice);
        vm.expectRevert("SneakerGame: not workshop");
        game.activateFromWorkshop(1, alice);
    }
}
