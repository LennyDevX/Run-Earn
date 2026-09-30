// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {SneakerVault} from "../contracts/SneakerVault.sol";
import {SneakerMint} from "../contracts/SneakerMint.sol";
import {SneakerMods} from "../contracts/SneakerMods.sol";
import {SneakerGame} from "../contracts/SneakerGame.sol";
import {SneakerStaking} from "../contracts/SneakerStaking.sol";
import {SneakerWorkshop} from "../contracts/SneakerWorkshop.sol";
import {PlayerProgress} from "../contracts/PlayerProgress.sol";
import {RENToken} from "../contracts/RENToken.sol";

/// Minimal marketplace stub so PlayerProgress can read tradesCount.
contract MockMarketplace {
    mapping(address user => uint256 trades) public tradesCount;
}

contract SneakerVaultTest is Test {
    SneakerVault vault;
    SneakerMint nft;
    SneakerMods mods;
    SneakerGame game;
    SneakerStaking staking;
    SneakerWorkshop workshop;
    PlayerProgress progress;
    RENToken ren;

    address admin;
    address user;
    address minter;

    uint256 constant DISCOUNT_PERK = 0;
    uint256 constant ACCESS_PERK = 0;

    function setUp() public {
        admin = makeAddr("admin");
        user = makeAddr("user");
        minter = makeAddr("minter");

        ren = new RENToken(admin, minter);
        nft = new SneakerMint("Airen Sneakers", "ASNEAK", admin);
        staking = new SneakerStaking(
            admin,
            address(nft),
            address(ren),
            1_000 ether, // rewardTokensPerNftYear
            280, // baseApyBps
            0, // perNftBonusBps
            800, // maxApyBps
            [uint64(50), 80, 150, 180],
            2_592_000 // minLockSeconds
        );
        game = new SneakerGame(
            admin,
            address(nft),
            address(ren),
            [uint256(100 ether), 200 ether, 400 ether, 800 ether],
            100, // streakBonusStepBps
            100, // maxDurability
            1, // wearPerActivation
            50 ether, // repairCostPoints
            100 ether // redemptionRate
        );
        mods = new SneakerMods("Airen Mods", "AMOD", admin, address(nft), address(game), address(staking));
        workshop = new SneakerWorkshop(
            admin,
            address(nft),
            address(mods),
            address(game),
            address(staking),
            5_000, // conditionFloorBps (50% at full wear)
            365 days // seasonSeconds
        );
        uint256[] memory thresholds = new uint256[](10);
        thresholds[0] = 0;
        thresholds[1] = 300;
        thresholds[2] = 800;
        thresholds[3] = 1_600;
        thresholds[4] = 2_800;
        thresholds[5] = 4_500;
        thresholds[6] = 7_000;
        thresholds[7] = 10_500;
        thresholds[8] = 15_000;
        thresholds[9] = 21_000;
        MockMarketplace marketplace = new MockMarketplace();
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

        vault = new SneakerVault(
            admin,
            address(nft),
            address(mods),
            address(nft), // sneakerTraits = SneakerMint.traitsOf
            address(workshop),
            address(staking),
            address(progress)
        );

        // Mint a Mythic sneaker to user for tier-gate tests.
        vm.startPrank(admin);
        nft.grantRole(nft.MINTER_ROLE(), minter);
        vm.stopPrank();
        vm.startPrank(minter);
        nft.mintAuthorized(user, "ipfs://mythic", keccak256("proof1"), 85, 3);
        vm.stopPrank();
    }

    function test_SetPerk_DiscountStoresConfig() public {
        vm.prank(admin);
        vault.setPerk(DISCOUNT_PERK, uint8(0), 1_000, 3, 0, 0, 0, 0, true);
        (
            uint8 kind,
            uint16 valueBps,
            uint8 minTier,
            uint8 requiredLevel,
            uint256 minPolStaked,
            uint16 minConditionBps,
            uint256 minModCount,
            bool active
        ) = vault.perks(DISCOUNT_PERK);
        assertEq(kind, 0);
        assertEq(valueBps, 1_000);
        assertEq(minTier, 3);
        assertEq(requiredLevel, 0);
        assertEq(minPolStaked, 0);
        assertEq(minConditionBps, 0);
        assertEq(minModCount, 0);
        assertTrue(active);
    }

    function test_SetPerk_DiscountOverCap_Reverts() public {
        vm.prank(admin);
        vm.expectRevert("SneakerVault: discount out of range");
        vault.setPerk(DISCOUNT_PERK, uint8(0), 5_001, 0, 0, 0, 0, 0, true);
    }

    function test_SetPerk_GapInIds_Reverts() public {
        vm.prank(admin);
        vm.expectRevert("SneakerVault: perk ids must be sequential");
        vault.setPerk(1, uint8(0), 1_000, 0, 0, 0, 0, 0, true);
    }

    function test_SetPerk_TooManyPerks_Reverts() public {
        vm.prank(admin);
        vm.expectRevert("SneakerVault: perk limit reached");
        vault.setPerk(16, uint8(0), 1_000, 0, 0, 0, 0, 0, true);
    }

    function test_SetPerk_InvalidKind_Reverts() public {
        vm.prank(admin);
        vm.expectRevert("SneakerVault: invalid kind");
        vault.setPerk(DISCOUNT_PERK, 99, 1_000, 0, 0, 0, 0, 0, true);
    }

    function test_SetPerk_InvalidTier_Reverts() public {
        vm.prank(admin);
        vm.expectRevert("SneakerVault: invalid tier");
        vault.setPerk(DISCOUNT_PERK, uint8(0), 1_000, 4, 0, 0, 0, 0, true);
    }

    function test_Discount_EligibleByTier() public {
        vm.prank(admin);
        vault.setPerk(DISCOUNT_PERK, uint8(0), 1_000, 3, 0, 0, 0, 0, true);
        assertEq(vault.discountBps(user, DISCOUNT_PERK), 1_000);
        assertEq(vault.bestDiscountBps(user), 1_000);
        assertTrue(vault.isEligible(user, DISCOUNT_PERK));
    }

    function test_Discount_TierTooLow_ReturnsZero() public {
        // user has tier 3 (Mythic); require tier >= 3 passes, but a wallet
        // without any sneaker should not qualify.
        address nobody = makeAddr("nobody");
        vm.prank(admin);
        vault.setPerk(DISCOUNT_PERK, uint8(0), 1_000, 3, 0, 0, 0, 0, true);
        assertEq(vault.discountBps(nobody, DISCOUNT_PERK), 0);
    }

    function test_Discount_InactivePerk_ReturnsZero() public {
        vm.prank(admin);
        vault.setPerk(DISCOUNT_PERK, uint8(0), 1_000, 3, 0, 0, 0, 0, false);
        assertEq(vault.discountBps(user, DISCOUNT_PERK), 0);
    }

    function test_Discount_LevelGate_BlocksLowLevel() public {
        vm.prank(admin);
        vault.setPerk(DISCOUNT_PERK, uint8(0), 1_000, 3, 5, 0, 0, 0, true);
        // user has tier 3 but level 0 < 5
        assertEq(vault.discountBps(user, DISCOUNT_PERK), 0);
    }

    function test_Discount_ConditionGate_PassesOnPristineSneaker() public {
        // An untouched pair reads pristine, so a care gate passes.
        vm.prank(admin);
        vault.setPerk(DISCOUNT_PERK, uint8(0), 1_000, 0, 0, 0, 9_000, 0, true);
        assertEq(vault.discountBps(user, DISCOUNT_PERK), 1_000);
    }

    function test_Discount_ConditionGate_BlocksWornSneaker() public {
        // Equipping starts the pair's season, so wear begins.
        vm.prank(admin);
        mods.mintAuthorized(user, "ipfs://sole", SneakerMods.ModTraits(0, 10, 0, 0, 255, false, keccak256("sole")));
        vm.prank(user);
        mods.approve(address(workshop), 1);
        vm.prank(user);
        workshop.equip(1, 1);

        vm.warp(block.timestamp + 365 days);
        assertEq(workshop.conditionBps(1), 5_000);

        // An 80% care gate rejects a pair sitting at the 50% wear floor.
        vm.prank(admin);
        vault.setPerk(DISCOUNT_PERK, uint8(0), 1_000, 0, 0, 0, 8_000, 0, true);
        assertEq(vault.discountBps(user, DISCOUNT_PERK), 0);
    }

    function test_Discount_PolGate_BlocksUnstaked() public {
        vm.prank(admin);
        vault.setPerk(DISCOUNT_PERK, uint8(0), 1_000, 3, 0, 1 ether, 0, 0, true);
        // user has tier 3 but no POL staked
        assertEq(vault.discountBps(user, DISCOUNT_PERK), 0);
    }

    function test_Discount_ModGate_BlocksNoMods() public {
        vm.prank(admin);
        vault.setPerk(DISCOUNT_PERK, uint8(0), 1_000, 3, 0, 0, 0, 1, true);
        // user has tier 3 but zero mods
        assertEq(vault.discountBps(user, DISCOUNT_PERK), 0);
    }

    function test_BestDiscount_PicksHighestEligible() public {
        vm.startPrank(admin);
        vault.setPerk(0, uint8(0), 500, 3, 0, 0, 0, 0, true);
        vault.setPerk(1, uint8(0), 1_500, 3, 0, 0, 0, 0, true);
        vm.stopPrank();
        assertEq(vault.bestDiscountBps(user), 1_500);
    }

    function test_BestDiscount_NoEligible_ReturnsZero() public view {
        assertEq(vault.bestDiscountBps(user), 0);
    }

    function test_ClaimPerk_AccessKind_SucceedsOnce() public {
        vm.prank(admin);
        vault.setPerk(ACCESS_PERK, uint8(1), 0, 3, 0, 0, 0, 0, true);
        vm.prank(user);
        vault.claimPerk(ACCESS_PERK);
        assertTrue(vault.accessClaimed(ACCESS_PERK, user));

        vm.prank(user);
        vm.expectRevert("SneakerVault: already claimed");
        vault.claimPerk(ACCESS_PERK);
    }

    function test_ClaimPerk_DiscountKind_Reverts() public {
        vm.prank(admin);
        vault.setPerk(DISCOUNT_PERK, uint8(0), 1_000, 3, 0, 0, 0, 0, true);
        vm.prank(user);
        vm.expectRevert("SneakerVault: not an access perk");
        vault.claimPerk(DISCOUNT_PERK);
    }

    function test_ClaimPerk_Inactive_Reverts() public {
        vm.prank(admin);
        vault.setPerk(ACCESS_PERK, uint8(1), 0, 3, 0, 0, 0, 0, false);
        vm.prank(user);
        vm.expectRevert("SneakerVault: perk inactive");
        vault.claimPerk(ACCESS_PERK);
    }

    function test_ClaimPerk_RequirementsNotMet_Reverts() public {
        address nobody = makeAddr("nobody");
        vm.prank(admin);
        vault.setPerk(ACCESS_PERK, uint8(1), 0, 3, 0, 0, 0, 0, true);
        vm.prank(nobody);
        vm.expectRevert("SneakerVault: requirements not met");
        vault.claimPerk(ACCESS_PERK);
    }

    function test_SetPerk_NonAdmin_Reverts() public {
        vm.expectRevert();
        vault.setPerk(DISCOUNT_PERK, uint8(0), 1_000, 0, 0, 0, 0, 0, true);
    }
}
